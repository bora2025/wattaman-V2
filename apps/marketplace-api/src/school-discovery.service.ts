import { PrismaClient } from '@prisma/client';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { z } from 'zod';
import { HttpError } from './http-error';

/** Bounded so a hostile or broken gateway cannot hold an operator's request open. */
const REQUEST_TIMEOUT_MS = 8_000;

/** Discovery reads three small JSON documents; anything larger is not one of them. */
const MAX_RESPONSE_BYTES = 64 * 1024;

const discoverInput = z.object({
  gatewayOrigin: z.string().url().max(300),
  railwayProjectId: z.string().trim().min(1).max(100).optional(),
}).strict();

/**
 * The published shape of a school's public status endpoint. Parsed rather than trusted: a gateway
 * is a third party from this service's point of view, and everything below is displayed to an
 * operator who is about to make an identity decision from it.
 */
const statusDocument = z.object({
  state: z.enum(['ready', 'installed', 'legacy_unadopted']),
  installation: z.object({
    installationId: z.string().uuid(),
    schoolName: z.string().min(1).max(300),
    schoolSlug: z.string().min(1).max(200),
    locale: z.string().max(40).nullish(),
    timezone: z.string().max(80).nullish(),
    currency: z.string().max(10).nullish(),
    coreVersion: z.string().max(60).nullish(),
    installedAt: z.string().max(60).nullish(),
  }).nullable(),
}).passthrough();

const versionDocument = z.object({
  service: z.string().max(80).optional(),
  version: z.string().max(60).optional(),
  environment: z.string().max(40).optional(),
}).passthrough();

export type AdoptionOutcome = 'CREATE' | 'MATCH' | 'CONFLICT';

/**
 * Read-only discovery of a school that was deployed before Platform-first provisioning existed
 * (plan §8, Flow B).
 *
 * It calls only the three public, non-sensitive endpoints the plan names, and it exists so an
 * operator adopts a school from what the deployment actually says about itself rather than from
 * values retyped by hand. Nothing here writes; the decision it produces is presented for explicit
 * confirmation before anything is created.
 */
export class SchoolDiscoveryService {
  constructor(private readonly prisma: PrismaClient, private readonly fetchImpl: typeof fetch = fetch) {}

  async discover(value: unknown) {
    const input = discoverInput.parse(value);
    const origin = await this.safeOrigin(input.gatewayOrigin);

    const [status, version, ready] = await Promise.all([
      this.getJson(`${origin}/api/installation/status`),
      this.getJson(`${origin}/api/version`).catch(() => null),
      this.getJson(`${origin}/api/health/ready`).catch(() => null),
    ]);

    const parsed = statusDocument.safeParse(status);
    if (!parsed.success) throw new HttpError(422, 'That gateway did not return a Wattanam installation status document');
    const detected = parsed.data;
    if (detected.state !== 'installed' || !detected.installation) {
      throw new HttpError(409, `That school reports state "${detected.state}" and has no installation identity to adopt`);
    }

    const versionInfo = versionDocument.safeParse(version ?? {});
    const school = detected.installation;
    const candidates = await this.candidates(school.schoolSlug, origin, input.railwayProjectId, school.installationId);

    return {
      gatewayOrigin: origin,
      railwayProjectId: input.railwayProjectId ?? null,
      reachable: true,
      ready: (ready as { status?: string } | null)?.status === 'ready',
      detected: {
        installationId: school.installationId,
        schoolName: school.schoolName,
        schoolSlug: school.schoolSlug,
        locale: school.locale ?? null,
        timezone: school.timezone ?? null,
        currency: school.currency ?? null,
        coreVersion: school.coreVersion ?? null,
        installedAt: school.installedAt ?? null,
        service: versionInfo.success ? versionInfo.data.service ?? null : null,
        environment: versionInfo.success ? versionInfo.data.environment ?? null : null,
      },
      ...candidates,
    };
  }

