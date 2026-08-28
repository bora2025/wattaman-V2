import { NestFactory } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { readFileSync } from 'fs';
import path from 'path';
import { InstallationModule } from './installation.module';
import { InstallationService } from './installation.service';
import { InstallDto } from './dto/install.dto';

type FileReader = (file: string) => string;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function readUnattendedInstallInput(
  env: NodeJS.ProcessEnv = process.env,
  readFile: FileReader = (file) => readFileSync(file, 'utf8'),
): InstallDto {
  if (env.INSTALL_NON_INTERACTIVE !== 'true') {
    throw new Error('INSTALL_NON_INTERACTIVE=true is required');
  }
  const schoolSlug = required(env, 'INSTALL_SCHOOL_SLUG');
  if (required(env, 'INSTALL_CONFIRM_SLUG') !== schoolSlug) {
    throw new Error('INSTALL_CONFIRM_SLUG must exactly match INSTALL_SCHOOL_SLUG');
  }

  const passwordFile = env.INSTALL_OWNER_PASSWORD_FILE?.trim();
  if (passwordFile && env.INSTALL_OWNER_PASSWORD) {
    throw new Error('set only one of INSTALL_OWNER_PASSWORD_FILE or INSTALL_OWNER_PASSWORD');
  }
  if (passwordFile && env.NODE_ENV === 'production' && !path.isAbsolute(passwordFile)) {
    throw new Error('INSTALL_OWNER_PASSWORD_FILE must be absolute in production');
  }
  const ownerPassword = passwordFile
    ? readFile(path.resolve(passwordFile)).replace(/\r?\n$/, '')
    : required(env, 'INSTALL_OWNER_PASSWORD');

  return plainToInstance(InstallDto, {
    schoolName: required(env, 'INSTALL_SCHOOL_NAME'),
    schoolSlug,
    locale: env.INSTALL_LOCALE?.trim() || 'en-KH',
    timezone: env.INSTALL_TIMEZONE?.trim() || 'Asia/Phnom_Penh',
    currency: env.INSTALL_CURRENCY?.trim() || 'KHR',
    ownerName: required(env, 'INSTALL_OWNER_NAME'),
    ownerEmail: required(env, 'INSTALL_OWNER_EMAIL'),
    ownerPassword,
  });
}

export async function validateUnattendedInstallInput(dto: InstallDto) {
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) {
    const details = errors.flatMap((error) => Object.values(error.constraints || {}));
    throw new Error(`invalid unattended installation input: ${details.join('; ')}`);
  }
}

export function selectInstallDatabaseUrl(env: NodeJS.ProcessEnv, useIsolatedTarget: boolean): string | undefined {
  if (!useIsolatedTarget) return env.DATABASE_URL;
  const isolated = env.INSTALL_DATABASE_URL?.trim();
  if (!isolated) throw new Error('INSTALL_DATABASE_URL is required with --use-install-database-url');
  return isolated;
}

async function main() {
  const useIsolatedTarget = process.argv.includes('--use-install-database-url');
  process.env.DATABASE_URL = selectInstallDatabaseUrl(process.env, useIsolatedTarget);
  const dto = readUnattendedInstallInput();
  await validateUnattendedInstallInput(dto);
  const app = await NestFactory.createApplicationContext(InstallationModule, { logger: ['error', 'warn'] });
  try {
    const result = await app.get(InstallationService).install(dto);
    process.stdout.write(`${JSON.stringify({
      state: result.state,
      installationId: result.installation.installationId,
      schoolSlug: result.installation.schoolSlug,
      coreVersion: result.installation.coreVersion,
      installedAt: result.installation.installedAt,
    })}\n`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`ERROR: unattended installation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
