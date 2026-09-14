import { parsePluginUiBundle } from './plugin-ui-schema';

const permissions = new Set(['wattanam.test.read', 'wattanam.test.manage']);

function valid() {
  return {
    schemaVersion: 2,
    kind: 'declarative-ui',
    pages: [{
      id: 'records', title: 'Records', routePath: 'records/:id', permission: 'wattanam.test.read',
      parameters: [{ name: 'id', type: 'uuid' }],
      dataSources: [
        { id: 'record', method: 'GET', path: 'records/:id', permission: 'wattanam.test.read' },
        { id: 'save', method: 'PATCH', path: 'records/:id', permission: 'wattanam.test.manage' },
      ],
      components: [
        { id: 'title', type: 'heading', title: 'Record' },
        { id: 'editor', type: 'form', source: 'save', fields: [{ id: 'name', type: 'text', label: 'Name', required: true }] },
      ],
    }],
  };
}

describe('Plugin UI v2 schema', () => {
  it('parses a versioned declarative page and its allow-listed components', () => {
    expect(parsePluginUiBundle(valid(), 'wattanam.test', permissions)).toMatchObject({
      schemaVersion: 2,
      kind: 'declarative-ui',
      pages: [{ id: 'records', components: [{ type: 'heading' }, { type: 'form' }] }],
    });
  });

  it.each([
    ['script element', () => { const value: any = valid(); value.pages[0].components[0].title = '<script>alert(1)</script>'; return value; }],
    ['event handler', () => { const value: any = valid(); value.pages[0].components[0].options = { onClick: 'steal()' }; return value; }],
    ['unsafe HTML', () => { const value: any = valid(); value.pages[0].components[0].html = '<b>unsafe</b>'; return value; }],
    ['external URL', () => { const value: any = valid(); value.pages[0].components[0].options = { href: 'https://evil.example' }; return value; }],
    ['javascript URL', () => { const value: any = valid(); value.pages[0].components[0].options = { href: 'javascript:alert(1)' }; return value; }],
    ['namespace escape', () => { const value: any = valid(); value.pages[0].dataSources[0].path = '../users'; return value; }],
    ['unknown component', () => { const value: any = valid(); value.pages[0].components[0].type = 'iframe'; return value; }],
  ])('rejects hostile descriptor content: %s', (_label, factory) => {
    expect(() => parsePluginUiBundle(factory(), 'wattanam.test', permissions)).toThrow();
  });

  it('rejects undeclared page and data-source permissions', () => {
    const pagePermission: any = valid();
    pagePermission.pages[0].permission = 'wattanam.test.undeclared';
    expect(() => parsePluginUiBundle(pagePermission, 'wattanam.test', permissions)).toThrow('not declared');

    const sourcePermission: any = valid();
    sourcePermission.pages[0].dataSources[0].permission = 'core.users.manage';
    expect(() => parsePluginUiBundle(sourcePermission, 'wattanam.test', permissions)).toThrow('not declared');
  });

  it('rejects components bound to unknown data sources', () => {
    const value: any = valid();
    value.pages[0].components[1].source = 'missing';
    expect(() => parsePluginUiBundle(value, 'wattanam.test', permissions)).toThrow('unknown data source');
  });

  it('requires typed declarations for every page and source route parameter', () => {
    const missing: any = valid();
    missing.pages[0].parameters = [];
    expect(() => parsePluginUiBundle(missing, 'wattanam.test', permissions)).toThrow('must match');

    const undeclared: any = valid();
    undeclared.pages[0].dataSources[0].path = 'records/:otherId';
    expect(() => parsePluginUiBundle(undeclared, 'wattanam.test', permissions)).toThrow('undeclared');
  });

  it('validates the declarative table contract', () => {
    const value: any = valid();
    value.pages[0].components[1] = { id: 'records', type: 'table', source: 'record', fields: [{ id: 'name', label: 'Name', sortable: true, filterable: true }], options: { pageSize: 25, selectable: true } };
    expect(parsePluginUiBundle(value, 'wattanam.test', permissions).pages[0].components[1]).toMatchObject({ type: 'table', source: 'record' });
    value.pages[0].components[1].options.pageSize = 101;
    expect(() => parsePluginUiBundle(value, 'wattanam.test', permissions)).toThrow('pageSize');
  });

  it('validates form fields, mutations, conditions, and confirmations', () => {
    const value: any = valid();
    value.pages[0].components[1] = {
      id: 'editor', type: 'form', source: 'save',
      fields: [
        { id: 'kind', type: 'select', label: 'Kind', required: true, options: [{ label: 'Person', value: 'person' }] },
        { id: 'name', type: 'text', label: 'Name', minLength: 2, visibleWhen: { field: 'kind', equals: 'person' } },
      ],
      options: { initialSource: 'record', confirmation: 'Save this record?', submitLabel: 'Save' },
    };
    expect(parsePluginUiBundle(value, 'wattanam.test', permissions).pages[0].components[1]).toMatchObject({ type: 'form', source: 'save' });
    value.pages[0].dataSources[1].method = 'GET';
    expect(() => parsePluginUiBundle(value, 'wattanam.test', permissions)).toThrow('POST, PUT, or PATCH');
  });

  it('validates single and bulk mutation actions', () => {
    const value: any = valid();
    value.pages[0].components.push({ id: 'record-actions', type: 'actions', options: { actions: [
      { id: 'save', label: 'Save', mode: 'single', source: 'save', body: { approved: true } },
      { id: 'bulk-save', label: 'Save selected', mode: 'bulk', source: 'save', selectionSource: 'record', idField: 'id', idParameter: 'id', confirmation: 'Continue?' },
    ] } });
    expect(parsePluginUiBundle(value, 'wattanam.test', permissions).pages[0].components[2]).toMatchObject({ type: 'actions' });
    value.pages[0].components[2].options.actions[1].selectionSource = 'save';
    expect(() => parsePluginUiBundle(value, 'wattanam.test', permissions)).toThrow('GET data source');
  });
});
