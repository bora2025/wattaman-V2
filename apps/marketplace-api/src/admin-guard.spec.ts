import { adminGuard } from './app';

function request(authorizationHeader?: string) {
  return { header: (name: string) => (name.toLowerCase() === 'authorization' ? authorizationHeader : undefined) } as any;
}

describe('adminGuard', () => {
  const tokens = ['a'.repeat(32), 'b'.repeat(32)];

  it('accepts the currently active token', () => {
    const next = jest.fn();
    adminGuard(tokens)(request(`Bearer ${tokens[0]}`), {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('accepts a still-trusted retiring token during a rotation overlap window -- the actual point of this feature', () => {
    const next = jest.fn();
    adminGuard(tokens)(request(`Bearer ${tokens[1]}`), {} as any, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a token that is not in the trusted set', () => {
    const next = jest.fn();
    adminGuard(tokens)(request(`Bearer ${'c'.repeat(32)}`), {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects once a retiring token is removed from the trusted set -- proving rotation can actually close', () => {
    const next = jest.fn();
    adminGuard([tokens[0]])(request(`Bearer ${tokens[1]}`), {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects a missing or malformed authorization header', () => {
    const next = jest.fn();
    adminGuard(tokens)(request(undefined), {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});
