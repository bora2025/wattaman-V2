type Method = 'get' | 'post';

interface OperationOptions {
  summary: string;
  permission?: string;
  public?: boolean;
  contentType?: string;
}

function operation({ summary, permission, public: isPublic, contentType = 'application/json' }: OperationOptions) {
  return {
    summary,
    operationId: summary.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    tags: [summary.split(' ')[0]],
    ...(isPublic ? { security: [] } : {}),
    ...(permission ? { 'x-wattanam-permission': permission } : {}),
    responses: {
      '200': { description: 'Successful response', content: { [contentType]: { schema: contentType === 'text/csv' ? { type: 'string' } : { type: 'object', additionalProperties: true } } } },
      ...(!isPublic ? {
        '401': { description: 'A verified platform operator session is required' },
        '403': { description: 'The operator lacks the required permission' },
      } : {}),
    },
  };
}

function path(method: Method, options: OperationOptions) {
  return { [method]: operation(options) };
}

/**
 * PA-2 contract source for the browser-facing platform operator API. Business payload schemas will
 * become named components as each later mutation stage lands; this first document makes route,
 * method, authentication, permission, and response media-type drift mechanically testable now.
 */
export function platformOpenApi(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Wattanam Platform Admin API', version: '0.2.0',
      description: 'Central marketplace operator control plane. Never connects to a customer school database.',
    },
    servers: [{ url: baseUrl }],
    security: [{ platformBearer: [] }],
    tags: ['Auth', 'Dashboard', 'Operators', 'Directory', 'Plugins', 'Commerce', 'Security', 'Audit', 'Operations'].map(name => ({ name })),
    paths: {
      '/platform/v1/auth/sessions': path('post', { summary: 'Auth create session', public: true }),
      '/platform/v1/auth/sessions/refresh': path('post', { summary: 'Auth refresh session', public: true }),
      '/platform/v1/auth/sessions/revoke': path('post', { summary: 'Auth revoke session' }),
      '/platform/v1/auth/mfa/enroll': path('post', { summary: 'Auth enroll MFA' }),
      '/platform/v1/auth/mfa/enroll/confirm': path('post', { summary: 'Auth confirm MFA enrollment' }),
      '/platform/v1/auth/password': path('post', { summary: 'Auth change own password' }),
      '/platform/v1/me': path('get', { summary: 'Operators get current operator' }),
      '/platform/v1/dashboard': path('get', { summary: 'Dashboard get aggregates', permission: 'platform.dashboard.read' }),
      '/platform/v1/operators': path('get', { summary: 'Operators list operators', permission: 'operators.read' }),
      '/platform/v1/operators/{operatorId}': path('get', { summary: 'Operators get operator', permission: 'operators.read' }),
      '/platform/v1/roles': path('get', { summary: 'Operators list roles', permission: 'operators.read' }),
      '/platform/v1/customers': path('get', { summary: 'Directory list customers', permission: 'customers.read' }),
      '/platform/v1/customers/{accountId}/mfa/reset': path('post', { summary: 'Directory reset customer MFA', permission: 'customers.manage' }),
      '/platform/v1/customers/{accountId}/mfa/issue': path('post', { summary: 'Directory issue customer MFA', permission: 'customers.manage' }),
      '/platform/v1/customers/{accountId}/password/reset': path('post', { summary: 'Directory reset customer password', permission: 'customers.manage' }),
      '/platform/v1/customers/{accountId}': path('get', { summary: 'Directory get customer', permission: 'customers.read' }),
      '/platform/v1/schools': { ...path('get', { summary: 'Directory list schools', permission: 'schools.read' }), ...path('post', { summary: 'Directory create school', permission: 'schools.manage' }) },
      '/platform/v1/schools/provisioning-requests': { ...path('get', { summary: 'List durable school provisioning requests', permission: 'schools.read' }), ...path('post', { summary: 'Create a school provisioning request', permission: 'schools.manage' }) },
      '/platform/v1/schools/provisioning-requests/{requestId}': path('get', { summary: 'Get a school provisioning request', permission: 'schools.read' }),
      '/platform/v1/schools/provisioning-requests/{requestId}/submit': path('post', { summary: 'Submit provisioning for approval', permission: 'schools.manage' }),
      '/platform/v1/schools/provisioning-requests/{requestId}/approve': path('post', { summary: 'Approve provisioning as a second operator', permission: 'schools.manage' }),
      '/platform/v1/schools/provisioning-requests/{requestId}/cancel': path('post', { summary: 'Cancel provisioning', permission: 'schools.manage' }),
      '/platform/v1/schools/provisioning-requests/{requestId}/retry': path('post', { summary: 'Retry failed provisioning', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}': path('get', { summary: 'Directory get school', permission: 'schools.read' }),
      '/platform/v1/schools/{schoolId}/update': path('post', { summary: 'Directory update school', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/enrollment-tokens': path('post', { summary: 'Directory mint school enrollment token', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/enrollment-tokens/{tokenId}/revoke': path('post', { summary: 'Directory revoke school enrollment token', permission: 'schools.manage' }),
      '/platform/v1/schools/adoptions/discover': path('post', { summary: 'Directory discover school for adoption', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/infrastructure': path('post', { summary: 'Directory record school infrastructure', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/adopt-installation': path('post', { summary: 'Directory adopt school installation', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/usage': path('get', { summary: 'Directory get marketplace-observed school usage', permission: 'schools.read' }),
      '/platform/v1/schools/{schoolId}/suspend': path('post', { summary: 'Directory suspend active school', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/reactivate': path('post', { summary: 'Directory reactivate suspended school', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/terminate': path('post', { summary: 'Directory soft-delete school', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/domains': path('post', { summary: 'Directory add school domain', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/domains/{domainId}/verify': path('post', { summary: 'Directory update domain verification', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/domains/{domainId}/remove': path('post', { summary: 'Directory remove school domain', permission: 'schools.manage' }),
      '/platform/v1/schools/{schoolId}/billing': path('get', { summary: 'Finance get school billing ledger', permission: 'school_billing.read' }),
      '/platform/v1/school-billing-plans': { get: operation({ summary: 'Finance list central school prices', permission: 'school_billing.read' }), post: operation({ summary: 'Finance create central school price', permission: 'school_billing.manage' }) },
      '/platform/v1/school-billing-plans/{planId}': { patch: operation({ summary: 'Finance update or archive a central school price', permission: 'school_billing.manage' }) },
      '/platform/v1/schools/{schoolId}/billing-plan': path('post', { summary: 'Finance assign central price to school', permission: 'school_billing.manage' }),
      '/platform/v1/schools/{schoolId}/plan-invoices': path('post', { summary: 'Finance invoice school from central price', permission: 'school_billing.manage' }),
      '/platform/v1/school-billing-alerts/dispatch': path('post', { summary: 'Finance dispatch due and overdue school alerts', permission: 'school_billing.manage' }),
      '/platform/v1/school-billing-cycle/run': path('post', { summary: 'Finance run the recurring subscription billing cycle', permission: 'school_billing.manage' }),
      '/platform/v1/schools/{schoolId}/invoices': path('post', { summary: 'Finance issue school invoice', permission: 'school_billing.manage' }),
      '/platform/v1/schools/{schoolId}/invoices/{invoiceId}/payments': path('post', { summary: 'Finance record school payment', permission: 'school_billing.manage' }),
      '/platform/v1/schools/{schoolId}/invoices/{invoiceId}/void': path('post', { summary: 'Finance void unpaid school invoice', permission: 'school_billing.manage' }),
      '/platform/v1/schools/{schoolId}/payment-submissions/{submissionId}/approve': path('post', { summary: 'Finance approve verified customer payment evidence', permission: 'school_billing.manage' }),
      '/platform/v1/schools/{schoolId}/payment-submissions/{submissionId}/reject': path('post', { summary: 'Finance reject customer payment evidence', permission: 'school_billing.manage' }),
      '/platform/v1/installations': path('get', { summary: 'Directory list installations', permission: 'schools.read' }),
      '/platform/v1/installations/{registrationId}': path('get', { summary: 'Directory get installation', permission: 'schools.read' }),
      '/platform/v1/publishers': path('get', { summary: 'Directory list publishers', permission: 'publishers.read' }),
      '/platform/v1/publishers/{publisherId}': path('get', { summary: 'Directory get publisher', permission: 'publishers.read' }),
      '/platform/v1/plugins': path('get', { summary: 'Plugins list plugins', permission: 'plugins.read' }),
      '/platform/v1/plugins/{pluginId}': path('get', { summary: 'Plugins get plugin', permission: 'plugins.read' }),
      '/platform/v1/submissions': path('get', { summary: 'Plugins list submissions', permission: 'plugins.review' }),
      '/platform/v1/submissions/{submissionId}': path('get', { summary: 'Plugins get submission', permission: 'plugins.review' }),
      '/platform/v1/plugin-requests': path('get', { summary: 'Plugins list school requests', permission: 'plugin_requests.read' }),
      '/platform/v1/plugin-requests/{requestId}': path('get', { summary: 'Plugins get school request', permission: 'plugin_requests.read' }),
      '/platform/v1/plugin-requests/{requestId}/assign': path('post', { summary: 'Plugins assign school request', permission: 'plugin_requests.review' }),
      '/platform/v1/plugin-requests/{requestId}/start-review': path('post', { summary: 'Plugins start school request review', permission: 'plugin_requests.review' }),
      '/platform/v1/plugin-requests/{requestId}/request-information': path('post', { summary: 'Plugins request school information', permission: 'plugin_requests.review' }),
      '/platform/v1/plugin-requests/{requestId}/approve': path('post', { summary: 'Plugins approve school request', permission: 'plugin_requests.review' }),
      '/platform/v1/plugin-requests/{requestId}/reject': path('post', { summary: 'Plugins reject school request', permission: 'plugin_requests.review' }),
      '/platform/v1/plugin-requests/{requestId}/fulfill': path('post', { summary: 'Commerce fulfil school request', permission: 'schools.entitlements.manage' }),
      '/platform/v1/plugin-requests/{requestId}/exception-proposals': path('post', { summary: 'Commerce propose exceptional school entitlement', permission: 'schools.entitlements.manage' }),
      '/platform/v1/plugin-requests/{requestId}/exception-decisions': path('post', { summary: 'Commerce decide exceptional school entitlement', permission: 'schools.entitlements.manage' }),
      '/platform/v1/orders': path('get', { summary: 'Commerce list orders', permission: 'orders.read' }),
      '/platform/v1/orders/{orderId}': path('get', { summary: 'Commerce get order', permission: 'orders.read' }),
      '/platform/v1/entitlements': path('get', { summary: 'Commerce list entitlements', permission: 'orders.read' }),
      '/platform/v1/advisories': path('get', { summary: 'Security list advisories', permission: 'advisories.read' }),
      '/platform/v1/audit-events': path('get', { summary: 'Audit list events', permission: 'audit.read' }),
      '/platform/v1/exports': path('get', { summary: 'Audit export records', permission: 'audit.export', contentType: 'text/csv' }),
      '/platform/v1/operations/health': path('get', { summary: 'Operations get health', permission: 'operations.read' }),
    },
    components: {
      securitySchemes: { platformBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' } },
      schemas: {
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'string' } } },
        Page: { type: 'object', required: ['items', 'nextCursor'], properties: { items: { type: 'array', items: {} }, nextCursor: { type: ['string', 'null'] } } },
      },
    },
  } as const;
}
