import {
  readUnattendedInstallInput,
  selectInstallDatabaseUrl,
  selectInstallMigrationSchema,
  validateUnattendedInstallInput,
} from './install-cli';

const valid: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  INSTALL_NON_INTERACTIVE: 'true',
  INSTALL_SCHOOL_NAME: 'Angkor School',
  INSTALL_SCHOOL_SLUG: 'angkor-school',
  INSTALL_CONFIRM_SLUG: 'angkor-school',
  INSTALL_OWNER_NAME: 'Owner',
  INSTALL_OWNER_EMAIL: 'owner@example.com',
  INSTALL_OWNER_PASSWORD: 'safe-password-123',
};

describe('unattended installation input', () => {
  it('uses Cambodia defaults and validates the shared DTO', async () => {
    const dto = readUnattendedInstallInput(valid);
    expect(dto).toMatchObject({ locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR' });
    await expect(validateUnattendedInstallInput(dto)).resolves.toBeUndefined();
  });

  it('requires an explicit non-interactive guard and exact slug confirmation', () => {
    expect(() => readUnattendedInstallInput({ ...valid, INSTALL_NON_INTERACTIVE: 'false' })).toThrow('INSTALL_NON_INTERACTIVE');
    expect(() => readUnattendedInstallInput({ ...valid, INSTALL_CONFIRM_SLUG: 'other-school' })).toThrow('exactly match');
  });

  it('reads a password file without retaining its newline', () => {
    const env = { ...valid, INSTALL_OWNER_PASSWORD: undefined, INSTALL_OWNER_PASSWORD_FILE: '/run/secrets/owner-password' };
    expect(readUnattendedInstallInput(env, () => 'safe-password-123\n').ownerPassword).toBe('safe-password-123');
  });

  it('refuses ambiguous password sources and relative production secret files', () => {
    expect(() => readUnattendedInstallInput({ ...valid, INSTALL_OWNER_PASSWORD_FILE: '/secret' })).toThrow('only one');
    expect(() => readUnattendedInstallInput({
      ...valid,
      NODE_ENV: 'production',
      INSTALL_OWNER_PASSWORD: undefined,
      INSTALL_OWNER_PASSWORD_FILE: './secret',
    })).toThrow('absolute');
  });

  it('uses the shared DTO password and slug policy', async () => {
    const dto = readUnattendedInstallInput({ ...valid, INSTALL_SCHOOL_SLUG: 'Bad Slug', INSTALL_CONFIRM_SLUG: 'Bad Slug' });
    await expect(validateUnattendedInstallInput(dto)).rejects.toThrow('lowercase letters');
  });

  it('omits initialPlugins entirely when no plugin files are configured', () => {
    expect(readUnattendedInstallInput(valid).initialPlugins).toBeUndefined();
  });

  it('reads initial plugin files as raw binary, base64-encoding each one for the shared DTO', async () => {
    const env = { ...valid, INSTALL_INITIAL_PLUGIN_FILES: 'plugin-a.zip, plugin-b.zip' };
    const binaries = { 'plugin-a.zip': Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff]), 'plugin-b.zip': Buffer.from([0x50, 0x4b, 0x05, 0x06]) };
    const readBinaryFile = (file: string) => binaries[file.split(/[\\/]/).pop() as keyof typeof binaries];
    const dto = readUnattendedInstallInput(env, undefined, readBinaryFile);
    expect(dto.initialPlugins).toEqual([
      binaries['plugin-a.zip'].toString('base64'),
      binaries['plugin-b.zip'].toString('base64'),
    ]);
    await expect(validateUnattendedInstallInput(dto)).resolves.toBeUndefined();
  });

  it('requires a distinct database reference for isolated validation', () => {
    expect(selectInstallDatabaseUrl({ DATABASE_URL: 'postgresql://production' }, false)).toBe('postgresql://production');
    expect(() => selectInstallDatabaseUrl({}, true)).toThrow('INSTALL_DATABASE_URL');
    expect(selectInstallDatabaseUrl({
      DATABASE_URL: 'postgresql://production',
      INSTALL_DATABASE_URL: 'postgresql://validation',
    }, true)).toBe('postgresql://validation');
  });

  it('deploys the migration lineage selected by the installation distribution', () => {
    expect(selectInstallMigrationSchema({ WATTANAM_DISTRIBUTION: 'core' })).toBe('prisma/core/schema.prisma');
    expect(selectInstallMigrationSchema({ WATTANAM_DISTRIBUTION: 'legacy-full' })).toBe('prisma/schema.prisma');
    expect(selectInstallMigrationSchema({})).toBe('prisma/schema.prisma');
    expect(() => selectInstallMigrationSchema({ WATTANAM_DISTRIBUTION: 'unknown' })).toThrow('must be core or legacy-full');
  });
});
