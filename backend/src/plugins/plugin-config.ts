import { InternalServerErrorException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { TrustedPluginKeys } from './plugin-package';

export function trustedPluginKeys(): TrustedPluginKeys {
  const keyFile = process.env.PLUGIN_TRUSTED_KEYS_FILE?.trim();
  const source = keyFile && existsSync(keyFile)
    ? readFileSync(keyFile, 'utf8')
    : process.env.PLUGIN_TRUSTED_KEYS || '{}';
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected an object');
    return parsed as TrustedPluginKeys;
  } catch (error) {
    throw new InternalServerErrorException(`Trusted plugin key configuration is invalid: ${(error as Error).message}`);
  }
}
