import { NextFunction, Request, Response } from 'express';
import { HttpError } from './http-error';
import { PlatformAuthService } from './platform-auth.service';

export type PlatformRequest = Request & { operatorId?: string; sessionId?: string };

/** Deny-by-default per plan §7 ("authorize in the API for every request; UI hiding is not
 * authorization"). An unverified (enrollment-only) session from login()'s mfa_enrollment_required
 * branch resolves fine but is rejected here unless `allowUnverified` is set -- only the two MFA
 * enrollment routes pass that, so a fresh operator genuinely cannot reach anything else until
 * mandatory MFA enrollment (plan §4) completes. */
export function requirePlatformSession(auth: PlatformAuthService, options: { allowUnverified?: boolean } = {}) {
  return async (request: PlatformRequest, _response: Response, next: NextFunction) => {
    const header = request.header('authorization') || '';
    if (!header.startsWith('Bearer ')) return next(new HttpError(401, 'Unauthorized'));
    try {
      const session = await auth.resolveSession(header.slice(7));
      if (!session.mfaVerified && !options.allowUnverified) {
        return next(new HttpError(403, 'MFA enrollment must be completed before this action'));
      }
      request.operatorId = session.operatorId;
      request.sessionId = session.sessionId;
      next();
    } catch (error) { next(error); }
  };
}

/** Compose after requirePlatformSession. Loads the operator's effective permission set fresh on
 * every request (no caching) so a revoked role takes effect immediately, not after a session
 * expires. */
export function requirePlatformPermission(auth: PlatformAuthService, permissionKey: string) {
  return async (request: PlatformRequest, _response: Response, next: NextFunction) => {
    try {
      const permissions = await auth.effectivePermissions(request.operatorId!);
      if (!permissions.has(permissionKey)) return next(new HttpError(403, `Missing required permission: ${permissionKey}`));
      next();
    } catch (error) { next(error); }
  };
}
