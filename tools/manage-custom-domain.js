'use strict';

// B-007: automated custom-domain state machine -- pending -> verified -> active, with an
// explicit error state and a rollback path, matching the plan's exact acceptance bar
// ("Pending/verified/active/error states; exact DNS instructions; TLS and CORS verification")
// and the residual risk it names ("Domain misconfiguration breaks login... retain prior
// domain redirect; rollback canonical origin").
//
// Follows tools/provision-railway-school.js's established conventions exactly: dry-run
// unless --execute, a --confirm-domain double-check gate before any mutation, a journal file
// tracking state and history, and secrets never touching argv/journal (there are none here,
// but CORS_ORIGINS values are logged since they are not secret).
//
// Honest limitation, stated here rather than glossed over: the exact JSON shape Railway's
// `railway domain <custom-domain>` returns for "the required DNS records to add" has not been
// observed against a real project (this repo has no domain to test with) -- parseDnsInstructions
// below reads several plausible shapes defensively and fails loudly, not silently, if none
// match, rather than assuming a shape that might be wrong.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { checkCnameRecord, probeCustomDomain } = require('./custom-domain-dns');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const action = process.argv[2];
const execute = process.argv.includes('--execute');

function railway(args) {
  const result = spawnSync(process.platform === 'win32' ? 'railway.cmd' : 'railway', args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`Railway command failed (${args[0]}): ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

function loadJournal(file) {
  if (!fs.existsSync(file)) throw new Error(`Journal not found: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJournal(file, journal, action, result) {
  journal.history = journal.history || [];
  journal.history.push({ action, at: new Date().toISOString(), result });
  fs.writeFileSync(file, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
}

/**
 * Reads Railway's `railway domain <custom-domain>` response for the DNS record the operator
 * must add. Checked against a few plausible shapes (Railway's public docs describe returning
 * a CNAME target for custom domains, but the exact JSON field name is unverified here) --
 * throws with a clear message rather than silently returning something wrong if none match.
 */
function parseDnsInstructions(response) {
  const cnameTarget = response.cname || response.cnameTarget || response.target || response.dnsRecords?.[0]?.value || response.records?.[0]?.value;
  if (!cnameTarget) {
    throw new Error(
      'Could not find a CNAME target in the Railway CLI response for this custom domain. ' +
      'The exact response shape was not verified against a real project when this tool was written -- ' +
      `inspect the raw response and update parseDnsInstructions(): ${JSON.stringify(response)}`,
    );
  }
  return { type: 'CNAME', target: cnameTarget };
}

function actionRequest() {
  const domain = arg('domain');
  const projectId = arg('project');
  const environment = arg('environment') || 'production';
  const service = arg('service') || 'gateway';
  const slug = arg('school-slug');
  const canonicalOrigin = arg('canonical-origin');
  if (!domain || !projectId || !slug || !canonicalOrigin) {
    throw new Error('--domain, --project, --school-slug, and --canonical-origin are required');
  }
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) throw new Error('--domain does not look like a valid hostname');

  const railwayArgs = ['domain', domain, '--service', service, '--project', projectId, '--environment', environment, '--json'];
  if (!execute) {
    process.stdout.write(`${JSON.stringify({ mode: 'dry-run', action: 'request', command: ['railway', ...railwayArgs] }, null, 2)}\n`);
    return;
  }
  if (arg('confirm-domain') !== domain) throw new Error('--confirm-domain must exactly match --domain for execution');

  const response = railway(railwayArgs);
  const dnsInstructions = parseDnsInstructions(response);
  const journal = {
    schemaVersion: 1, slug, domain, projectId, environment, service, apiService: arg('api-service') || 'api',
    canonicalOrigin, state: 'pending', dnsInstructions, createdAt: new Date().toISOString(), history: [],
  };
  const journalFile = path.resolve(`custom-domain-${slug}.journal.json`);
  saveJournal(journalFile, journal, 'request', { dnsInstructions });
  process.stdout.write(`${JSON.stringify({ state: 'pending', domain, dnsInstructions, journalFile, instructionsForOperator: `Add a ${dnsInstructions.type} record: ${domain} -> ${dnsInstructions.target}` })}\n`);
}

/**
 * Pure decision logic for the verify transition, kept separate from the DNS lookup and file
 * I/O around it so it's unit-testable without depending on real (and, in some sandboxed
 * network environments, slow or unreliable) DNS timeout behavior.
 */
function decideVerifyState(dnsCheckResult) {
  if (dnsCheckResult.matched) return 'verified';
  if (dnsCheckResult.error && dnsCheckResult.error !== 'not_yet_propagated') return 'error';
  return 'pending';
}

async function actionVerify() {
  const journalFile = arg('journal');
  if (!journalFile) throw new Error('--journal is required');
  const journal = loadJournal(journalFile);
  if (journal.state !== 'pending' && journal.state !== 'error') {
    process.stdout.write(`${JSON.stringify({ state: journal.state, note: 'nothing to verify; not in pending/error state' })}\n`);
    return;
  }
  const result = await checkCnameRecord(journal.domain, journal.dnsInstructions.target);
  const nextState = decideVerifyState(result);
  journal.state = nextState;
  saveJournal(journalFile, journal, 'verify', result);
  process.stdout.write(`${JSON.stringify({ state: nextState, dnsCheck: result })}\n`);
}

async function actionActivate() {
  const journalFile = arg('journal');
  if (!journalFile) throw new Error('--journal is required');
  const journal = loadJournal(journalFile);
  if (journal.state !== 'verified') throw new Error(`Cannot activate from state "${journal.state}"; must be "verified" first (run the verify action)`);

  const probe = await probeCustomDomain(journal.domain, { expectedBodyIncludes: undefined });
  if (!probe.ok) {
    journal.state = 'error';
    saveJournal(journalFile, journal, 'activate', probe);
    process.stdout.write(`${JSON.stringify({ state: 'error', probe })}\n`);
    process.exitCode = 2;
    return;
  }

  const newCorsOrigins = [journal.canonicalOrigin, `https://${journal.domain}`].join(',');
  if (!execute) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run', action: 'activate', probe,
      command: ['railway', 'variable', 'set', `CORS_ORIGINS=${newCorsOrigins}`, '--service', journal.apiService, '--skip-deploys', '--json'],
    }, null, 2)}\n`);
    return;
  }

  railway(['variable', 'set', `CORS_ORIGINS=${newCorsOrigins}`, '--service', journal.apiService, '--project', journal.projectId, '--environment', journal.environment, '--skip-deploys', '--json']);
  journal.state = 'active';
  journal.corsOrigins = newCorsOrigins;
  saveJournal(journalFile, journal, 'activate', { probe, corsOrigins: newCorsOrigins });
  process.stdout.write(`${JSON.stringify({ state: 'active', probe, corsOrigins: newCorsOrigins })}\n`);
}

function actionRollback() {
  const journalFile = arg('journal');
  if (!journalFile) throw new Error('--journal is required');
  const journal = loadJournal(journalFile);
  if (!execute) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run', action: 'rollback',
      command: ['railway', 'variable', 'set', `CORS_ORIGINS=${journal.canonicalOrigin}`, '--service', journal.apiService, '--skip-deploys', '--json'],
    }, null, 2)}\n`);
    return;
  }
  railway(['variable', 'set', `CORS_ORIGINS=${journal.canonicalOrigin}`, '--service', journal.apiService, '--project', journal.projectId, '--environment', journal.environment, '--skip-deploys', '--json']);
  journal.state = 'rolled_back';
  journal.corsOrigins = journal.canonicalOrigin;
  saveJournal(journalFile, journal, 'rollback', { corsOrigins: journal.canonicalOrigin });
  process.stdout.write(`${JSON.stringify({ state: 'rolled_back', corsOrigins: journal.canonicalOrigin })}\n`);
}

async function main() {
  if (action === 'request') return actionRequest();
  if (action === 'verify') return actionVerify();
  if (action === 'activate') return actionActivate();
  if (action === 'rollback') return actionRollback();
  process.stdout.write(
    'Usage: node tools/manage-custom-domain.js <request|verify|activate|rollback> [options] [--execute]\n' +
    '  request  --domain <d> --project <id> --school-slug <s> --canonical-origin <url> [--environment <e>] [--service gateway] [--api-service api] [--execute --confirm-domain <d>]\n' +
    '  verify   --journal <file>                          (read-only DNS check; no --execute needed)\n' +
    '  activate --journal <file> [--execute]               (TLS/content probe always runs; --execute also updates CORS_ORIGINS)\n' +
    '  rollback --journal <file> --execute                 (reverts CORS_ORIGINS to the canonical origin only)\n',
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseDnsInstructions, decideVerifyState };
