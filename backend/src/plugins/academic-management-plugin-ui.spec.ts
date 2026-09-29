import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parsePluginUiBundle } from './plugin-ui-schema';

describe('Academic Management declarative administration UI', () => {
  const pluginRoot = path.resolve(__dirname, '../../../plugins/wattanam.academic-management');
  const manifest = JSON.parse(readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));
  const descriptor = JSON.parse(readFileSync(path.join(pluginRoot, 'frontend/page.json'), 'utf8'));
  const bundle = parsePluginUiBundle(descriptor, manifest.id, new Set(manifest.permissions));

  it('exposes registration settings through the plugin navigation', () => {
    expect(manifest.version).toBe('0.1.13');
    expect(manifest.navigation).toContainEqual(expect.objectContaining({
      id: 'registration-settings',
      href: '/plugins/wattanam.academic-management/registration-settings',
      permission: 'wattanam.academic-management.manage',
    }));
  });

  it('binds settings and custom-field controls to plugin-owned routes', () => {
    const page = bundle.pages.find((candidate) => candidate.id === 'registration-settings');
    expect(page).toBeDefined();
    expect(page?.dataSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'registrationSettings', method: 'GET', path: 'admissions/settings' }),
      expect.objectContaining({ id: 'saveRegistrationSettings', method: 'PATCH', path: 'admissions/settings' }),
      expect.objectContaining({ id: 'customFields', method: 'GET', path: 'admissions/fields' }),
      expect.objectContaining({ id: 'createCustomField', method: 'POST', path: 'admissions/fields' }),
      expect.objectContaining({ id: 'deleteCustomField', method: 'DELETE', path: 'admissions/fields/:fieldId', autoload: false }),
    ]));
    expect(page?.components.map((component) => component.id)).toEqual(expect.arrayContaining([
      'registration-settings-form',
      'custom-fields-table',
      'custom-field-actions',
      'custom-field-create-form',
    ]));
    const createForm = page?.components.find((component) => component.id === 'custom-field-create-form');
    expect(createForm?.fields).toContainEqual(expect.objectContaining({
      id: 'options', jsonShape: 'array', defaultValue: [],
    }));
  });
});
