'use strict';

// B-007: DNS and TLS/content verification primitives for the custom-domain state
// machine, kept separate from the Railway-CLI-driving orchestrator (manage-custom-domain.js)
// so they can be tested against real public DNS/HTTPS without needing a real Railway
// project or a domain this repo owns.

const dns = require('dns').promises;

/**
 * Checks whether `hostname` has a CNAME record matching `expectedTarget` (case-insensitive,
 * trailing-dot-insensitive, matching how DNS resolvers normalize FQDNs).
 * Returns { matched: boolean, found: string[] | null, error: string | null } -- never throws,
 * since "not yet propagated" and "genuinely misconfigured" both need to be distinguished by
 * the caller, not collapsed into a single exception.
 */
async function checkCnameRecord(hostname, expectedTarget) {
  const normalize = (value) => value.trim().toLowerCase().replace(/\.$/, '');
  try {
    const records = await dns.resolveCname(hostname);
    const matched = records.some((record) => normalize(record) === normalize(expectedTarget));
    return { matched, found: records, error: null };
  } catch (error) {
    // ENOTFOUND/ENODATA mean "no record yet" (still pending, not necessarily wrong);
    // anything else is a real DNS resolution problem worth surfacing distinctly.
    const code = error && error.code;
    return { matched: false, found: null, error: code === 'ENOTFOUND' || code === 'ENODATA' ? 'not_yet_propagated' : `dns_error:${code || error.message}` };
  }
}

/** Same shape as checkCnameRecord, for TXT-based domain verification (e.g. `_wattanam-verify.<domain>`). */
async function checkTxtRecord(hostname, expectedValue) {
  try {
    const records = await dns.resolveTxt(hostname);
    const flat = records.map((chunks) => chunks.join(''));
    const matched = flat.some((value) => value.trim() === expectedValue.trim());
    return { matched, found: flat, error: null };
  } catch (error) {
    const code = error && error.code;
    return { matched: false, found: null, error: code === 'ENOTFOUND' || code === 'ENODATA' ? 'not_yet_propagated' : `dns_error:${code || error.message}` };
  }
}

/**
 * End-to-end probe for the "activate" transition: fetches `https://<domain>/<healthPath>`
 * and confirms (a) TLS actually succeeded -- a bad/missing certificate makes `fetch` itself
 * reject, which is exactly the failure mode this must catch, not silently ignore -- and
 * (b) the response matches `expectedBodyIncludes`, proving the custom domain is actually
 * routing to this installation's gateway and not some other service or a DNS-hijacked target.
 */
async function probeCustomDomain(domain, { healthPath = '/gateway-health', expectedBodyIncludes, timeoutMs = 10_000 } = {}) {
  const url = `https://${domain}${healthPath}`;
  let response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { ok: false, tlsOk: false, contentOk: false, error: error instanceof Error ? error.message : String(error) };
  }
  const tlsOk = true; // fetch() above would have thrown on a TLS failure -- reaching here proves it succeeded.
  const httpOk = response.ok;
  let body = '';
  try { body = await response.text(); } catch { /* leave empty; contentOk below will correctly be false */ }
  const contentOk = expectedBodyIncludes ? body.includes(expectedBodyIncludes) : httpOk;
  return { ok: tlsOk && httpOk && contentOk, tlsOk, httpOk, contentOk, status: response.status, error: null };
}

module.exports = { checkCnameRecord, checkTxtRecord, probeCustomDomain };
