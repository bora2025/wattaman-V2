import { isBlockedAddress, SchoolDiscoveryService } from './school-discovery.service';

const STATUS = {
  state: 'installed',
  installation: {
    installationId: '151bc256-fc6f-41f2-b249-6241ded37a6e',
    schoolName: 'Angkor1 International School',
    schoolSlug: 'angkor1-international-school',
    locale: 'en-KH', timezone: 'Asia/Phnom_Penh', currency: 'KHR', coreVersion: '1.0.0',
    installedAt: '2026-08-31T04:57:12.890Z',
  },
};

/** Serves the three public documents a real school gateway publishes. */
function gateway(overrides: { status?: unknown; version?: unknown; ready?: unknown } = {}) {
  return jest.fn(async (url: string) => {
    const body = url.endsWith('/api/installation/status') ? overrides.status ?? STATUS
      : url.endsWith('/api/version') ? overrides.version ?? { service: 'wattanam-api', version: '1.0.0', environment: 'production' }
      : overrides.ready ?? { status: 'ready' };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

function prismaWith(rows: { bySlug?: unknown; byProject?: unknown; byGateway?: unknown; registration?: unknown } = {}) {
  return {
    customerSchool: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.slug) return rows.bySlug ?? null;
        if (where.railwayProjectId) return rows.byProject ?? null;
        if (where.gatewayOrigin) return rows.byGateway ?? null;
        return null;
      }),
    },
    installationRegistration: { findUnique: jest.fn(async () => rows.registration ?? null) },
  } as any;
}

const ORIGIN = 'https://gateway-production-26d3.up.railway.app';

describe('SchoolDiscoveryService', () => {
  it('reports the identity a deployment publishes about itself', async () => {
    const service = new SchoolDiscoveryService(prismaWith(), gateway());
    const result = await service.discover({ gatewayOrigin: ORIGIN });

    expect(result.detected).toMatchObject({
      installationId: '151bc256-fc6f-41f2-b249-6241ded37a6e',
      schoolSlug: 'angkor1-international-school',
      coreVersion: '1.0.0',
      environment: 'production',
    });
    expect(result.ready).toBe(true);
    expect(result.outcome).toBe('CREATE');
  });

  it('matches an existing directory record and says which identifiers matched', async () => {
    const school = { id: 'school-1', name: 'Angkor1', slug: 'angkor1-international-school', status: 'PROSPECT', railwayProjectId: null, gatewayOrigin: null };
    const service = new SchoolDiscoveryService(prismaWith({ bySlug: school }), gateway());
    const result = await service.discover({ gatewayOrigin: ORIGIN });

    expect(result.outcome).toBe('MATCH');
    expect(result.match).toMatchObject({ id: 'school-1' });
    expect(result.matchedBy).toEqual({ slug: true, railwayProjectId: false, gatewayOrigin: false });
  });

  // The plan is explicit: identifiers pointing at different schools must stop the operator, never
  // be guessed at or merged.
  it('refuses to guess when identifiers point at different schools', async () => {
    const service = new SchoolDiscoveryService(prismaWith({
      bySlug: { id: 'school-1', name: 'A', slug: 'angkor1-international-school', status: 'ACTIVE', railwayProjectId: null, gatewayOrigin: null },
      byGateway: { id: 'school-2', name: 'B', slug: 'other', status: 'ACTIVE', railwayProjectId: null, gatewayOrigin: ORIGIN },
    }), gateway());
    const result = await service.discover({ gatewayOrigin: ORIGIN });

    expect(result.outcome).toBe('CONFLICT');
    expect(result.match).toBeNull();
    expect(result.conflictReasons[0]).toContain('different customer schools');
  });

  it('treats an installation already adopted elsewhere as a conflict', async () => {
    const service = new SchoolDiscoveryService(prismaWith({
      registration: { id: 'registration-1', installationId: STATUS.installation.installationId, label: 'Angkor1', customerSchoolId: 'school-9', keys: [{ keyFingerprint: 'abc' }] },
    }), gateway());
    const result = await service.discover({ gatewayOrigin: ORIGIN });

    expect(result.outcome).toBe('CONFLICT');
    expect(result.conflictReasons[0]).toContain('already adopted');
  });

  it('surfaces an existing unadopted registration so the operator can adopt rather than re-register', async () => {
    const service = new SchoolDiscoveryService(prismaWith({
      registration: { id: 'registration-1', installationId: STATUS.installation.installationId, label: 'Angkor1', customerSchoolId: null, keys: [{ keyFingerprint: 'abc123' }] },
    }), gateway());
    const result = await service.discover({ gatewayOrigin: ORIGIN });

    expect(result.registration).toMatchObject({ adopted: false, activeKeyFingerprint: 'abc123' });
    expect(result.outcome).toBe('CREATE');
  });

  it('refuses a school that has not completed first-run installation', async () => {
    const service = new SchoolDiscoveryService(prismaWith(), gateway({ status: { state: 'legacy_unadopted', installation: null } }));
    await expect(service.discover({ gatewayOrigin: ORIGIN })).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a URL that answers but is not a Wattanam school', async () => {
    const service = new SchoolDiscoveryService(prismaWith(), gateway({ status: { hello: 'world' } }));
    await expect(service.discover({ gatewayOrigin: ORIGIN })).rejects.toMatchObject({ status: 422 });
  });

  it('never follows a redirect, which is how a checked host becomes an unchecked one', async () => {
    const fetchImpl = gateway();
    const service = new SchoolDiscoveryService(prismaWith(), fetchImpl);
    await service.discover({ gatewayOrigin: ORIGIN });
    for (const call of (fetchImpl as unknown as jest.Mock).mock.calls) {
      expect(call[1]).toMatchObject({ redirect: 'error' });
    }
  });

  describe('SSRF protection', () => {
    it.each([
      ['http://gateway.example.com', 'must use HTTPS'],
      ['https://gateway.example.com/api', 'without a path'],
      ['https://user:pw@gateway.example.com', 'credentials'],
    ])('refuses %s', async (origin, message) => {
      const service = new SchoolDiscoveryService(prismaWith(), gateway());
      await expect(service.discover({ gatewayOrigin: origin })).rejects.toThrow(new RegExp(message));
    });

    it.each([
      ['https://127.0.0.1', 'loopback'],
      ['https://10.0.0.5', 'private class A'],
      ['https://192.168.1.10', 'private class C'],
      ['https://169.254.169.254', 'cloud metadata'],
      ['https://172.16.0.9', 'private class B'],
    ])('refuses %s (%s)', async (origin) => {
      const fetchImpl = gateway();
      const service = new SchoolDiscoveryService(prismaWith(), fetchImpl);
      await expect(service.discover({ gatewayOrigin: origin })).rejects.toMatchObject({ status: 400 });
      // The point is that nothing was ever requested, not merely that the call failed.
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '0.0.0.0', '10.1.2.3', '172.31.255.255', '192.168.0.1',
    '169.254.169.254', '100.64.0.1', '224.0.0.1',
    '::1', '::', 'fe80::1', 'fd00::1', '::ffff:169.254.169.254',
  ])('blocks %s', (address) => expect(isBlockedAddress(address)).toBe(true));

  it.each(['8.8.8.8', '1.1.1.1', '104.18.0.1', '172.32.0.1', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s', (address) => expect(isBlockedAddress(address)).toBe(false),
  );

  it('blocks anything that is not an IP address at all', () => {
    expect(isBlockedAddress('not-an-address')).toBe(true);
  });
});
