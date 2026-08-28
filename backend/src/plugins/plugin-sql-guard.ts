import { BadRequestException } from '@nestjs/common';

/**
 * Shared by install-time migration validation (plugin-migrations.service.ts)
 * and live runtime queries (plugin-runtime.service.ts's database capability)
 * so both enforce the exact same "a plugin may only touch its own
 * plugin_<id>_ tables, never transaction/role/grant control" rule from one
 * place.
 */
export function assertNoForbiddenSql(sql: string, label: string) {
  if (/\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|CREATE\s+(?:ROLE|USER|EXTENSION)|ALTER\s+(?:ROLE|USER|SYSTEM)|COPY\b|PROGRAM\b|DO\s*\$|SET\s+ROLE|GRANT\b|REVOKE\b)\b/i.test(sql)) {
    throw new BadRequestException(`${label} contains a forbidden database operation`);
  }
}

export function assertPluginNamespace(pluginId: string, sql: string, label: string) {
  const namespace = `plugin_${pluginId.replace(/[^a-z0-9]/g, '_')}_`;
  const tableReferences = [...sql.matchAll(/\b(?:TABLE|INTO|UPDATE|FROM|JOIN|REFERENCES)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/gi)].map((match) => match[1].toLowerCase());
  if (!tableReferences.length || tableReferences.some((table) => !table.startsWith(namespace))) {
    throw new BadRequestException(`${label} may only access tables beginning with ${namespace}`);
  }
}
