/**
 * Provisions a disposable stack for the browser E2E suite: PostgreSQL in Docker, the marketplace
 * API built from source, and this app served from its production build — then runs Playwright
 * against it and tears everything down.
 *
 * Deliberately uses a real database and real services. The properties these tests exist to prove
 * (mandatory MFA gating, deny-by-default authorization, the session token never reaching browser
 * JS, audit rows actually being written) are exactly the ones a mocked backend would hide.
 *
 *   node scripts/e2e-stack.mjs            # provision, run, tear down
 *   node scripts/e2e-stack.mjs --keep     # leave the stack running for interactive debugging
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const adminDir = path.resolve(here, '..');
const apiDir = path.resolve(adminDir, '../marketplace-api');

const CONTAINER = 'wattanam-platform-e2e';
const PG_PORT = 15440;
const API_PORT = 4110;
const WEB_PORT = 4120;
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${PG_PORT}/platform_e2e`;
const FIXTURES = path.join(adminDir, '.e2e-fixtures.json');
const keep = process.argv.includes('--keep');

const children = [];
let torndown = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'pipe', encoding: 'utf8', shell: true, ...options });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function startBackground(command, args, options) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'], shell: true,
    // Its own process group on POSIX, so teardown's negative-pid signal reaches the server and not
    // just the shell that launched it.
    detached: process.platform !== 'win32',
    ...options,
  });
  children.push(child);
  const label = options?.label ?? command;
  // Kept so a start-up failure reports *why* rather than only that a port never opened — a bare
  // "timed out waiting for api" sends the reader hunting for a message the script already had.
  child.recent = [];
  const record = (stream, chunk) => {
    child.recent.push(...String(chunk).split(/\r?\n/).filter(Boolean));
    if (child.recent.length > 40) child.recent.splice(0, child.recent.length - 40);
    if (process.env.E2E_VERBOSE) stream.write(`[${label}] ${chunk}`);
  };
  child.stdout.on('data', (chunk) => record(process.stdout, chunk));
  child.stderr.on('data', (chunk) => record(process.stderr, chunk));
  child.on('exit', (code) => child.recent.push(`(process exited with code ${code})`));
  return child;
}

/**
 * Runs a command in the foreground *without* blocking this process's event loop.
 *
 * `spawnSync` would be simpler, but it stops the loop for the whole run, so nothing drains the
 * API's and web server's stdout pipes. Once ~64KB of request logs accumulate the API blocks
 * forever on its next write and the suite starts failing with symptoms — sign-ins timing out,
 * "Marketplace API is unavailable" — that look exactly like an application crash.
 */
function runForeground(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true, ...options });
    children.push(child);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function waitFor(label, check, child, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const detail = child?.recent?.length ? `\nLast output from ${label}:\n${child.recent.join('\n')}` : '';
  throw new Error(`Timed out waiting for ${label}${detail}`);
}

function teardown() {
  if (torndown) return;
  torndown = true;
  for (const child of children) {
    try {
      // `shell: true` means child.pid is the shell, not node — killing it on Windows orphans the
      // server, which then keeps holding .next/standalone and breaks the *next* run's build with
      // an EBUSY that looks nothing like its actual cause. Kill the whole tree.
      if (process.platform === 'win32') run('taskkill', ['/F', '/T', '/PID', String(child.pid)], { allowFailure: true });
      else process.kill(-child.pid, 'SIGTERM');
    } catch { /* already gone */ }
    try { child.kill(); } catch { /* already gone */ }
  }
  run('docker', ['rm', '-f', CONTAINER], { allowFailure: true });
  // Holds throwaway operator passwords and TOTP secrets; nothing should outlive the run.
  try { rmSync(FIXTURES, { force: true }); } catch { /* nothing to remove */ }
}

function pemEnvLine(pemBuffer) {
  return pemBuffer.toString('utf8').trim().split(/\r\n|\r|\n/).join('\\n');
}

function apiEnvironment() {
  const metadata = generateKeyPairSync('ed25519');
  const entitlement = generateKeyPairSync('ed25519');
  const keyDate = new Date().toISOString().slice(0, 10);
  return {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(API_PORT),
    DATABASE_URL: DB_URL,
    // Production config rightly refuses a non-HTTPS public URL. This is only the *advertised*
    // origin (entitlement issuer, e-mail links, artifact download URLs) — none of which the
    // operator control plane renders — while the listener the tests actually call stays on
    // 127.0.0.1. `.invalid` is reserved by RFC 2606, so it can never resolve by accident.
    PUBLIC_BASE_URL: 'https://marketplace.e2e.invalid',
    MARKETPLACE_ADMIN_TOKEN: randomBytes(36).toString('base64url'),
    METADATA_SIGNING_PRIVATE_KEY: pemEnvLine(metadata.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    METADATA_SIGNING_KEY_ID: `metadata-${keyDate}`,
    ENTITLEMENT_SIGNING_PRIVATE_KEY: pemEnvLine(entitlement.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    ENTITLEMENT_SIGNING_KEY_ID: `entitlement-${keyDate}`,
    PAYMENT_WEBHOOK_SECRET: randomBytes(36).toString('base64url'),
    ARTIFACT_STORAGE_PATH: path.join(adminDir, '.e2e-artifacts'),
    // Exercises the real at-rest encryption path for operator MFA secrets rather than the
    // development fallback that stores them in the clear.
    IDENTITY_ENCRYPTION_ACTIVE_KEY_ID: 'identity-e2e',
    IDENTITY_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'identity-e2e': randomBytes(32).toString('base64') }),
    TRANSACTIONAL_EMAIL_PROVIDER: 'sendgrid',
    SENDGRID_API_KEY: 'SG.E2E_PLACEHOLDER_NOT_A_REAL_KEY_000',
    TRANSACTIONAL_EMAIL_FROM: 'e2e@example.com',
  };
}

