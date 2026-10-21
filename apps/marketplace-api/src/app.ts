import { PrismaClient } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { ZodError } from 'zod';
import { MarketplaceConfig } from './config';
import { CommerceService } from './commerce.service';
import { HttpError } from './http-error';
import { RepositoryService } from './repository.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { IdentityService } from './identity.service';
import { createDurableTransactionalEmailService } from './transactional-email.service';
import { InstallationRegistrationService } from './installation-registration.service';
import { InstallationLinkService } from './installation-link.service';
import { InstallationEntitlementAccessService } from './installation-entitlement-access.service';
import { PublisherGovernanceService } from './publisher-governance.service';
import { CustomerMarketplaceService } from './customer-marketplace.service';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformReadService } from './platform-read.service';
import { PlatformDirectoryService } from './platform-directory.service';
import { PluginPricingService } from './plugin-pricing.service';
import { PluginPromotionService } from './plugin-promotion.service';
import { PlatformCommerceReadService } from './platform-commerce-read.service';
import { PlatformExportService } from './platform-export.service';
import { PlatformOperatorReadService } from './platform-operator-read.service';
import { CustomerSchoolService } from './customer-school.service';
import { SchoolDiscoveryService } from './school-discovery.service';
import { CustomerAccountService } from './customer-account.service';
import { MarketplaceAccountRequestService } from './marketplace-account-request.service';
import { platformOpenApi } from './platform-openapi';
import { SchoolPluginRequestService } from './school-plugin-request.service';
import { SchoolProvisioningService } from './school-provisioning.service';
import { SchoolBillingService } from './school-billing.service';
import { StarterBundleService } from './starter-bundle.service';
import { PlatformRequest, requirePlatformPermission, requirePlatformSession } from './platform-rbac';
import { actionContext } from './platform-context';
import { createMetricsRegistry } from './observability/metrics';
import { requestLoggingMiddleware } from './observability/request-logging';
import { matchesAnyToken, readMetricsTokens } from './observability/metrics-config';
import { marketplaceLinkCss, marketplaceLinkPage, marketplaceLinkScript } from './marketplace-link-page';

/** Accepts any currently-valid admin token (the active one plus any still-trusted retiring ones
 * from MARKETPLACE_SECONDARY_ADMIN_TOKENS_JSON), so rotating doesn't instantly 401 every caller
 * (CI secrets, operator .env files, scripts) the moment the new value goes live. */
export function adminGuard(validTokens: string[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!matchesAnyToken(request.header('authorization') || '', validTokens)) return next(new HttpError(401, 'Unauthorized'));
    next();
  };
}

type ScopedRequest = Request & { accountId?: string; sessionScope?: string; sourceGrantId?: string };

/** Default-deny: only routes that opt into `allowScopes` accept a COMMERCE_PROXY (delegated,
 * installation-proxied) session. Every existing requireSession call site keeps working unchanged
 * against ordinary human FULL sessions, and a stolen/misused delegated session cannot reach
 * account-management, publisher-governance, or payout routes it was never granted. */
function sessionGuard(identity: IdentityService, options: { allowScopes?: string[] } = {}) {
  const allowScopes = options.allowScopes ?? ['FULL'];
  return async (request: ScopedRequest, _response: Response, next: NextFunction) => {
    const header = request.header('authorization') || '';
    if (!header.startsWith('Bearer ')) return next(new HttpError(401, 'Unauthorized'));
    try {
      const session = await identity.resolveSession(header.slice(7));
      if (!allowScopes.includes(session.scope)) return next(new HttpError(403, 'This session scope cannot access this operation'));
      request.accountId = session.accountId;
      request.sessionScope = session.scope;
      request.sourceGrantId = session.sourceGrantId;
      next();
    } catch (error) { next(error); }
  };
}

