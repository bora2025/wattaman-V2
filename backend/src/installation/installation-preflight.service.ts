import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { PrismaService } from '../database/prisma.service';
import { readRuntimeConfig } from '../config/environment';
import { NotificationProviderConfig, readNotificationProviderConfig } from '../notification/notification-config';
import { PluginPackageVerifier } from '../plugins/plugin-package';
import { trustedPluginKeys } from '../plugins/plugin-config';

export interface PreflightCheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheckResult[];
}

export interface PreflightInput {
  locale: string;
  timezone: string;
  currency: string;
  acceptedLicenseVersion?: string;
  /** Base64-encoded plugin package (.zip) contents -- verified here, never installed here. */
  initialPlugins?: string[];
}

/**
 * B-011: preflight checks the interactive/unattended installer never ran before
 * (storage writability, provider reachability, locale/currency validity, license
 * acceptance). Only `database` and `storage:*` are hard blockers -- an optional
 * adapter being unreachable or a license not yet accepted must never block core
 * setup (DEC-001 is still `proposed`; email/SMS are optional per §13.6).
 */
@Injectable()
export class InstallationPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: PluginPackageVerifier,
  ) {}

  async run(input: PreflightInput): Promise<PreflightReport> {
    const checks: PreflightCheckResult[] = [
      await this.checkDatabase(),
      ...(await this.checkStorage()),
      this.checkLocale(input.locale, input.timezone, input.currency),
      ...(await this.checkProviders()),
      this.checkLicense(input.acceptedLicenseVersion),
      ...(await this.checkInitialPlugins(input.initialPlugins)),
    ];
    // Requested initial plugins are a genuine precondition for what the operator is trying to
    // do (unlike email/sms, which are optional best-effort adapters) -- an invalid or
    // incompatible package the operator explicitly asked for should fail loudly here, not be
    // silently skipped, same reasoning as database/storage.
    const blocking = checks.filter((check) => check.name === 'database' || check.name.startsWith('storage:') || check.name.startsWith('initialPlugin:'));
    return { ok: blocking.every((check) => check.ok), checks };
  }

  private async checkDatabase(): Promise<PreflightCheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { name: 'database', ok: true, detail: 'reachable' };
    } catch (error: any) {
      return { name: 'database', ok: false, detail: `unreachable: ${error?.message || error}` };
    }
  }

  private async checkStorage(): Promise<PreflightCheckResult[]> {
    const config = readRuntimeConfig();
    const dirs: Array<[string, string]> = [
      ['backup', config.backupDir],
      ['plugin', config.pluginDir],
      ['pluginData', config.pluginDataDir],
    ];
    return Promise.all(dirs.map(([name, dir]) => this.checkWritable(name, dir)));
  }

  private async checkWritable(name: string, dir: string): Promise<PreflightCheckResult> {
    const probe = path.join(dir, `.preflight-${randomUUID()}.tmp`);
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(probe, 'preflight');
      await fs.unlink(probe);
      return { name: `storage:${name}`, ok: true, detail: dir };
    } catch (error: any) {
      return { name: `storage:${name}`, ok: false, detail: `not writable (${dir}): ${error?.message || error}` };
    }
  }

  private checkLocale(locale: string, timezone: string, currency: string): PreflightCheckResult {
    try {
      if (Intl.getCanonicalLocales(locale).length === 0) throw new Error('locale must be a valid BCP-47 tag');
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(0);
      return { name: 'locale', ok: true, detail: `${locale}/${timezone}/${currency}` };
    } catch (error: any) {
      return { name: 'locale', ok: false, detail: error?.message || 'invalid locale, timezone, or currency' };
    }
  }

  private async checkProviders(): Promise<PreflightCheckResult[]> {
    let config: NotificationProviderConfig;
    try {
      config = readNotificationProviderConfig();
    } catch (error: any) {
      const detail = `notification configuration invalid: ${error?.message || error}`;
      return [
        { name: 'email', ok: false, detail },
        { name: 'sms', ok: false, detail },
      ];
    }
    return [await this.checkEmail(config), await this.checkSms(config)];
  }

  private async checkEmail(config: NotificationProviderConfig): Promise<PreflightCheckResult> {
    if (!config.email.enabled) return { name: 'email', ok: true, detail: 'not configured' };
    try {
      const response = await fetch('https://api.sendgrid.com/v3/user/account', {
        headers: { Authorization: `Bearer ${config.email.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return { name: 'email', ok: response.ok, detail: response.ok ? 'reachable' : `SendGrid returned ${response.status}` };
    } catch (error: any) {
      return { name: 'email', ok: false, detail: `unreachable: ${error?.message || error}` };
    }
  }

  private async checkSms(config: NotificationProviderConfig): Promise<PreflightCheckResult> {
    if (!config.sms.enabled) return { name: 'sms', ok: true, detail: 'not configured' };
    try {
      const auth = Buffer.from(`${config.sms.accountSid}:${config.sms.authToken}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sms.accountSid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(5000),
      });
      return { name: 'sms', ok: response.ok, detail: response.ok ? 'reachable' : `Twilio returned ${response.status}` };
    } catch (error: any) {
      return { name: 'sms', ok: false, detail: `unreachable: ${error?.message || error}` };
    }
  }

  /**
   * Validates each requested initial plugin package (signature, manifest, checksums, and
   * core-version compatibility via the same PluginPackageVerifier the marketplace install path
   * uses) without installing or activating anything -- no database writes, no files extracted.
   * Actually installing a verified package still requires a marketplace-authorized server-side
   * download once setup completes; this only proves upfront that deployment-CLI input is a
   * legitimate, compatible package.
   */
  private async checkInitialPlugins(base64Packages: string[] | undefined): Promise<PreflightCheckResult[]> {
    if (!base64Packages?.length) return [];
    const coreVersion = readRuntimeConfig().appVersion;
    const trustedKeys = await trustedPluginKeys();
    return Promise.all(base64Packages.map(async (encoded, index) => {
      const name = `initialPlugin:${index}`;
      // Buffer.from(str, 'base64') never throws -- it decodes leniently -- so a garbage input
      // simply produces a garbage buffer that verify() itself rejects (empty/not a zip/etc.)
      // with a clear message, rather than needing a separate base64-specific check here.
      try {
        const verified = await this.verifier.verify(Buffer.from(encoded, 'base64'), trustedKeys, coreVersion);
        return { name, ok: true, detail: `${verified.manifest.id}@${verified.manifest.version} verified, compatible with core ${coreVersion}` };
      } catch (error: any) {
        return { name, ok: false, detail: error?.message || 'plugin package failed verification' };
      }
    }));
  }

  private checkLicense(acceptedLicenseVersion?: string): PreflightCheckResult {
    return acceptedLicenseVersion
      ? { name: 'license', ok: true, detail: `accepted ${acceptedLicenseVersion}` }
      : { name: 'license', ok: true, detail: 'not yet accepted -- informational only, DEC-001 is not yet decided' };
  }
}