async function main() {
  process.on('exit', teardown);
  process.on('SIGINT', () => { teardown(); process.exit(130); });

  mkdirSync(path.join(adminDir, '.e2e-artifacts'), { recursive: true });

  console.log('› starting disposable PostgreSQL');
  run('docker', ['rm', '-f', CONTAINER], { allowFailure: true });
  run('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=postgres', '-p', `${PG_PORT}:5432`, 'postgres:16']);
  await waitFor('postgres', async () => run('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres'], { allowFailure: true }).status === 0, null);
  run('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-c', '"CREATE DATABASE platform_e2e;"']);

  const env = apiEnvironment();

  console.log('› applying migrations');
  run('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env });

  console.log('› building marketplace API');
  run('npm', ['run', 'build'], { cwd: apiDir, env });

  console.log('› seeding operators');
  run('npx', ['tsx', 'scripts/bootstrap-platform-owner.ts', '--email', 'owner@e2e.test', '--name', '"E2E Owner"'], {
    cwd: apiDir, env: { ...env, PLATFORM_OWNER_PASSWORD: 'E2EOwnerPass123!' },
  });
  run('npx', ['tsx', 'scripts/seed-platform-e2e.ts', '--out', `"${FIXTURES}"`], { cwd: apiDir, env });

  console.log('› starting marketplace API');
  const api = startBackground('node', ['dist/main.js'], { cwd: apiDir, env, label: 'api' });
  await waitFor('api', async () => (await fetch(`http://127.0.0.1:${API_PORT}/health/live`)).ok, api);

  console.log('› building and starting the operator app');
  const webEnv = { ...process.env, NODE_ENV: 'production', PORT: String(WEB_PORT), MARKETPLACE_API_URL: `http://127.0.0.1:${API_PORT}` };
  run('npm', ['run', 'build'], { cwd: adminDir, env: webEnv });
  // `output: 'standalone'` deliberately excludes static assets from the traced bundle; without
  // this copy the server boots but every stylesheet and client chunk 404s, so the app never
  // hydrates and the failure looks like a mysterious test timeout rather than a missing file.
  cpSync(path.join(adminDir, '.next/static'), path.join(adminDir, '.next/standalone/.next/static'), { recursive: true });
  if (existsSync(path.join(adminDir, 'public'))) {
    cpSync(path.join(adminDir, 'public'), path.join(adminDir, '.next/standalone/public'), { recursive: true });
  }
  const web = startBackground('node', ['.next/standalone/server.js'], {
    cwd: adminDir, label: 'web',
    env: { ...webEnv, HOSTNAME: '127.0.0.1' },
  });
  await waitFor('web', async () => (await fetch(`http://127.0.0.1:${WEB_PORT}/login`)).ok, web);

  if (keep) {
    console.log([
      '',
      'Stack is up and will stay running:',
      `  web       http://127.0.0.1:${WEB_PORT}`,
      `  api       http://127.0.0.1:${API_PORT}`,
      '  operator  owner@e2e.test / E2EOwnerPass123! (not yet enrolled; other operators are in the fixtures file)',
      '',
      'Run specs against it from apps/platform-admin:',
      `  E2E_WEB_URL=http://127.0.0.1:${WEB_PORT} E2E_API_URL=http://127.0.0.1:${API_PORT} E2E_FIXTURES=${FIXTURES} npx playwright test`,
      '',
      'Press Ctrl+C to tear down.',
    ].join('\n'));
    await new Promise(() => {});
    return;
  }

  console.log('› running Playwright\n');
  const status = await runForeground('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    cwd: adminDir,
    env: {
      ...process.env,
      E2E_WEB_URL: `http://127.0.0.1:${WEB_PORT}`,
      E2E_API_URL: `http://127.0.0.1:${API_PORT}`,
      E2E_FIXTURES: FIXTURES,
      E2E_PG_CONTAINER: CONTAINER,
      E2E_OWNER_EMAIL: 'owner@e2e.test',
      E2E_OWNER_PASSWORD: 'E2EOwnerPass123!',
    },
  });
  teardown();
  process.exit(status);
}

main().catch((error) => {
  console.error(error.message ?? error);
  teardown();
  process.exit(1);
});
