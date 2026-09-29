/**
 * E-010 partial certification: the cross-service commerce -> entitlement -> offline-use spine.
 *
 * The marketplace ISSUES entitlements (apps/marketplace-api/src/entitlement.ts) and the school
 * INDEPENDENTLY VERIFIES them (backend/src/marketplace/entitlement-verification.ts). Those are two
 * separately-written implementations of canonical JSON and window validation that unit tests in
 * either app cannot check against each other. This drill runs the REAL production classes end to
 * end so canonicalization or claim-shape drift between the two services fails loudly here.
 *
 * Run: npx tsx scripts/commerce-offline-certification.ts   (from apps/marketplace-api)
 */
import { generateKeyPairSync } from 'node:crypto';
import { CommerceService } from '../src/commerce.service';
import { verifyFetchedEntitlement } from '../../../backend/src/marketplace/entitlement-verification';

const SCHOOL_INSTALLATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_SCHOOL_INSTALLATION_ID = '22222222-2222-4222-8222-222222222222';
const PLUGIN_ID = 'official.attendance';
const PURCHASE_AT = new Date('2026-08-28T00:00:00.000Z');

let passed = 0;
let failed = 0;

function check(description: string, condition: boolean) {
  if (condition) { passed += 1; console.log(`PASS ${description}`); }
  else { failed += 1; console.log(`FAIL ${description}`); }
}