  /**
   * Resolves which directory record, if any, this deployment belongs to.
   *
   * Three identifiers can each point at a record: slug, Railway project, and gateway. When they
   * disagree the answer is `CONFLICT` and adoption stops — the plan is explicit that identifiers
   * pointing at different schools must never be guessed at or merged (§8 Stage B3).
   */
  private async candidates(slug: string, gatewayOrigin: string, railwayProjectId: string | undefined, installationId: string) {
    const [bySlug, byProject, byGateway, registration] = await Promise.all([
      this.prisma.customerSchool.findUnique({ where: { slug }, select: SUMMARY }),
      railwayProjectId ? this.prisma.customerSchool.findUnique({ where: { railwayProjectId }, select: SUMMARY }) : null,
      this.prisma.customerSchool.findUnique({ where: { gatewayOrigin }, select: SUMMARY }),
      this.prisma.installationRegistration.findUnique({
        where: { installationId },
        select: { id: true, installationId: true, label: true, customerSchoolId: true, keys: { where: { revokedAt: null }, select: { keyFingerprint: true } } },
      }),
    ]);

    const matches = [bySlug, byProject, byGateway].filter((row): row is NonNullable<typeof row> => Boolean(row));
    const distinct = [...new Map(matches.map((row) => [row.id, row])).values()];
    const claimedElsewhere = registration?.customerSchoolId && !distinct.some((row) => row.id === registration.customerSchoolId);

    const reasons: string[] = [];
    if (distinct.length > 1) reasons.push('slug, Railway project, and gateway point at different customer schools');
    if (claimedElsewhere) reasons.push('this installation is already adopted by another customer school');

    const outcome: AdoptionOutcome = reasons.length > 0 ? 'CONFLICT' : distinct.length === 1 ? 'MATCH' : 'CREATE';
    return {
      outcome,
      conflictReasons: reasons,
      match: outcome === 'MATCH' ? distinct[0] : null,
      matchedBy: outcome === 'MATCH'
        ? { slug: bySlug?.id === distinct[0].id, railwayProjectId: byProject?.id === distinct[0].id, gatewayOrigin: byGateway?.id === distinct[0].id }
        : null,
      registration: registration
        ? {
          id: registration.id,
          installationId: registration.installationId,
          label: registration.label,
          adopted: Boolean(registration.customerSchoolId),
          activeKeyFingerprint: registration.keys[0]?.keyFingerprint ?? null,
        }
        : null,
    };
  }

  /**
   * SSRF defence (plan §13).
   *
   * The operator supplies this URL, and this process sits inside a private network with a cloud
   * metadata service on it, so an unchecked fetch here would be a request forgery primitive. Every
   * resolved address is checked, not just the hostname, because a hostname the operator controls
   * can resolve to anything at all.
   */
  private async safeOrigin(raw: string): Promise<string> {
    let url: URL;
    try { url = new URL(raw); } catch { throw new HttpError(400, 'gatewayOrigin must be a valid URL'); }
    if (url.protocol !== 'https:') throw new HttpError(400, 'gatewayOrigin must use HTTPS');
    if (url.pathname !== '/' || url.search || url.hash) throw new HttpError(400, 'gatewayOrigin must be an origin without a path, query, or fragment');
    if (url.username || url.password) throw new HttpError(400, 'gatewayOrigin must not carry credentials');

    const addresses = isIP(url.hostname)
      ? [{ address: url.hostname, family: isIP(url.hostname) }]
      : await lookup(url.hostname, { all: true }).catch(() => { throw new HttpError(400, 'gatewayOrigin does not resolve'); });
    if (addresses.length === 0) throw new HttpError(400, 'gatewayOrigin does not resolve');
    for (const { address } of addresses) {
      if (isBlockedAddress(address)) throw new HttpError(400, 'gatewayOrigin resolves to a non-public address');
    }
    return url.origin;
  }

  private async getJson(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        // A redirect is how a checked hostname becomes an unchecked one, so discovery never follows
        // one -- the operator's URL is the only address this service will talk to.
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
    } catch {
      throw new HttpError(502, 'That gateway could not be reached');
    }
    if (!response.ok) throw new HttpError(502, `That gateway responded with ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new HttpError(502, 'That gateway returned an unexpectedly large response');
    try { return JSON.parse(text); } catch { throw new HttpError(502, 'That gateway did not return JSON'); }
  }
}

const SUMMARY = { id: true, name: true, slug: true, status: true, railwayProjectId: true, gatewayOrigin: true } as const;

/** Loopback, private, link-local (including the cloud metadata address), and unique-local ranges. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, and 169.254.169.254 metadata
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === '::1' || value === '::') return true;
    if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true;
    // IPv4-mapped addresses carry a v4 address that must be judged by v4 rules.
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true;
}