export function createApp(prisma: PrismaClient, config: MarketplaceConfig) {
  const app = express();
  const repository = new RepositoryService(prisma, config);
  const commerce = new CommerceService(prisma, config);
  const paymentWebhooks = new PaymentWebhookService(prisma, config);
  const transactionalEmail = createDurableTransactionalEmailService(prisma, config);
  const identity = new IdentityService(prisma, config, transactionalEmail);
  const installationRegistration = new InstallationRegistrationService(prisma, config);
  const installationLink = new InstallationLinkService(prisma, config);
  const entitlementAccess = new InstallationEntitlementAccessService(prisma, config);
  const publisherGovernance = new PublisherGovernanceService(prisma, repository);
  const customerMarketplace = new CustomerMarketplaceService(prisma, commerce);
  const platformAuth = new PlatformAuthService(prisma, config);
  const platformRead = new PlatformReadService(prisma);
  const platformDirectory = new PlatformDirectoryService(prisma);
  const pluginPricing = new PluginPricingService(prisma);
  const pluginPromotion = new PluginPromotionService(prisma);
  const platformCommerce = new PlatformCommerceReadService(prisma);
  const platformExport = new PlatformExportService(prisma);
  const platformOperators = new PlatformOperatorReadService(prisma);
  const customerSchools = new CustomerSchoolService(prisma);
  const schoolDiscovery = new SchoolDiscoveryService(prisma);
  const customerAccounts = new CustomerAccountService(prisma, config);
  const accountRequests = new MarketplaceAccountRequestService(prisma);
  const schoolPluginRequests = new SchoolPluginRequestService(prisma, config, commerce);
  const schoolProvisioning = new SchoolProvisioningService(prisma);
  const schoolBilling = new SchoolBillingService(prisma, transactionalEmail, config, commerce);
  const starterBundles = new StarterBundleService(prisma);
  app.locals.schoolBilling = schoolBilling;
  app.locals.transactionalEmail = transactionalEmail;
  const upload = multer({ storage: multer.memoryStorage(), limits: { files: 1, fileSize: config.maxArtifactBytes, fields: 10 } });
  const metrics = createMetricsRegistry(prisma);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLoggingMiddleware(metrics));
  app.use(express.json({
    limit: '3mb',
    verify: (request, _response, buffer) => { (request as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); },
  }));

  app.get('/metrics', async (request, response) => {
    const tokens = readMetricsTokens();
    if (!tokens.length) return response.status(401).json({ error: 'METRICS_TOKEN is not configured; /metrics is disabled by default' });
    if (!matchesAnyToken(request.header('authorization') || '', tokens)) return response.status(401).json({ error: 'Invalid metrics token' });
    response.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    response.send(await metrics.registry.metrics());
  });

  app.get('/', (_request, response) => response.json({
    service: 'wattanam-marketplace-api',
    version: '0.1.0',
    status: 'online',
    message: 'Wattanam Marketplace API is running. This service provides JSON APIs, not a browser storefront.',
    endpoints: {
      live: '/health/live', ready: '/health/ready', catalog: '/v1/catalog',
      repositoryIndex: '/v1/index', repositoryKey: '/v1/repository-key',
      platformAdminOpenApi: '/platform/v1/openapi.json',
    },
  }));
  app.get('/health/live', (_request, response) => response.json({ status: 'alive' }));
  app.get('/health/ready', async (_request, response, next) => { try { response.json(await repository.health()); } catch (error) { next(error); } });
  app.get('/marketplace/link/approval.css', (_request, response) => {
    response.set('Cache-Control', 'public, max-age=3600');
    response.type('text/css').send(marketplaceLinkCss);
  });
  app.get('/marketplace/link/approval.js', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.type('application/javascript').send(marketplaceLinkScript);
  });
  app.get('/marketplace/link/:requestId', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    response.type('html').send(marketplaceLinkPage);
  });
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
  app.get('/v1/starter-bundles', async (request, response, next) => {
    try { response.json(await starterBundles.catalog(String(request.query.coreVersion || '') || undefined, String(request.query.currency || '') || undefined)); }
    catch (error) { next(error); }
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
      result.stream.on('error', next).pipe(response);
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
  app.post('/v1/account-requests', async (request, response, next) => {
    try { response.status(202).json(await accountRequests.submit(request.body)); } catch (error) { next(error); }
  });
  app.get('/v1/account-requests/:requestId', async (request, response, next) => {
    try { response.json(await accountRequests.status(String(request.params.requestId))); } catch (error) { next(error); }
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
  const requireCommerceSession = sessionGuard(identity, { allowScopes: ['FULL', 'COMMERCE_PROXY'] });
  app.post('/v1/sessions/revoke', requireCommerceSession, async (request, response, next) => {
    try { response.json(await identity.revokeSession(request.body)); } catch (error) { next(error); }
  });
  app.get('/v1/customer/orders', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await customerMarketplace.orders(request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/customer/orders', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.status(201).json(await customerMarketplace.checkout(request.accountId!, request.body)); } catch (error) { next(error); }
  });
  app.get('/v1/customer/entitlements', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await customerMarketplace.entitlements(request.accountId!)); } catch (error) { next(error); }
  });
  app.get('/v1/customer/school-billing', requireSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await schoolBilling.customerBilling(request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/customer/school-billing/payment-submissions', requireSession, async (request: ScopedRequest, response, next) => {
    try { response.status(201).json(await schoolBilling.submitPayment(request.accountId!, request.body)); } catch (error) { next(error); }
  });
  app.get('/v1/customer/plugin-requests', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await schoolPluginRequests.customerRequests(request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/customer/plugin-requests', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.status(201).json(await schoolPluginRequests.create(request.accountId!, request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/customer/plugin-requests/:requestId/respond', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await schoolPluginRequests.customerRespond(request.accountId!, String(request.params.requestId), request.body)); } catch (error) { next(error); }
  });
  app.post('/v1/customer/plugin-requests/:requestId/cancel', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await schoolPluginRequests.customerCancel(request.accountId!, String(request.params.requestId), request.body)); } catch (error) { next(error); }
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
  app.get('/v1/publishers', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.myPublishers(request.accountId!, request.query)); } catch (error) { next(error); }
  });
  app.get('/v1/publishers/:publisherId', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.myPublisher(request.accountId!, String(request.params.publisherId))); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/policies/:policyId/accept', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.acceptPolicy({ policyId: request.params.policyId, publisherId: request.params.publisherId, accountId: request.accountId, ip: request.ip, userAgent: request.header('user-agent') })); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/keys', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.requestKey({ ...request.body, publisherId: request.params.publisherId, requestedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publisher-keys/:keyRecordId/approve', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.approveKey({ keyRecordId: request.params.keyRecordId, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publisher-keys/:keyRecordId/revoke', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.revokeKey({ keyRecordId: request.params.keyRecordId, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/members', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.addVerifiedMember({ ...request.body, publisherId: request.params.publisherId, verifiedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/members/:memberId/suspend', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.suspendMember({ publisherId: request.params.publisherId, memberId: request.params.memberId, verifiedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publishers/:publisherId/members/:memberId/reactivate', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.reactivateMember({ publisherId: request.params.publisherId, memberId: request.params.memberId, verifiedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/v1/publisher-submissions', requireSession, upload.single('package'), async (request: Request & { accountId?: string }, response, next) => {
    try {
      if (!request.file?.buffer || !request.file.originalname.endsWith('.wtp')) throw new HttpError(400, 'A .wtp package is required');
      response.status(201).json(await publisherGovernance.submit(request.body, request.file.buffer, request.accountId!));
    } catch (error) { next(error); }
  });
  app.get('/v1/publisher-submissions', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.mySubmissions(request.accountId!, request.query)); } catch (error) { next(error); }
  });
  app.get('/v1/publisher-submissions/:submissionId', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.mySubmission(request.accountId!, String(request.params.submissionId))); } catch (error) { next(error); }
  });
  app.get('/v1/reviewer/submissions', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.reviewerSubmissions(request.accountId!, request.query)); } catch (error) { next(error); }
  });
  app.get('/v1/reviewer/submissions/:submissionId', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.reviewerSubmission(request.accountId!, String(request.params.submissionId))); } catch (error) { next(error); }
  });
  app.post('/v1/reviewer/submissions/:submissionId/reviews', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.review({ ...request.body, submissionId: request.params.submissionId, reviewerId: request.accountId })); } catch (error) { next(error); }
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
  app.get('/v1/installations/:installationId/school-control', async (request, response, next) => {
    try {
      const authenticated = await entitlementAccess.authenticateControl({
        installationId: request.params.installationId, ts: String(request.query.ts || ''), signature: String(request.query.signature || ''),
      });
      response.json(await schoolBilling.signedInstallationControl(authenticated.registrationId));
    } catch (error) { next(error); }
  });
  // The school's own admin panel reporting a payment, signed with its installation key. No
  // marketplace session: the key is the proof of which school is speaking.
  app.post('/v1/installations/:installationId/school-billing/payment-submissions', async (request, response, next) => {
    try {
      const { ts, signature, ...submission } = (request.body && typeof request.body === 'object' ? request.body : {}) as Record<string, unknown>;
      const authenticated = await entitlementAccess.authenticateSchoolPayment({ installationId: request.params.installationId, ts: String(ts ?? ''), signature: String(signature ?? '') }, submission);
      response.status(201).json(await schoolBilling.submitPaymentFromSchool(authenticated.registrationId, submission));
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

  app.post('/v1/installations/:installationId/marketplace-links', async (request, response, next) => {
    try { response.status(201).json(await installationLink.requestLink({ ...request.body, installationId: request.params.installationId })); } catch (error) { next(error); }
  });
  app.get('/v1/marketplace-links/:requestId', async (request, response, next) => {
    try { response.json(await installationLink.getRequest(request.params.requestId)); } catch (error) { next(error); }
  });
  app.post('/v1/marketplace-links/:requestId/approve', requireSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await installationLink.approve(String(request.params.requestId), request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/marketplace-links/:requestId/deny', requireSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await installationLink.deny(String(request.params.requestId), request.accountId!)); } catch (error) { next(error); }
  });
  app.post('/v1/installations/:installationId/marketplace-links/:requestId/exchange', async (request, response, next) => {
    try { response.json(await installationLink.exchange({ ...request.body, installationId: request.params.installationId, requestId: String(request.params.requestId) })); } catch (error) { next(error); }
  });
  app.post('/v1/marketplace-links/:grantId/revoke', requireCommerceSession, async (request: ScopedRequest, response, next) => {
    try { response.json(await installationLink.revoke(String(request.params.grantId), { accountId: request.accountId!, scope: request.sessionScope!, sourceGrantId: request.sourceGrantId })); } catch (error) { next(error); }
  });

  // ─── Platform Admin API (PA-1) ────────────────────────────────────────────
  // Separate operator identity from both customer (MarketplaceAccount) and publisher identities,
  // per docs/marketplace/platform-admin-interface-plan.md §2/§4. Never uses adminGuard's shared
  // bearer token -- that stays reserved for bootstrap/CI/break-glass automation (plan §13).
  const requirePlatformOperator = requirePlatformSession(platformAuth);
  const requireEnrollingOperator = requirePlatformSession(platformAuth, { allowUnverified: true });

  app.get('/platform/v1/openapi.json', (request, response) => {
    response.json(platformOpenApi(`${request.protocol}://${request.get('host')}`));
  });

  app.post('/platform/v1/auth/sessions', async (request, response, next) => {
    try { response.json(await platformAuth.login(request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/auth/sessions/refresh', async (request, response, next) => {
    try { response.json(await platformAuth.refreshSession(request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/auth/sessions/revoke', requireEnrollingOperator, async (request, response, next) => {
    try { response.json(await platformAuth.revokeSession(request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/auth/mfa/enroll', requireEnrollingOperator, async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await platformAuth.enrollMfa(request.operatorId!, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/auth/mfa/enroll/confirm', requireEnrollingOperator, async (request: PlatformRequest, response, next) => {
    try { response.json(await platformAuth.confirmMfaEnrollment(request.operatorId!, request.sessionId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/auth/password', requirePlatformOperator, async (request: PlatformRequest, response, next) => {
    try { response.json(await platformAuth.changePassword(request.operatorId!, request.sessionId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/me', requirePlatformOperator, async (request: PlatformRequest, response, next) => {
    try { response.json(await platformAuth.me(request.operatorId!)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/dashboard', requirePlatformOperator, requirePlatformPermission(platformAuth, 'platform.dashboard.read'), async (_request, response, next) => {
    try { response.json(await platformRead.dashboard()); } catch (error) { next(error); }
  });
  app.get('/platform/v1/payment-alerts', requirePlatformOperator, requirePlatformPermission(platformAuth, 'school_billing.read'), async (_request, response, next) => {
    try { response.json(await platformRead.pendingPaymentAlerts()); } catch (error) { next(error); }
  });
  // ── PA-2 read-only operations ──────────────────────────────────────────
  const P = (key: string) => requirePlatformPermission(platformAuth, key);

  app.get('/platform/v1/operators', requirePlatformOperator, P('operators.read'), async (request, response, next) => {
    try { response.json(await platformOperators.operators(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/plugin-requests', requirePlatformOperator, P('plugin_requests.read'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.platformRequests(request.query, request.operatorId!)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/plugin-requests/:requestId', requirePlatformOperator, P('plugin_requests.read'), async (request, response, next) => {
    try { response.json(await schoolPluginRequests.platformRequest(String(request.params.requestId))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/assign', requirePlatformOperator, P('plugin_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.assign(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/start-review', requirePlatformOperator, P('plugin_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.startReview(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/request-information', requirePlatformOperator, P('plugin_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.requestInformation(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/approve', requirePlatformOperator, P('plugin_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.approve(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/reject', requirePlatformOperator, P('plugin_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.reject(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/fulfill', requirePlatformOperator, P('schools.entitlements.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.fulfill(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/exception-proposals', requirePlatformOperator, P('schools.entitlements.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolPluginRequests.proposeException(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/plugin-requests/:requestId/exception-decisions', requirePlatformOperator, P('schools.entitlements.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolPluginRequests.decideException(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/operators/:operatorId', requirePlatformOperator, P('operators.read'), async (request, response, next) => {
    try { response.json(await platformOperators.operator(String(request.params.operatorId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/roles', requirePlatformOperator, P('operators.read'), async (_request, response, next) => {
    try { response.json(await platformOperators.roles()); } catch (error) { next(error); }
  });

  app.get('/platform/v1/customers', requirePlatformOperator, P('customers.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.customers(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/account-requests', requirePlatformOperator, P('customers.read'), async (request, response, next) => {
    try { response.json(await accountRequests.list(request.query)); } catch (error) { next(error); }
  });
  app.post('/platform/v1/account-requests/:requestId/approve', requirePlatformOperator, P('account_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await accountRequests.decide(String(request.params.requestId), request.operatorId!, true, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/account-requests/:requestId/reject', requirePlatformOperator, P('account_requests.review'), async (request: PlatformRequest, response, next) => {
    try { response.json(await accountRequests.decide(String(request.params.requestId), request.operatorId!, false, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  // Clears a customer's second factor so its owner can enrol a new one. It returns no secret --
  // the owner sees the replacement and the operator never does (see CustomerAccountService).
  app.post('/platform/v1/customers/:accountId/mfa/reset', requirePlatformOperator, P('customers.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerAccounts.resetMfa(String(request.params.accountId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  // Returns a working second factor to the operator. The recovery of last resort while the customer
  // portal has no enrolment screen -- see CustomerAccountService for what it costs.
  app.post('/platform/v1/customers/:accountId/mfa/issue', requirePlatformOperator, P('customers.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerAccounts.issueMfa(String(request.params.accountId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/customers/:accountId/password/reset', requirePlatformOperator, P('customers.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerAccounts.resetPassword(String(request.params.accountId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/customers/:accountId', requirePlatformOperator, P('customers.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.customer(String(request.params.accountId))); } catch (error) { next(error); }
  });
  // ── School directory (increment 1) ──────────────────────────────────────
  // `installations` above stays the raw registration view. These routes are the customer-facing
  // record an operator creates during a sale, which exists before any deployment does.
  app.get('/platform/v1/schools', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await customerSchools.schools(request.query)); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await customerSchools.create(request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/schools/provisioning-requests', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await schoolProvisioning.list(request.query)); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/provisioning-requests', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolProvisioning.create(request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/schools/provisioning-requests/:requestId', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await schoolProvisioning.get(String(request.params.requestId))); } catch (error) { next(error); }
  });
  for (const [action, invoke] of Object.entries({
    submit: schoolProvisioning.submit.bind(schoolProvisioning),
    approve: schoolProvisioning.approve.bind(schoolProvisioning),
    cancel: schoolProvisioning.cancel.bind(schoolProvisioning),
    retry: schoolProvisioning.retry.bind(schoolProvisioning),
  })) {
    app.post(`/platform/v1/schools/provisioning-requests/:requestId/${action}`, requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
      try { response.json(await invoke(String(request.params.requestId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
    });
  }
  app.get('/platform/v1/schools/:schoolId', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await customerSchools.school(String(request.params.schoolId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/schools/:schoolId/usage', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await customerSchools.usage(String(request.params.schoolId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/schools/:schoolId/plugins', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await customerSchools.plugins(String(request.params.schoolId))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/update', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.update(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/enrollment-tokens', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await customerSchools.mintEnrollmentToken(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/enrollment-tokens/:tokenId/revoke', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.revokeEnrollmentToken(String(request.params.schoolId), String(request.params.tokenId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  // Railway-first adoption (plan §8). Discovery is read-only and deliberately a POST: the gateway
  // it is asked to contact is an outbound effect, not a cacheable lookup.
  app.post('/platform/v1/schools/adoptions/discover', requirePlatformOperator, P('schools.manage'), async (request, response, next) => {
    try { response.json(await schoolDiscovery.discover(request.body)); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/infrastructure', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.recordInfrastructure(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/adopt-installation', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.adoptInstallation(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/suspend', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.suspend(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/reactivate', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.reactivate(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/terminate', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.terminate(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/delete', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.permanentlyDelete(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/railway-deleted', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.recordRailwayDeleted(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/restore', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.restore(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/domains', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await customerSchools.addDomain(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/domains/:domainId/verify', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.verifyDomain(String(request.params.schoolId), String(request.params.domainId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/domains/:domainId/remove', requirePlatformOperator, P('schools.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await customerSchools.removeDomain(String(request.params.schoolId), String(request.params.domainId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/schools/:schoolId/billing', requirePlatformOperator, P('school_billing.read'), async (request, response, next) => {
    try { response.json(await schoolBilling.billing(String(request.params.schoolId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/school-billing-plans', requirePlatformOperator, P('school_billing.read'), async (_request, response, next) => {
    try { response.json(await schoolBilling.plans()); } catch (error) { next(error); }
  });
  app.post('/platform/v1/school-billing-plans', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolBilling.createPlan(request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.patch('/platform/v1/school-billing-plans/:planId', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.updatePlan(String(request.params.planId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/school-billing-plans/:planId/delete', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.deletePlan(String(request.params.planId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  // Where Wattanam receives manual payments. Reading needs school_billing.read; changing where money
  // goes needs school_billing.manage and is audited, QR changes included.
  app.get('/platform/v1/school-payment-methods', requirePlatformOperator, P('school_billing.read'), async (_request, response, next) => {
    try { response.json(await schoolBilling.paymentMethods()); } catch (error) { next(error); }
  });
  app.post('/platform/v1/school-payment-methods', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolBilling.createPaymentMethod(request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.patch('/platform/v1/school-payment-methods/:methodId', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.updatePaymentMethod(String(request.params.methodId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/billing-plan', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.assignPlan(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/plan-invoices', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolBilling.issuePlanInvoice(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/school-billing-alerts/dispatch', requirePlatformOperator, P('school_billing.manage'), async (_request, response, next) => {
    try { response.json(await schoolBilling.dispatchDueAlerts()); } catch (error) { next(error); }
  });
  app.post('/platform/v1/school-billing-cycle/run', requirePlatformOperator, P('school_billing.manage'), async (_request, response, next) => {
    try { response.json(await schoolBilling.runBillingCycle()); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/invoices', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolBilling.issueInvoice(String(request.params.schoolId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/invoices/:invoiceId/payments', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.status(201).json(await schoolBilling.recordPayment(String(request.params.schoolId), String(request.params.invoiceId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/invoices/:invoiceId/notify', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.resendInvoiceNotification(String(request.params.schoolId), String(request.params.invoiceId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/payment-submissions/:submissionId/approve', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.decidePaymentSubmission(String(request.params.schoolId), String(request.params.submissionId), request.operatorId!, true, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/payment-submissions/:submissionId/reject', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.decidePaymentSubmission(String(request.params.schoolId), String(request.params.submissionId), request.operatorId!, false, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.post('/platform/v1/schools/:schoolId/invoices/:invoiceId/void', requirePlatformOperator, P('school_billing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await schoolBilling.voidInvoice(String(request.params.schoolId), String(request.params.invoiceId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });

  app.get('/platform/v1/installations', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.installations(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/installations/:registrationId', requirePlatformOperator, P('schools.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.installation(String(request.params.registrationId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/publishers', requirePlatformOperator, P('publishers.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.publishers(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/publishers/:publisherId', requirePlatformOperator, P('publishers.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.publisher(String(request.params.publisherId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/plugins', requirePlatformOperator, P('plugins.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.plugins(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/plugins/:pluginId', requirePlatformOperator, P('plugins.read'), async (request, response, next) => {
    try { response.json(await platformDirectory.plugin(String(request.params.pluginId))); } catch (error) { next(error); }
  });
  app.put('/platform/v1/plugins/:pluginId/pricing', requirePlatformOperator, P('plugins.pricing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await pluginPricing.configure(String(request.params.pluginId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.put('/platform/v1/plugins/:pluginId/promotion', requirePlatformOperator, P('plugins.pricing.manage'), async (request: PlatformRequest, response, next) => {
    try { response.json(await pluginPromotion.configure(String(request.params.pluginId), request.operatorId!, request.body, actionContext(request))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/starter-bundles', requirePlatformOperator, P('starter_bundles.read'), async (_request, response, next) => {
    try { response.json(await starterBundles.adminList()); } catch (error) { next(error); }
  });
  app.post('/platform/v1/starter-bundles', requirePlatformOperator, P('starter_bundles.manage'), async (request: PlatformRequest, response, next) => {
    try {
      const { internalReason, ...input } = request.body || {};
      response.status(201).json(await starterBundles.create(input, { operatorId: request.operatorId!, reason: String(internalReason || ''), context: actionContext(request) }));
    } catch (error) { next(error); }
  });
  app.post('/platform/v1/starter-bundles/:bundleId/publish', requirePlatformOperator, P('starter_bundles.publish'), async (request: PlatformRequest, response, next) => {
    try { response.json(await starterBundles.publish(String(request.params.bundleId), { operatorId: request.operatorId!, reason: String(request.body?.internalReason || ''), context: actionContext(request) })); } catch (error) { next(error); }
  });
  app.post('/platform/v1/starter-bundles/:bundleId/withdraw', requirePlatformOperator, P('starter_bundles.publish'), async (request: PlatformRequest, response, next) => {
    try { response.json(await starterBundles.withdraw(String(request.params.bundleId), { operatorId: request.operatorId!, reason: String(request.body?.internalReason || ''), context: actionContext(request) })); } catch (error) { next(error); }
  });
  app.get('/platform/v1/submissions', requirePlatformOperator, P('plugins.review'), async (request, response, next) => {
    try { response.json(await platformDirectory.submissions(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/submissions/:submissionId', requirePlatformOperator, P('plugins.review'), async (request, response, next) => {
    try { response.json(await platformDirectory.submission(String(request.params.submissionId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/orders', requirePlatformOperator, P('orders.read'), async (request, response, next) => {
    try { response.json(await platformCommerce.orders(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/orders/:orderId', requirePlatformOperator, P('orders.read'), async (request, response, next) => {
    try { response.json(await platformCommerce.order(String(request.params.orderId))); } catch (error) { next(error); }
  });
  app.get('/platform/v1/entitlements', requirePlatformOperator, P('orders.read'), async (request, response, next) => {
    try { response.json(await platformCommerce.entitlements(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/advisories', requirePlatformOperator, P('advisories.read'), async (request, response, next) => {
    try { response.json(await platformCommerce.advisories(request.query)); } catch (error) { next(error); }
  });
  app.get('/platform/v1/operations/health', requirePlatformOperator, P('operations.read'), async (_request, response, next) => {
    try { response.json(await platformCommerce.operationsHealth()); } catch (error) { next(error); }
  });
  app.get('/platform/v1/exports', requirePlatformOperator, P('audit.export'), async (request: PlatformRequest, response, next) => {
    try {
      const result = await platformExport.export(request.query, { operatorId: request.operatorId!, context: actionContext(request) });
      response.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${result.filename}"` });
      response.send(result.csv);
    } catch (error) { next(error); }
  });
  app.get('/platform/v1/audit-events', requirePlatformOperator, requirePlatformPermission(platformAuth, 'audit.read'), async (request: PlatformRequest, response, next) => {
    try { response.json(await platformRead.auditEvents(request.query, { operatorId: request.operatorId!, context: actionContext(request) })); } catch (error) { next(error); }
  });

  const requireAdmin = adminGuard(config.adminTokens);
  app.post('/admin/v1/publishers', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await repository.createOfficialPublisher(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-policies', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.publishPolicy(request.body)); } catch (error) { next(error); }
  });
  // These governance actions claim a specific acting identity (verifiedBy/approvedBy/reviewerId/etc.)
  // that requireAdmin's shared bearer token cannot authenticate -- anyone holding that one token
  // could otherwise name any two real reviewers/approvers in separate calls and forge the
  // two-person/no-self-review guarantees below. requireSession ties the claim to who is actually
  // logged in (the same session mechanism already used for publisher self-service), and the
  // request.accountId override always wins over whatever the body claims.
  app.post('/admin/v1/publishers/:publisherId/members', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.addVerifiedMember({ ...request.body, publisherId: request.params.publisherId, verifiedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/marketplace-reviewers', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.addMarketplaceReviewer(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publishers/:publisherId/approve', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.approvePublisher({ ...request.body, publisherId: request.params.publisherId, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-keys/:keyRecordId/approve', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.approveKey({ ...request.body, keyRecordId: request.params.keyRecordId, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-keys/:keyRecordId/revoke', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.revokeKey({ ...request.body, keyRecordId: request.params.keyRecordId, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/submissions/:submissionId/reviews', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.review({ ...request.body, submissionId: request.params.submissionId, reviewerId: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/revenue/orders/:orderId/record', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.recordOrderRevenue(String(request.params.orderId), request.body?.feeBasisPoints)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/revenue/refunds/:refundId/record', requireAdmin, async (request, response, next) => {
    try { response.json(await publisherGovernance.recordRefundRevenue(String(request.params.refundId))); } catch (error) { next(error); }
  });
  // correctEntry claims two distinct identities (createdBy/approvedBy) from a single call.
  // createdBy stays body-supplied here -- it records whoever originally proposed the correction
  // through an offline process this API has no way to independently witness -- but approvedBy,
  // the person actually finalizing it through this API call, is authenticated, not self-asserted.
  app.post('/admin/v1/revenue/corrections', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.correctEntry({ ...request.body, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-statements', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await publisherGovernance.generateStatement(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-payouts', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.status(201).json(await publisherGovernance.requestPayout({ ...request.body, requestedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-payouts/:payoutId/approve', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.approvePayout({ ...request.body, payoutId: request.params.payoutId, approvedBy: request.accountId })); } catch (error) { next(error); }
  });
  app.post('/admin/v1/publisher-payouts/:payoutId/paid', requireSession, async (request: Request & { accountId?: string }, response, next) => {
    try { response.json(await publisherGovernance.markPayoutPaid({ ...request.body, payoutId: request.params.payoutId, paidBy: request.accountId })); } catch (error) { next(error); }
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
  app.post('/admin/v1/starter-bundles', requireAdmin, async (request, response, next) => {
    try { response.status(201).json(await starterBundles.create(request.body)); } catch (error) { next(error); }
  });
  app.post('/admin/v1/starter-bundles/:bundleId/publish', requireAdmin, async (request, response, next) => {
    try { response.json(await starterBundles.publish(String(request.params.bundleId))); } catch (error) { next(error); }
  });
  app.post('/admin/v1/starter-bundles/:bundleId/withdraw', requireAdmin, async (request, response, next) => {
    try { response.json(await starterBundles.withdraw(String(request.params.bundleId))); } catch (error) { next(error); }
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
    if (error instanceof HttpError) {
      const body: Record<string, unknown> = { error: error.message };
      if (error.code) body.code = error.code;
      if (error.details !== undefined) body.details = error.details;
      return response.status(error.status).json(body);
    }
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
