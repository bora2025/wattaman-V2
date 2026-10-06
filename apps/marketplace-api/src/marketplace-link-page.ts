export const marketplaceLinkPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Approve school connection · Wattanam Marketplace</title>
  <link rel="stylesheet" href="/marketplace/link/approval.css">
</head>
<body>
  <main class="card">
    <p class="eyebrow">Wattanam Marketplace</p>
    <h1>Approve school connection</h1>
    <p id="summary">Loading the school connection request…</p>
    <dl id="details" hidden>
      <div><dt>Installation</dt><dd id="installation"></dd></div>
      <div><dt>Requested access</dt><dd id="scope"></dd></div>
      <div><dt>Expires</dt><dd id="expires"></dd></div>
    </dl>
    <form id="approval-form" hidden>
      <label>Email<input id="email" type="email" autocomplete="username" required></label>
      <label>Password<input id="password" type="password" autocomplete="current-password" required></label>
      <label id="code-label" hidden>MFA or recovery code<input id="code" autocomplete="one-time-code" inputmode="numeric"></label>
      <div class="actions">
        <button id="approve" type="submit">Sign in and approve</button>
        <button id="deny" type="button" class="secondary">Deny</button>
      </div>
    </form>
    <p id="message" role="status"></p>
  </main>
  <script src="/marketplace/link/approval.js" defer></script>
</body>
</html>`;

export const marketplaceLinkCss = `
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#172033;background:#f5f7ff}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}
.card{width:min(620px,100%);background:#fff;border:1px solid #dfe4f2;border-radius:20px;padding:32px;box-shadow:0 18px 50px #27346918}
.eyebrow{color:#4f46e5;font-weight:700;margin:0 0 8px}h1{margin:0 0 12px;font-size:1.8rem}p{line-height:1.55;color:#566078}
dl{display:grid;gap:12px;margin:24px 0;padding:18px;background:#f8f9ff;border-radius:12px}dl div{display:grid;gap:3px}dt{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#8a94ac;font-weight:700}dd{margin:0;overflow-wrap:anywhere}
form{display:grid;gap:15px}label{display:grid;gap:6px;font-size:.85rem;font-weight:650}input{width:100%;padding:12px;border:1px solid #cdd4e5;border-radius:10px;font:inherit}
.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:5px}button{border:0;border-radius:10px;padding:12px 18px;background:#4f46e5;color:#fff;font:inherit;font-weight:700;cursor:pointer}button.secondary{background:#eef0f8;color:#30384d}button:disabled{opacity:.55;cursor:wait}
#message.error{color:#b42318}#message.success{color:#087443;font-weight:650}
`;

export const marketplaceLinkScript = `
(() => {
  const requestId = location.pathname.split('/').filter(Boolean).at(-1);
  const summary = document.getElementById('summary');
  const details = document.getElementById('details');
  const form = document.getElementById('approval-form');
  const message = document.getElementById('message');
  const codeLabel = document.getElementById('code-label');
  const setBusy = value => form.querySelectorAll('button,input').forEach(item => { item.disabled = value; });
  const showMessage = (text, kind = '') => { message.textContent = text; message.className = kind; };
  const readJson = async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Marketplace request failed');
    return body;
  };
  async function load() {
    const request = await readJson(await fetch('/v1/marketplace-links/' + encodeURIComponent(requestId), { headers: { accept: 'application/json' } }));
    document.getElementById('installation').textContent = request.installationLabel || request.installationId || 'Customer school';
    document.getElementById('scope').textContent = String(request.requestedScope || '').split(/\\s+/).filter(Boolean).join(', ');
    document.getElementById('expires').textContent = new Date(request.expiresAt).toLocaleString();
    summary.textContent = 'Sign in as the Marketplace owner to approve this school’s Plugin Manager connection.';
    details.hidden = false; form.hidden = false;
  }
  async function authenticate() {
    const payload = { email: document.getElementById('email').value.trim(), password: document.getElementById('password').value };
    const code = document.getElementById('code').value.trim(); if (code) payload.code = code;
    const login = await readJson(await fetch('/v1/sessions', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) }));
    if (login.status === 'mfa_required') { codeLabel.hidden = false; throw new Error('Enter your MFA or recovery code, then approve again.'); }
    if (!login.sessionToken) throw new Error('Marketplace sign-in did not return a session.');
    return login.sessionToken;
  }
  async function decide(decision) {
    setBusy(true); showMessage('');
    try {
      const token = await authenticate();
      await readJson(await fetch('/v1/marketplace-links/' + encodeURIComponent(requestId) + '/' + decision, { method: 'POST', headers: { authorization: 'Bearer ' + token, accept: 'application/json' } }));
      form.hidden = true; details.hidden = true;
      summary.textContent = decision === 'approve' ? 'Connection approved.' : 'Connection denied.';
      showMessage(decision === 'approve' ? 'Return to the school Plugin Manager and choose Finish linking.' : 'The school connection request was denied.', 'success');
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Request failed', 'error'); }
    finally { setBusy(false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void decide('approve'); });
  document.getElementById('deny').addEventListener('click', () => { void decide('deny'); });
  load().catch(error => { summary.textContent = 'This connection request cannot be opened.'; showMessage(error instanceof Error ? error.message : 'Request not found', 'error'); });
})();
`;
