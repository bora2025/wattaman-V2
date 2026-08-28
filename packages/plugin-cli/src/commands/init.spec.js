'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('./init');

describe('wattanam-plugin init', () => {
  it('scaffolds a plugin project with the id substituted throughout', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-init-'));
    const dest = path.join(parent, 'acme.widget');
    await run(['acme.widget', '--dir', dest]);

    const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'plugin.json'), 'utf8'));
    expect(manifest.id).toBe('acme.widget');
    expect(manifest.publisher).toBe('acme');
    expect(manifest.navigation[0].href).toBe('/plugins/acme.widget/settings');

    const backend = fs.readFileSync(path.join(dest, 'backend', 'index.js'), 'utf8');
    expect(backend).toContain("id: 'acme.widget'");
    expect(fs.existsSync(path.join(dest, 'frontend', 'page.json'))).toBe(true);

    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('refuses to scaffold into a non-empty directory', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'wattanam-init-'));
    fs.writeFileSync(path.join(parent, 'existing.txt'), 'x');
    expect(() => run(['acme.widget', '--dir', parent])).toThrow('already exists and is not empty');
    fs.rmSync(parent, { recursive: true, force: true });
  });
});