function rejects(description: string, run: () => unknown, expected: RegExp) {
  try {
    run();
    failed += 1;
    console.log(`FAIL ${description} (expected a rejection, got success)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (expected.test(message)) { passed += 1; console.log(`PASS ${description}`); }
    else { failed += 1; console.log(`FAIL ${description} (rejected with unexpected message: ${message})`); }
  }
}

function entitlementKeyPair() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** In-memory stand-in for a Prisma transaction, shaped exactly like the rows CommerceService reads. */
function purchaseTransaction(options: { licenseDays: number; updatesDays: number; issuedAt: Date }) {
  const state: { orderStatus: string; entitlement: any } = { orderStatus: 'PENDING', entitlement: null };
  const line = {
    id: 'line-1', pluginId: PLUGIN_ID, unitPriceMinor: 2500, entitlement: null,
    price: { amountMinor: 2500, licensedMajor: 1, licenseDays: options.licenseDays, updatesDays: options.updatesDays },
    plugin: { publisherId: 'publisher-1' },
  };
  const tx: any = {
    marketplacePayment: {
      findUnique: async () => null,
      create: async ({ data }: any) => ({ id: 'payment-1', ...data }),
      update: async ({ data }: any) => ({ id: 'payment-1', orderId: 'order-1', ...data }),
    },
    marketplaceOrder: {
      findUnique: async () => ({
        id: 'order-1', accountId: 'customer-1', installationId: 'registration-row-1', status: state.orderStatus,
        totalMinor: 2500, currency: 'USD',
        account: {}, installation: { installationId: SCHOOL_INSTALLATION_ID }, lines: [line],
        payments: [{ id: 'payment-1', status: 'SUCCEEDED', amountMinor: 2500 }], refunds: [],
      }),
      update: async ({ data }: any) => { state.orderStatus = data.status; return {}; },
    },
    publisherRevenueEntry: { upsert: async ({ create }: any) => ({ id: 'revenue-1', ...create }) },
    schoolPluginRequest: { findUnique: async () => null },
    installationEntitlement: {
      findUnique: async () => state.entitlement ? { generation: state.entitlement.generation } : null,
      upsert: async ({ create }: any) => { state.entitlement = create; return { id: 'entitlement-1' }; },
      update: async ({ data }: any) => { state.entitlement = { ...state.entitlement, ...data }; return {}; },
    },
    marketplaceRefund: { create: async ({ data }: any) => ({ id: 'refund-1', ...data }) },
  };
  return { tx, state };
}

async function main() {
  const entitlementKey = entitlementKeyPair();
  const config: any = {
    publicBaseUrl: 'https://marketplace.wattanam.example',
    entitlementPrivateKey: entitlementKey.privateKey,
    entitlementKeyId: 'entitlement-2026',
  };
  const commerce = new CommerceService({} as any, config);
  const pinnedKeys = new Map([['entitlement-2026', entitlementKey.publicKey]]);

  console.log('== E-010: purchase issues a token the school independently accepts ==');
  const purchase = purchaseTransaction({ licenseDays: 365, updatesDays: 180, issuedAt: PURCHASE_AT });
  const fulfillment = await commerce.settleProviderPayment(
    purchase.tx, { orderId: 'order-1', provider: 'manual', providerReference: 'invoice-2026-001' }, PURCHASE_AT,
  );
  check('settlement marks the order PAID', fulfillment.status === 'PAID');
  check('settlement issued exactly one entitlement', fulfillment.entitlementIds.length === 1);
  const issuedToken = purchase.state.entitlement.signedToken;
  check('the issued entitlement carries a signed token', !!issuedToken?.payload && !!issuedToken?.signature);

  const dayAfter = new Date(PURCHASE_AT.getTime() + 86_400_000);
  let verifiedPayload: any;
  try {
    verifiedPayload = verifyFetchedEntitlement(issuedToken, pinnedKeys, {
      installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter,
    });
    passed += 1;
    console.log('PASS the school verifier accepts the marketplace-issued token (cross-service canonical JSON agrees)');
  } catch (error) {
    failed += 1;
    console.log(`FAIL the school verifier rejected a legitimately issued token: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (verifiedPayload) {
    check('verified token is bound to the purchasing installation', verifiedPayload.installationId === SCHOOL_INSTALLATION_ID);
    check('verified token is bound to the purchased product', verifiedPayload.productId === PLUGIN_ID);
    check('verified token carries the licensed major range', verifiedPayload.licensedMajorRange === '^1.0.0');
  }

  console.log('\n== E-010: offline use (verification is local, no marketplace contact) ==');
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = () => { throw new Error('network must not be used during offline verification'); };
  try {
    verifyFetchedEntitlement(issuedToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter });
    passed += 1;
    console.log('PASS a cached token verifies with the network disabled entirely');
  } catch (error) {
    failed += 1;
    console.log(`FAIL offline verification attempted network or failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    (globalThis as any).fetch = originalFetch;
  }

  const midWindow = new Date(PURCHASE_AT.getTime() + 200 * 86_400_000);
  try {
    verifyFetchedEntitlement(issuedToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: midWindow });
    passed += 1;
    console.log('PASS the token still verifies long after its offline-recheck deadline has passed (outage must not disable a paid plugin)');
  } catch (error) {
    failed += 1;
    console.log(`FAIL an elapsed offline-recheck deadline wrongly invalidated the token: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n== E-010: token binding and tamper matrix ==');
  rejects('replaying the token against another school installation is rejected',
    () => verifyFetchedEntitlement(issuedToken, pinnedKeys, { installationId: OTHER_SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter }),
    /another installation/);
  rejects('using the token for a different plugin is rejected',
    () => verifyFetchedEntitlement(issuedToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: 'official.other-plugin', now: dayAfter }),
    /another product/);

  const tampered = structuredClone(issuedToken);
  tampered.payload.expiresAt = new Date(PURCHASE_AT.getTime() + 3650 * 86_400_000).toISOString();
  rejects('extending the expiry inside the payload invalidates the signature',
    () => verifyFetchedEntitlement(tampered, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter }),
    /signature is invalid/i);

  const foreignKey = entitlementKeyPair();
  rejects('a token signed by an untrusted key is rejected',
    () => verifyFetchedEntitlement(issuedToken, new Map([['entitlement-2026', foreignKey.publicKey]]), { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter }),
    /signature is invalid/i);
  rejects('a token whose key id is not pinned at all is rejected',
    () => verifyFetchedEntitlement(issuedToken, new Map([['some-other-key', foreignKey.publicKey]]), { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter }),
    /not trusted/);

  console.log('\n== E-010: clock and expiry matrix ==');
  const beforeIssue = new Date(PURCHASE_AT.getTime() - 86_400_000);
  rejects('a rolled-back clock before the validity window is rejected',
    () => verifyFetchedEntitlement(issuedToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: beforeIssue }),
    /not active yet/);
  const afterExpiry = new Date(PURCHASE_AT.getTime() + 400 * 86_400_000);
  rejects('a token past its expiry is rejected',
    () => verifyFetchedEntitlement(issuedToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: afterExpiry }),
    /expired/);

  console.log('\n== E-010: renewal issues a fresh, longer-lived token ==');
  const renewalAt = new Date(PURCHASE_AT.getTime() + 350 * 86_400_000);
  const renewal = purchaseTransaction({ licenseDays: 365, updatesDays: 365, issuedAt: renewalAt });
  await commerce.settleProviderPayment(renewal.tx, { orderId: 'order-1', provider: 'manual', providerReference: 'invoice-2027-001' }, renewalAt);
  const renewedToken = renewal.state.entitlement.signedToken;
  check('the renewal token is a distinct token, not a reissue of the same id', renewedToken.payload.tokenId !== issuedToken.payload.tokenId);
  try {
    verifyFetchedEntitlement(renewedToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: afterExpiry });
    passed += 1;
    console.log('PASS the renewal token verifies at a date where the original had already expired');
  } catch (error) {
    failed += 1;
    console.log(`FAIL the renewal token failed verification: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('\n== E-010: entitlement-key rotation overlap ==');
  const rotatedKey = entitlementKeyPair();
  const rotatedConfig: any = { ...config, entitlementPrivateKey: rotatedKey.privateKey, entitlementKeyId: 'entitlement-2027' };
  const rotatedCommerce = new CommerceService({} as any, rotatedConfig);
  const rotatedPurchase = purchaseTransaction({ licenseDays: 365, updatesDays: 180, issuedAt: renewalAt });
  await rotatedCommerce.settleProviderPayment(rotatedPurchase.tx, { orderId: 'order-1', provider: 'manual', providerReference: 'invoice-2027-002' }, renewalAt);
  const rotatedToken = rotatedPurchase.state.entitlement.signedToken;
  const overlapKeys = new Map([['entitlement-2026', entitlementKey.publicKey], ['entitlement-2027', rotatedKey.publicKey]]);
  try {
    verifyFetchedEntitlement(rotatedToken, overlapKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: renewalAt });
    verifyFetchedEntitlement(issuedToken, overlapKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter });
    passed += 1;
    console.log('PASS during a pinned-key overlap the school accepts tokens signed by both the old and the new entitlement key');
  } catch (error) {
    failed += 1;
    console.log(`FAIL key-rotation overlap broke verification: ${error instanceof Error ? error.message : String(error)}`);
  }
  rejects('once the old key is unpinned its tokens stop verifying',
    () => verifyFetchedEntitlement(issuedToken, new Map([['entitlement-2027', rotatedKey.publicKey]]), { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter }),
    /not trusted/);

  console.log('\n== E-010: refund revokes server-side entitlement (documented offline caveat) ==');
  const refundTx = purchaseTransaction({ licenseDays: 365, updatesDays: 180, issuedAt: PURCHASE_AT });
  await commerce.settleProviderPayment(refundTx.tx, { orderId: 'order-1', provider: 'manual', providerReference: 'invoice-2026-002' }, PURCHASE_AT);
  const refundedLineToken = refundTx.state.entitlement.signedToken;
  refundTx.tx.marketplaceOrder.findUnique = async () => ({
    id: 'order-1', status: 'PAID', refunds: [],
    payments: [{ id: 'payment-1', status: 'SUCCEEDED', amountMinor: 2500 }],
    lines: [{ id: 'line-1', entitlement: {
      id: 'entitlement-1', status: 'ACTIVE', signedToken: refundTx.state.entitlement.signedToken,
    } }],
  });
  const reversal = await commerce.reverseOrder(refundTx.tx, { orderId: 'order-1', reason: 'customer requested cancellation', initiatedBy: 'admin' }, renewalAt);
  check('refunding the order reverses it and marks the entitlement', reversal.status === 'REFUNDED' && reversal.entitlementIds.length === 1);
  check('the refunded entitlement is recorded as REFUNDED server-side', refundTx.state.entitlement.status === 'REFUNDED');
  let refundedStillVerifies = false;
  try {
    verifyFetchedEntitlement(refundedLineToken, pinnedKeys, { installationId: SCHOOL_INSTALLATION_ID, productId: PLUGIN_ID, now: dayAfter });
    refundedStillVerifies = true;
  } catch { refundedStillVerifies = false; }
  check('a token already delivered before the refund still verifies offline until it expires (expected: revocation is server-side and takes effect on the next refresh, per plan 11.2 "refund stops future downloads and renewals")', refundedStillVerifies);

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} (${passed}/${passed + failed})`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
