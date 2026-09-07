import { CustomerSchoolService } from './customer-school.service';
import { hashToken } from './identity-crypto';

const context = { correlationId: 'correlation-1', ip: '203.0.113.7', userAgent: 'jest' };

describe('CustomerSchoolService', () => {
  it('lists only marketplace-owned directory fields and masks the contact address', async () => {
    const prisma = { customerSchool: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    await new CustomerSchoolService(prisma).schools({ status: 'ACTIVE' });

    const query = prisma.customerSchool.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ status: 'ACTIVE' });
    expect(query.select).toHaveProperty('slug', true);
    // The control plane has no route into a school's own database (ADR-0002), so no query here may
    // reach for one -- asserted at the shape level, not just absent from today's response.
    expect(query.select).not.toHaveProperty('students');
    expect(query.select).not.toHaveProperty('databaseUrl');
    expect(query.select).not.toHaveProperty('enrollmentTokens');
  });

  it('never selects an enrollment token hash when reading a school', async () => {
    const prisma = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', contactEmail: 'head@example.com', installation: null, enrollmentTokens: [] }),
      },
    } as any;
    const school = await new CustomerSchoolService(prisma).school('school-1');

    expect(prisma.customerSchool.findUnique.mock.calls[0][0].select.enrollmentTokens.select).not.toHaveProperty('tokenHash');
    expect(school.contactEmail).toBe('h***@example.com');
  });

  it('maps a duplicate slug to a conflict that names the collision', async () => {
    const tx = { customerSchool: { create: jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['slug'] } }) }, platformAuditEvent: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).create('operator-1', {
      name: 'Angkor High School', slug: 'angkor-high', internalReason: 'New signed contract.',
    }, context)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('angkor-high') });
    expect(tx.platformAuditEvent.create).not.toHaveBeenCalled();
  });

  // One Railway project holds exactly one school, so a second record claiming it is a mistake the
  // plan requires a human to resolve rather than something to merge silently.
  it.each([
    ['railwayProjectId', 'Railway project', 'b5b07c38-6569-4bee-ab88-6b134998c77d'],
    ['gatewayOrigin', 'gateway origin', 'https://gateway-production-26d3.up.railway.app'],
  ])('refuses a second school claiming the same %s', async (field, label, value) => {
    const tx = { customerSchool: { create: jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: [field] } }) }, platformAuditEvent: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).create('operator-1', {
      name: 'Second Claim', slug: 'second-claim', [field]: value, internalReason: 'Conflict check.',
    }, context)).rejects.toMatchObject({ status: 409, message: expect.stringContaining(label) });
  });

  it('reports a conflict on update too, since infrastructure fields are editable', async () => {
    const tx = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE', railwayProjectId: null }),
        update: jest.fn().mockRejectedValue({ code: 'P2002', meta: { target: ['railwayProjectId'] } }),
      },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).update('school-1', 'operator-1', {
      railwayProjectId: 'b5b07c38-6569-4bee-ab88-6b134998c77d', internalReason: 'Recording infrastructure.',
    }, context)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Railway project') });
    expect(tx.platformAuditEvent.create).not.toHaveBeenCalled();
  });

  it('refuses a slug that the Railway provisioner would reject', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    await expect(new CustomerSchoolService(prisma).create('operator-1', {
      name: 'Angkor High School', slug: 'Angkor High', internalReason: 'New signed contract.',
    }, context)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits a creation with the operator, reason, and correlation id', async () => {
    const created = { id: 'school-1', name: 'Angkor High School', slug: 'angkor-high', contactEmail: 'head@example.com' };
    const tx = { customerSchool: { create: jest.fn().mockResolvedValue(created) }, platformAuditEvent: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    const school = await new CustomerSchoolService(prisma).create('operator-1', {
      name: 'Angkor High School', slug: 'angkor-high', contactEmail: 'Head@Example.com', internalReason: 'New signed contract.',
    }, context);

    expect(tx.customerSchool.create.mock.calls[0][0].data).toMatchObject({ contactEmail: 'head@example.com', createdByOperatorId: 'operator-1' });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data).toMatchObject({
      operatorId: 'operator-1', action: 'customer_school_created', targetType: 'CustomerSchool',
      targetId: 'school-1', reason: 'New signed contract.', correlationId: 'correlation-1',
    });
    expect(school.contactEmail).toBe('h***@example.com');
  });

  it('records the before and after of every changed field on an update', async () => {
    const before = { id: 'school-1', status: 'ACTIVE', plan: 'starter', contactEmail: 'head@example.com' };
    const after = { ...before, plan: 'standard' };
    const tx = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue(before), update: jest.fn().mockResolvedValue(after) },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await new CustomerSchoolService(prisma).update('school-1', 'operator-1', { plan: 'standard', internalReason: 'Upgraded at renewal.' }, context);

    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.metadata).toEqual({
      changed: { plan: { from: 'starter', to: 'standard' } },
    });
  });

  it('refuses to edit a terminated school', async () => {
    const tx = { customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'TERMINATED' }), update: jest.fn() } };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).update('school-1', 'operator-1', { plan: 'standard', internalReason: 'Late change.' }, context))
      .rejects.toMatchObject({ status: 409 });
    expect(tx.customerSchool.update).not.toHaveBeenCalled();
  });

  it('rejects an update that changes nothing rather than writing an empty audit row', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    await expect(new CustomerSchoolService(prisma).update('school-1', 'operator-1', { internalReason: 'Nothing to do.' }, context))
      .rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('suspends only an active school and records the reason', async () => {
    const tx = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE' }),
        update: jest.fn().mockResolvedValue({ id: 'school-1', status: 'SUSPENDED', contactEmail: null, domains: [] }),
      },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await new CustomerSchoolService(prisma).suspend('school-1', 'operator-1', { internalReason: 'Payment delinquency confirmed.' }, context);
    expect(tx.customerSchool.update.mock.calls[0][0].data).toMatchObject({ status: 'SUSPENDED', suspendedReason: 'Payment delinquency confirmed.' });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.action).toBe('customer_school_suspended');
  });

  it('reactivates only a suspended school and clears suspension metadata', async () => {
    const tx = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'SUSPENDED' }),
        update: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE', contactEmail: null, domains: [] }),
      },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await new CustomerSchoolService(prisma).reactivate('school-1', 'operator-1', { internalReason: 'Account returned to good standing.' }, context);
    expect(tx.customerSchool.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE', suspendedAt: null, suspendedReason: null });
  });

  it('soft-terminates a school and revokes unused enrollment tokens', async () => {
    const tx = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'SUSPENDED' }),
        update: jest.fn().mockResolvedValue({ id: 'school-1', status: 'TERMINATED', contactEmail: null, domains: [] }),
      },
      schoolEnrollmentToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await new CustomerSchoolService(prisma).terminate('school-1', 'operator-1', { internalReason: 'Contract ended and retention approved.' }, context);
    expect(tx.schoolEnrollmentToken.updateMany).toHaveBeenCalled();
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.metadata).toEqual({ revokedEnrollmentTokens: 2 });
  });

  it('reports only marketplace-observed usage for a school', async () => {
    const prisma = { customerSchool: { findUnique: jest.fn().mockResolvedValue({
      id: 'school-1', status: 'ACTIVE', installation: {
        installationId: '11111111-1111-4111-8111-111111111111', lastSeenAt: null,
        _count: { entitlements: 2, orders: 3, downloads: 4, pluginRequests: 5 },
      },
    }) } } as any;
    const result = await new CustomerSchoolService(prisma).usage('school-1');
    expect(result.source).toBe('marketplace-observed');
    expect(result.counts).toEqual({ entitlements: 2, orders: 3, downloads: 4, pluginRequests: 5 });
    expect(prisma.customerSchool.findUnique.mock.calls[0][0].select).not.toHaveProperty('students');
  });

  it('normalizes and audits a unique school domain', async () => {
    const tx = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE' }) },
      customerSchoolDomain: {
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'domain-1', hostname: 'portal.school.example', isPrimary: true, verifiedAt: null }),
      },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    await new CustomerSchoolService(prisma).addDomain('school-1', 'operator-1', {
      hostname: 'Portal.School.Example', isPrimary: true, internalReason: 'Customer DNS cutover.',
    }, context);
    expect(tx.customerSchoolDomain.create.mock.calls[0][0].data.hostname).toBe('portal.school.example');
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.action).toBe('customer_school_domain_added');
  });

  it('stores only the hash of a minted token and returns the plaintext once', async () => {
    const tx = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', name: 'Angkor High School', slug: 'angkor-high', status: 'PROSPECT', installation: null }),
        update: jest.fn(),
      },
      schoolEnrollmentToken: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'token-1' }) },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;
    const now = new Date('2026-09-03T00:00:00.000Z');

    const result = await new CustomerSchoolService(prisma).mintEnrollmentToken('school-1', 'operator-1', { internalReason: 'Handing to deployment.' }, context, now);

    const written = tx.schoolEnrollmentToken.create.mock.calls[0][0].data;
    expect(result.token).toMatch(/^wtn_enr_[0-9a-f]{64}$/);
    expect(written.tokenHash).toBe(hashToken(result.token));
    expect(JSON.stringify(written)).not.toContain(result.token);
    expect(written.expiresAt).toEqual(new Date('2026-09-10T00:00:00.000Z'));
    // A sale becomes a pending enrolment the moment the token leaves the building.
    expect(tx.customerSchool.update.mock.calls[0][0].data).toEqual({ status: 'AWAITING_CLAIM' });
  });

  it('refuses to mint a second live token for one school', async () => {
    const tx = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'AWAITING_CLAIM', installation: null }) },
      schoolEnrollmentToken: { findFirst: jest.fn().mockResolvedValue({ id: 'token-1' }), create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).mintEnrollmentToken('school-1', 'operator-1', { internalReason: 'Second copy.' }, context))
      .rejects.toMatchObject({ status: 409 });
    expect(tx.schoolEnrollmentToken.create).not.toHaveBeenCalled();
  });

  it('refuses to mint for a school that already has an installation', async () => {
    const tx = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE', installation: { id: 'registration-1' } }) },
      schoolEnrollmentToken: { findFirst: jest.fn(), create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).mintEnrollmentToken('school-1', 'operator-1', { internalReason: 'Re-enrol.' }, context))
      .rejects.toMatchObject({ status: 409 });
    expect(tx.schoolEnrollmentToken.create).not.toHaveBeenCalled();
  });

  it('adopts a pre-existing registration and marks the school active', async () => {
    const tx = {
      customerSchool: {
        findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'PROSPECT', installation: null }),
        update: jest.fn().mockResolvedValue({ id: 'school-1', status: 'ACTIVE', contactEmail: null }),
      },
      installationRegistration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', installationId: '11111111-1111-4111-8111-111111111111', label: 'Bora School', customerSchoolId: null, keys: [{ keyFingerprint: 'fingerprint-1' }] }),
        update: jest.fn(),
      },
      schoolEnrollmentToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      platformAuditEvent: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await new CustomerSchoolService(prisma).adoptInstallation('school-1', 'operator-1', {
      installationId: '11111111-1111-4111-8111-111111111111', internalReason: 'Registered before the directory existed.',
    }, context);

    expect(tx.installationRegistration.update.mock.calls[0][0].data).toEqual({ customerSchoolId: 'school-1' });
    expect(tx.customerSchool.update.mock.calls[0][0].data).toEqual({ status: 'ACTIVE' });
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.action).toBe('customer_school_installation_adopted');
    expect(tx.schoolEnrollmentToken.updateMany).toHaveBeenCalled();
    expect(tx.platformAuditEvent.create.mock.calls[0][0].data.metadata).toMatchObject({
      activeKeyFingerprint: 'fingerprint-1', revokedEnrollmentTokens: 1,
    });
  });

  it('refuses to activate an installation without exactly one active identity key', async () => {
    const tx = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'PROSPECT', installation: null }), update: jest.fn() },
      installationRegistration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', installationId: '11111111-1111-4111-8111-111111111111', customerSchoolId: null, keys: [] }),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).adoptInstallation('school-1', 'operator-1', {
      installationId: '11111111-1111-4111-8111-111111111111', internalReason: 'Attempt activation.',
    }, context)).rejects.toMatchObject({ status: 409, message: expect.stringContaining('active identity key') });
    expect(tx.installationRegistration.update).not.toHaveBeenCalled();
    expect(tx.customerSchool.update).not.toHaveBeenCalled();
  });

  it('refuses to adopt an installation that belongs to another customer school', async () => {
    const tx = {
      customerSchool: { findUnique: jest.fn().mockResolvedValue({ id: 'school-1', status: 'PROSPECT', installation: null }), update: jest.fn() },
      installationRegistration: {
        findUnique: jest.fn().mockResolvedValue({ id: 'registration-1', installationId: '11111111-1111-4111-8111-111111111111', customerSchoolId: 'school-2', keys: [{ keyFingerprint: 'fingerprint-1' }] }),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as any;

    await expect(new CustomerSchoolService(prisma).adoptInstallation('school-1', 'operator-1', {
      installationId: '11111111-1111-4111-8111-111111111111', internalReason: 'Wrong record.',
    }, context)).rejects.toMatchObject({ status: 409 });
    expect(tx.installationRegistration.update).not.toHaveBeenCalled();
  });
});
