/**
 * The permission namespace and starter role set from
 * docs/marketplace/platform-admin-interface-plan.md §3, seeded idempotently so every
 * environment (dev, CI, production) has the same permission keys to grant against —
 * PA-2 onward will use permissions this list doesn't yet reference, which is fine,
 * they just won't be granted to anything until a later stage's seed extends this.
 */
export const PLATFORM_PERMISSIONS: Array<{ key: string; description: string }> = [
  { key: 'platform.dashboard.read', description: 'View the platform admin dashboard' },
  { key: 'operators.read', description: 'View platform operator accounts and role grants' },
  { key: 'operators.manage', description: 'Create, suspend, and change role grants for platform operators' },
  { key: 'customers.read', description: 'View marketplace customer accounts' },
  { key: 'customers.manage', description: 'Suspend or correct marketplace customer accounts' },
  { key: 'account_requests.review', description: 'Approve or reject marketplace account requests' },
  { key: 'schools.read', description: 'View school installations' },
  { key: 'schools.manage', description: 'Correct or unlink school installation records' },
  { key: 'schools.entitlements.manage', description: 'Issue, revoke, or correct a school installation entitlement' },
  { key: 'school_billing.read', description: 'View customer-school invoices, balances, and payments' },
  { key: 'school_billing.manage', description: 'Issue or void school invoices and record received payments' },
  { key: 'plugin_requests.read', description: 'View school plugin requests' },
  { key: 'plugin_requests.review', description: 'Approve, reject, or request information on a school plugin request' },
  { key: 'publishers.read', description: 'View publisher applications and identity evidence' },
  { key: 'publishers.review', description: 'Review publisher applications and policy acceptance' },
  { key: 'publishers.manage', description: 'Manage publisher identity, members, and signing-key approval' },
  { key: 'plugins.read', description: 'View plugin catalog entries and releases' },
  { key: 'plugins.create', description: 'Create plugin catalog entries' },
  { key: 'plugins.review', description: 'Review plugin submissions' },
  { key: 'plugins.publish', description: 'Publish or promote a plugin release' },
  { key: 'plugins.withdraw', description: 'Withdraw a plugin release' },
  { key: 'starter_bundles.read', description: 'View curated starter bundles' },
  { key: 'starter_bundles.manage', description: 'Create curated starter-bundle drafts' },
  { key: 'starter_bundles.publish', description: 'Publish or withdraw curated starter bundles' },
  { key: 'builds.read', description: 'View plugin build jobs and evidence' },
  { key: 'builds.run', description: 'Start a plugin build' },
  { key: 'builds.cancel', description: 'Cancel a running plugin build' },
  { key: 'orders.read', description: 'View marketplace orders' },
  { key: 'refunds.create', description: 'Issue a refund' },
  { key: 'entitlements.manage', description: 'Manually correct or revoke an entitlement' },
  { key: 'revenue.read', description: 'View publisher revenue ledger and statements' },
  { key: 'payouts.request', description: 'Request a publisher payout' },
  { key: 'payouts.approve', description: 'Approve a publisher payout (never the requester)' },
  { key: 'payouts.mark_paid', description: 'Mark an approved payout as paid' },
  { key: 'advisories.read', description: 'View security advisories' },
  { key: 'advisories.manage', description: 'Publish or manage a security advisory' },
  { key: 'support.read', description: 'View support cases' },
  { key: 'support.manage', description: 'Act on support cases' },
  { key: 'audit.read', description: 'Read platform audit events' },
  { key: 'audit.export', description: 'Export platform audit events' },
  { key: 'operations.read', description: 'View marketplace operational health' },
  { key: 'operations.manage', description: 'Act on marketplace operational incidents' },
];

/** Plan §3's starter role set, each with its listed main permissions. Explicit restrictions named
 * in the plan (e.g. "cannot bypass two-person approvals") are enforced in code where the relevant
 * feature exists, not encoded as a permission absence here -- a missing permission blocks an
 * action outright, whereas several plan restrictions are about *how* an allowed action must be
 * performed (with a second approver), which a boolean permission can't express on its own. */
export const PLATFORM_ROLES: Array<{ key: string; displayName: string; description: string; permissions: string[] }> = [
  {
    key: 'platform_owner', displayName: 'Platform Owner',
    description: 'Configuration, role assignment, and emergency controls. Cannot bypass two-person approvals.',
    permissions: ['platform.dashboard.read', 'operators.read', 'operators.manage', 'audit.read', 'audit.export', 'operations.read', 'operations.manage'],
  },
  {
    key: 'marketplace_operator', displayName: 'Marketplace Operator',
    description: 'Catalog, schools, plugin requests, and manual entitlements. No key custody or payout approval.',
    permissions: ['platform.dashboard.read', 'customers.read', 'account_requests.review', 'schools.read', 'schools.manage', 'schools.entitlements.manage', 'school_billing.read', 'plugin_requests.read', 'plugin_requests.review', 'plugins.read', 'starter_bundles.read', 'starter_bundles.manage', 'starter_bundles.publish'],
  },
  {
    key: 'plugin_reviewer', displayName: 'Plugin Reviewer',
    description: 'Submissions, automated reports, and manual review decisions. Cannot review own publisher/submission.',
    permissions: ['platform.dashboard.read', 'plugins.read', 'plugins.review', 'builds.read'],
  },
  {
    key: 'security_reviewer', displayName: 'Security Reviewer',
    description: 'Security findings, advisories, and emergency withdrawal. Cannot alter revenue records.',
    permissions: ['platform.dashboard.read', 'plugins.read', 'plugins.withdraw', 'advisories.read', 'advisories.manage', 'builds.read'],
  },
  {
    key: 'customer_support', displayName: 'Customer Support',
    description: 'Customer/school/request/support views and limited corrections. Sensitive values masked; no release publication.',
    permissions: ['platform.dashboard.read', 'customers.read', 'customers.manage', 'schools.read', 'plugin_requests.read', 'support.read', 'support.manage'],
  },
  {
    key: 'finance_operator', displayName: 'Finance Operator',
    description: 'Orders, refunds, statements, and reconciliation. Cannot publish or sign plugins.',
    permissions: ['platform.dashboard.read', 'orders.read', 'refunds.create', 'entitlements.manage', 'revenue.read', 'school_billing.read', 'school_billing.manage'],
  },
  {
    key: 'payout_approver', displayName: 'Payout Approver',
    description: 'Payout approval and completion. Requester cannot approve own payout.',
    permissions: ['platform.dashboard.read', 'revenue.read', 'payouts.approve', 'payouts.mark_paid'],
  },
  {
    key: 'publisher_manager', displayName: 'Publisher Manager',
    description: 'Publisher identity, members, policies, and signing-key approval. Second-person key approval required.',
    permissions: ['platform.dashboard.read', 'publishers.read', 'publishers.review', 'publishers.manage'],
  },
  {
    key: 'auditor', displayName: 'Auditor',
    description: 'Read-only access to all audit-safe records and exports. No mutations.',
    permissions: ['platform.dashboard.read', 'customers.read', 'schools.read', 'school_billing.read', 'plugin_requests.read', 'publishers.read', 'plugins.read', 'starter_bundles.read', 'orders.read', 'revenue.read', 'advisories.read', 'support.read', 'audit.read', 'audit.export', 'operations.read'],
  },
];
