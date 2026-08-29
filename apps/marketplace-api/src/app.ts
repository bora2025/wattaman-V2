import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { createReadStream } from 'node:fs';
import multer from 'multer';
import { ZodError } from 'zod';
import { MarketplaceConfig } from './config';
import { CommerceService } from './commerce.service';
import { HttpError } from './http-error';
import { RepositoryService } from './repository.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { IdentityService } from './identity.service';
import { createTransactionalEmailService } from './transactional-email.service';
import { InstallationRegistrationService } from './installation-registration.service';
import { InstallationEntitlementAccessService } from './installation-entitlement-access.service';
import { PublisherGovernanceService } from './publisher-governance.service';
import { CustomerMarketplaceService } from './customer-marketplace.service';
import { createMetricsRegistry } from './observability/metrics';
import { requestLoggingMiddleware } from './observability/request-logging';
import { matchesAnyToken, readMetricsTokens } from './observability/metrics-config';

/** Accepts any currently-valid admin token (the active one plus any still-trusted retiring ones
 * from MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON), so rotating doesn't instantly 401 every caller
 * (CI secrets, operator .env files, scripts) the moment the new value goes live. */
export function adminGuard(validTokens: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!matchesAnyToken(request.header('authorization') || '', validTokens)) return next(new HttpError(401, 'Unauthorized'));
    next();
  };
}

function sessionGuard(identity: IdentityService) {
  return async (request: Request & { accountId?: string }, _response: Response, next: NextFunction) => {
    const header = request.header('authorization') || '';
    if (!header.startsWith('Bearer ')) return next(new HttpError(401, 'Unauthorized'));
    try {
      const session = await identity.resolveSession(header.slice(7));
      request.accountId = session.accountId;
      next();
    } catch (error) { next(error); }
  };
}

