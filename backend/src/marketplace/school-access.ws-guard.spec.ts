import { WsException } from '@nestjs/websockets';
import { SchoolAccessWsGuard, disconnectIfSuspended } from './school-access.ws-guard';

const access = (suspended: boolean) => ({ isSuspended: jest.fn().mockResolvedValue(suspended) }) as any;
const socket = () => ({ id: 'socket-1', emit: jest.fn(), disconnect: jest.fn(), handshake: { auth: {}, headers: {} }, data: {} }) as any;

describe('SchoolAccessWsGuard', () => {
  it('refuses socket messages while the school is locked and says why', async () => {
    const refusal = await new SchoolAccessWsGuard(access(true)).canActivate().catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(WsException);
    expect((refusal as WsException).getError()).toMatchObject({ code: 'SCHOOL_BILLING_SUSPENDED' });
  });

  it('lets messages through for an active school', async () => {
    await expect(new SchoolAccessWsGuard(access(false)).canActivate()).resolves.toBe(true);
  });
});

describe('disconnectIfSuspended', () => {
  it('tells the client why and closes the socket while locked', async () => {
    const client = socket();
    await expect(disconnectIfSuspended(access(true), client)).resolves.toBe(true);
    expect(client.emit).toHaveBeenCalledWith('exception', expect.objectContaining({ code: 'SCHOOL_BILLING_SUSPENDED' }));
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("leaves an active school's socket alone", async () => {
    const client = socket();
    await expect(disconnectIfSuspended(access(false), client)).resolves.toBe(false);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('fails open when the lock state cannot be read', async () => {
    const client = socket();
    const unreadable = { isSuspended: jest.fn().mockRejectedValue(new Error('database unavailable')) } as any;
    await expect(disconnectIfSuspended(unreadable, client)).resolves.toBe(false);
    expect(client.disconnect).not.toHaveBeenCalled();
  });
});
