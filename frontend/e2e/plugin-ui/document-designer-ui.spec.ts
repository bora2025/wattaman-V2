import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const descriptorPath = path.resolve(process.cwd(), '../plugins/wattanam.document-designer/frontend/page.json');
const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
const pages = descriptor.pages.map((page: Record<string, unknown>) => ({
  pluginId: 'wattanam.document-designer',
  schemaVersion: 2,
  kind: 'declarative-ui',
  ...page,
}));

const template = {
  id: 'template-1',
  name: 'Student Card',
  documentType: 'student',
  isActive: true,
  updatedAt: '2026-09-15T09:00:00.000Z',
  createdAt: '2026-09-15T08:00:00.000Z',
  design: { width: 85, height: 54 },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/auth/me') {
      return route.fulfill({ json: { id: 'admin-1', role: 'SUPER_ADMIN', email: 'admin@example.test' } });
    }
    if (pathname === '/api/plugin-api/my-extensions') {
      return route.fulfill({ json: { navigation: [{ pluginId: 'wattanam.document-designer', id: 'templates', label: 'Document Designer', href: '/plugins/wattanam.document-designer/templates', permission: 'wattanam.document-designer.view' }], pages } });
    }
    if (pathname === '/api/plugin-api/wattanam.document-designer/templates' && request.method() === 'GET') {
      return route.fulfill({ json: [template] });
    }
    if (pathname === '/api/plugin-api/wattanam.document-designer/templates' && request.method() === 'POST') {
      return route.fulfill({ json: { ...template, id: 'template-2', name: 'Created Template' } });
    }
    if (pathname === '/api/plugin-api/wattanam.document-designer/templates/template-1' && request.method() === 'GET') {
      return route.fulfill({ json: template });
    }
    if (pathname === '/api/plugin-api/wattanam.document-designer/templates/template-1' && request.method() === 'PATCH') {
      return route.fulfill({ json: { ...template, ...request.postDataJSON() } });
    }
    return route.fulfill({ status: 200, json: {} });
  });
});

test('renders document-designer list page from plugin descriptor and supports create flow', async ({ page }) => {
  await page.goto('/plugins/wattanam.document-designer/templates');

  await expect(page.getByRole('heading', { name: 'Document Designer' })).toBeVisible();
  await expect(page.getByText('wattanam.document-designer').first()).toBeVisible();
  await expect(page.getByRole('table').first()).toContainText('Student Card');

  await page.getByLabel('Name').fill('Created Template');
  await page.getByLabel('Document type').fill('student');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Template created');
});

test('renders document-designer detail page route via plugin host', async ({ page }) => {
  await page.goto('/plugins/wattanam.document-designer/templates/template-1');

  await expect(page.getByRole('heading', { name: 'Document template' })).toBeVisible();
  await expect(page.getByText('Student Card').first()).toBeVisible();
  await expect(page.getByText('student').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save design' })).toHaveCount(0);
});

test('edits a design object through a permission-separated declarative page', async ({ page }) => {
  await page.goto('/plugins/wattanam.document-designer/templates/edit/template-1');
  await expect(page.getByRole('heading', { name: 'Edit document template' })).toBeVisible();
  await expect(page.getByLabel('Design JSON')).toHaveValue(/"width": 85/);
  await page.getByLabel('Design JSON').fill('{broken');
  await page.getByRole('button', { name: 'Save design' }).click();
  await expect(page.getByText('Enter valid JSON.')).toBeVisible();

  await page.getByLabel('Design JSON').fill('{"width": 90, "height": 54}');
  const request = page.waitForRequest((candidate) => candidate.method() === 'PATCH' && candidate.url().endsWith('/templates/template-1'));
  await page.getByRole('button', { name: 'Save design' }).click();
  expect((await request).postDataJSON()).toEqual({ name: 'Student Card', design: { width: 90, height: 54 } });
  await expect(page.getByRole('status')).toContainText('Template design saved');
});