export function createApp(prisma: PrismaClient, config: MarketplaceConfig) {
  const app = express();
  const repository = new RepositoryService(prisma, config);
  const commerce = new CommerceService(prisma, config);
  const paymentWebhooks = new PaymentWebhookService(prisma, config);
  const identity = new IdentityService(prisma, config, createTransactionalEmailService(config));
  const installationRegistration = new InstallationRegistrationService(prisma, config);
  const entitlementAccess = new InstallationEntitlementAccessService(prisma);
  const publisherGovernance = new PublisherGovernanceService(prisma, repository);
  const customerMarketplace = new CustomerMarketplaceService(prisma, commerce);
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.maxArtifactBytes, fields: 10 } });
  const metrics = createMetricsRegistry(prisma);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLoggingMiddleware(metrics));
  app.use(express.json({
    limit: '256kb',
    verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); },
  }));

  app.get('/metrics', async (request, response) => {
    const tokens = readMetricsTokens();
    if (!tokens.length) return response.status(401).json({ error: 'METRICS_TOKEN is not configured; /metrics is disabled by default' });
    if (!matchesAnyToken(request.header('authorization') || '', tokens)) return response.status(401).json({ error: 'Invalid metrics token' });
    response.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    response.send(await metrics.registry.metrics());
  });

  app.get('/health/live', (_request, response) => response.json({ status: 'alive' }));
  app.get('/health/ready', async (_request, response, next) => { try { response.json(await repository.health()); } catch (error) { next(error); } });
  app.get('/v1/repository-key', (_request, response) => response.json(repository.keyDocument()));
  app.get('/v1/publisher-policies', async (_request, response, next) => {
    try { response.json(await publisherGovernance.listCurrentPolicies()); } catch (error) { next(error); }
  });
  app.get('/v1/index', async (request, response, next) => {
    try { response.json(await repository.signedIndex(String(request.query.coreVersion || ''), String(request.query.channel || 'stable'))); }
    catch (error) { next(error); }
  });
  app.get('/v1/catalog', async (request, response, next) => {
    try {
      const header = request.header('authorization') || '';
      const session = header.startsWith('Bearer ') ? await identity.resolveSession(header.slice(7)) : undefined;
      response.json(await customerMarketplace.catalog(String(request.query.coreVersion || '') || undefined, session?.accountId));
    } catch (error) { next(error); }
  });
  app.get('/v1/artifacts/:sha256', async (request, response, next) => {
    try {
      const result = await repository.artifact(request.params.sha256);
      let installationRegistrationId: string | undefined;
      if (result.artifact.pluginVersion.plugin.isPaid) {
        const header = request.header('authorization') || '';
        if (header.startsWith('Bearer ')) {
          const session = await identity.resolveSession(header.slice(7));
          installationRegistrationId = await customerMarketplace.authorizeAccountDownload(session.accountId, result.artifact.pluginVersion.pluginId);
        } else {
          const authorized = await entitlementAccess.authorizeDownload({ installationId: String(request.query.installationId || ''), sha256: request.params.sha256, pluginId: result.artifact.pluginVersion.pluginId, ts: String(request.query.ts || ''), signature: String(request.query.signature || '') });
          installationRegistrationId = authorized.registrationId;
        }
      }
      await repository.recordDownload(result.artifact.pluginVersionId, result.artifact.sha256, installationRegistrationId);
      response.set({
        'Content-Type': 'application/vnd.wattanam.plugin+zip',
        'Content-Length': String(result.artifact.sizeBytes),
        'Content-Disposition': `attachment; filename="${result.artifact.pluginVersion.pluginId}-${result.artifact.pluginVersion.version}.wtp"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"sha256-${result.artifact.sha256}"`,
      });
      createReadStream(result.path).on('error', next).pipe(response);
    } catch (error) { next(error); }
  });
  app.post('/v1/payments/webhooks/online-hmac-v1', async (request, response, next) => {
    try {
      const rawBody = (request as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) throw new HttpError(400, 'Raw webhook body is required');
      response.json(await paymentWebhooks.process(rawBody, request.header('x-wattanam-signature')));
    } catch (error) { next(error); }
  });

  app.post('/v1/accounts', async (request, response, next) => {
    try { response.status(201).json(await identity.register(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/accounts/email-verifications/confirm', async (request, response, next) => {
    try { response.json(await identity.confirmEmail(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/sessions', async (request, response, next) => {
    try { response.json(await identity.login(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/sessions/refresh', async (request, response, next) => {
    try { response.json(await identity.refreshSession(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/password-resets', async (request, response, next) => {
    try { response.status(202).json(await identity.requestPasswordReset(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/password-resets/confirm', async (request, response, next) => {
    try { response.json(await identity.confirmPasswordReset(request.body)); } catch (error) { next(error); }
  });

  const requireSession = sessionGuard(identity);
  app.post('/v1/sessions/revoke', requireSession, async (request, response, next) => {
    try { response.json(await identity.revokeSession(request.body)); } catch (error) { next(error); }
  });
  app.get('/v1/customer/orders', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await customerMarketplace.orders(request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/customer/orders', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await customerMarketplace.checkout(request.accountId!, request.body)); } catch (error) { next(error); }
  });
  app.get('/v1/customer/entitlements', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await customerMarketplace.entitlements(request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/mfa/enrollments', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await identity.enrollMfa(request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/mfa/enrollments/confirm', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await identity.confirmMfaEnrollment(request.accountId!, request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/mfa/disable', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await identity.disableMfa(request.accountId!, request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/publishers', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.createPublisher({ ...request.body, ownerAccountId: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/policies/:policyId/accept', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.acceptPolicy({ policyId: request.params.policyId, publisherId: request.params.publisherId, accountId: request.accountId, ip: request.ip, userAgent: request.header('user-agent') })); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/keys', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.requestKey({ ...request.body, publisherId: request.params.publisherId, requestedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publisher-submissions', requireSession, upload.single('package'), async (request: Request & { accountId?: string }, response, next) => {
    try {
      if (!request.file?.buffer || !request.file.originalname.endsWith('.wtp')) throw new HttpError(400, 'A .wtp package is required');
      response.status(201).json(await publisherGovernance.submit(request.body, request.file.buffer, request.accountId!));
    } catch (error) { next(error); }
  });

  app.post('/v1/installations/challenges', async (request, response, next) => {
    try { response.status(201).json(await installationRegistration.requestChallenge(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/installations/register', async (request, response, next) => {
    try { response.status(201).json(await installationRegistration.register(request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/installations/:installationId/keys/rotate', async (request, response, next) => {
    try { response.json(await installationRegistration.rotateKey({ ...request.body, installationId: request.params.installationId })); } catch (error) { next(error); }
  });
  app.get('/v1/installations/:installationId/entitlements', async (request, response, next) => {
    try {
      response.json(await entitlementAccess.getAll({
        installationId: request.params.installationId, ts: String(request.query.ts || ''), signature: String(request.query.signature || ''),
      }));
    } catch (error) { next(error); }
  });
  app.get('/v1/installations/:installationId/entitlements/:pluginId', async (request, response, next) => {
    try {
      response.json(await entitlementAccess.getOne({
        installationId: request.params.installationId, pluginId: request.params.pluginId,
        ts: String(request.query.ts || ''), signature: String(request.query.signature || ''),
      }));
    } catch (error) { next(error); }
  });

  const requireAdmin = adminGuard(config.adminTokens);
  app.post('/admin/v1/publishers', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.createOfficialPublisher(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-policies', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.publishPolicy(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publishers/:publisherId/members', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.addVerifiedMember({ ...request.body, publisherId: request.params.publisherId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/marketplace-reviewers', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.addMarketplaceReviewer(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publishers/:publisherId/approve', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.approvePublisher({ ...request.body, publisherId: request.params.publisherId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-keys/:keyRecordId/approve', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.approveKey({ ...request.body, keyRecordId: request.params.keyRecordId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-keys/:keyRecordId/revoke', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.revokeKey({ ...request.body, keyRecordId: request.params.keyRecordId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/submissions/:submissionId/reviews', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.review({ ...request.body, submissionId: request.params.submissionId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/revenue/orders/:orderId/record', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.recordOrderRevenue(String(request.params.orderId), request.body?.feeBasisPoints)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/revenue/refunds/:refundId/record', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.recordRefundRevenue(String(request.params.refundId))); } catch (error) { next(error); }
  });
  app.post('/admin/v1/revenue/corrections', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.correctEntry(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-statements', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.generateStatement(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-payouts', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.requestPayout(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-payouts/:payoutId/approve', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.approvePayout({ ...request.body, payoutId: request.params.payoutId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-payouts/:payoutId/paid', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.markPayoutPaid({ ...request.body, payoutId: request.params.payoutId })); } catch (error) { next(error); }
  });
  app.get('/admin/v1/pilot/metrics', requireAdmin, async (_request, response, next) => {
    try { response.json(await publisherGovernance.pilotMetrics()); } catch (error) { next(error); }
  });
  app.get('/admin/v1/pilot/launch-assessment', requireAdmin, async (_request, response, next) => {
    try { response.json(await publisherGovernance.launchAssessment()); } catch (error) { next(error); }
  });
  app.post('/admin/v1/plugin-releases', requireAdmin, upload.single('package'), async (request, response, next) => {
    try {
      if (!request.file?.buffer || !request.file.originalname.endsWith('.wtp')) throw new HttpError(400, 'A .wtp package is required');
      response.status(201).json(await repository.publishPlugin(request.body, request.file.buffer));
    } catch (error) { next(error); }
  });
  app.post('/admin/v1/core-releases', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.publishCoreRelease(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/advisories', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.publishAdvisory(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/plugin-releases/promote', requireAdmin, async (request, response, next) => {
    try { response.json(await repository.promotePluginRelease(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/core-releases/promote', requireAdmin, async (request, response, next) => {
    try { response.json(await repository.promoteCoreRelease(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/plugin-releases/withdraw', requireAdmin, async (request, response, next) => {
    try { response.json(await repository.withdrawPluginRelease(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/orders', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await commerce.createOrder(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/orders/:orderId/manual-settlement', requireAdmin, async (request, response, next) => {
    try { response.json(await commerce.settleManualPayment({ ...request.body, orderId: request.params.orderId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/orders/:orderId/refund', requireAdmin, async (request, response, next) => {
    try { response.json(await commerce.refundOrder({ ...request.body, orderId: request.params.orderId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/entitlements/:entitlementId/revoke', requireAdmin, async (request, response, next) => {
    try { response.json(await commerce.revokeEntitlement({ ...request.body, entitlementId: request.params.entitlementId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/entitlements/expire-overdue', requireAdmin, async (_request, response, next) => {
    try { response.json(await commerce.expireOverdueEntitlements()); } catch (error) { next(error); }
  });

  app.use((_request, _response, next) => next(new HttpError(404, 'Not found')));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
    if (error instanceof ZodError) return response.status(400).json({ error: 'Invalid request', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) });
    if (error instanceof SyntaxError) return response.status(400).json({ error: 'Invalid JSON' });
    if (error instanceof multer.MulterError) return response.status(400).json({ error: error.message });
    const code = (error as { code?: string }).code;
    if (code === 'P2002') return response.status(409).json({ error: 'Record already exists' });
    console.error(error);
    return response.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
