import { BadRequestException } from '@nestjs/common';

export const PLUGIN_UI_SCHEMA_VERSION = 2 as const;

export type PluginUiComponentType =
  | 'heading' | 'text' | 'status' | 'card' | 'metric' | 'table' | 'form'
  | 'detail' | 'chart' | 'file' | 'print' | 'scanner' | 'actions';

export interface PluginUiDataSource {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  permission: string;
}

export interface PluginUiComponent {
  id: string;
  type: PluginUiComponentType;
  title?: string;
  source?: string;
  fields?: Array<Record<string, unknown>>;
  options?: Record<string, unknown>;
}

export interface PluginUiPage {
  id: string;
  title: string;
  routePath: string;
  permission: string;
  parameters: Array<{ name: string; type: 'uuid' | 'integer' | 'slug' | 'string'; maximumLength?: number }>;
  dataSources: PluginUiDataSource[];
  components: PluginUiComponent[];
}

export interface PluginUiBundle {
  schemaVersion: 2;
  kind: 'declarative-ui';
  pages: PluginUiPage[];
}

const ID = /^[a-z0-9][a-z0-9._-]*$/;
const ROUTE = /^[a-z0-9][a-z0-9/_-]*(?::[a-z][a-zA-Z0-9]*)?$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const COMPONENTS = new Set<PluginUiComponentType>([
  'heading', 'text', 'status', 'card', 'metric', 'table', 'form', 'detail',
  'chart', 'file', 'print', 'scanner', 'actions',
]);
const FORBIDDEN_KEYS = /^(?:html|dangerouslySetInnerHTML|script|srcDoc|javascript|on[A-Z].*)$/;

function routeParameters(route: string): string[] {
  return route.split('/').filter((segment) => segment.startsWith(':')).map((segment) => segment.slice(1));
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new BadRequestException(`${label} is invalid`);
  return value.trim();
}

function safeRoute(value: unknown, label: string, parameters = false): string {
  const route = string(value, label, 240);
  if (route.startsWith('/') || route.includes('..') || route.includes('//') || !ROUTE.test(route)) throw new BadRequestException(`${label} must stay inside the plugin namespace`);
  if (!parameters && route.includes(':')) throw new BadRequestException(`${label} cannot contain route parameters`);
  return route;
}

function inspectSafeJson(value: unknown, label: string, depth = 0): void {
  if (depth > 8) throw new BadRequestException(`${label} is too deeply nested`);
  if (typeof value === 'string') {
    if (/\bjavascript\s*:/i.test(value) || /<\s*script\b/i.test(value) || /<[^>]+>/i.test(value)) throw new BadRequestException(`${label} contains unsafe executable or HTML content`);
    if (/^(?:https?:)?\/\//i.test(value)) throw new BadRequestException(`${label} contains an untrusted external URL`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => inspectSafeJson(item, `${label}[${index}]`, depth + 1)); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(key)) throw new BadRequestException(`${label}.${key} is forbidden`);
    inspectSafeJson(child, `${label}.${key}`, depth + 1);
  }
}

export function parsePluginUiBundle(value: unknown, pluginId: string, declaredPermissions: Set<string>): PluginUiBundle {
  const root = object(value, 'Plugin UI descriptor');
  if (root.schemaVersion !== PLUGIN_UI_SCHEMA_VERSION || root.kind !== 'declarative-ui') throw new BadRequestException('Unsupported plugin UI schema version or kind');
  if (!Array.isArray(root.pages) || root.pages.length < 1 || root.pages.length > 50) throw new BadRequestException('Plugin UI pages must contain 1 to 50 pages');
  inspectSafeJson(root, 'Plugin UI descriptor');

  const pageIds = new Set<string>();
  const routePaths = new Set<string>();
  const pages = root.pages.map((candidate, pageIndex): PluginUiPage => {
    const page = object(candidate, `pages[${pageIndex}]`);
    const id = string(page.id, `pages[${pageIndex}].id`, 100);
    if (!ID.test(id) || pageIds.has(id)) throw new BadRequestException(`pages[${pageIndex}].id is invalid or duplicated`);
    pageIds.add(id);
    const routePath = safeRoute(page.routePath, `pages[${pageIndex}].routePath`, true);
    if (routePaths.has(routePath)) throw new BadRequestException(`pages[${pageIndex}].routePath is duplicated`);
    routePaths.add(routePath);
    const permission = string(page.permission, `pages[${pageIndex}].permission`);
    if (!permission.startsWith(`${pluginId}.`) || !declaredPermissions.has(permission)) throw new BadRequestException(`pages[${pageIndex}].permission is not declared by the plugin`);

    if (!Array.isArray(page.parameters) || page.parameters.length > 10) throw new BadRequestException(`pages[${pageIndex}].parameters must be an array`);
    const parameterNames = new Set<string>();
    const parameters = page.parameters.map((candidateParameter, parameterIndex) => {
      const parameter = object(candidateParameter, `pages[${pageIndex}].parameters[${parameterIndex}]`);
      const name = string(parameter.name, 'route parameter name', 60);
      const type = string(parameter.type, 'route parameter type', 20) as 'uuid' | 'integer' | 'slug' | 'string';
      if (!/^[a-z][a-zA-Z0-9]*$/.test(name) || parameterNames.has(name) || !['uuid', 'integer', 'slug', 'string'].includes(type)) throw new BadRequestException('Plugin UI route parameter is invalid or duplicated');
      parameterNames.add(name);
      const maximumLength = parameter.maximumLength === undefined ? undefined : Number(parameter.maximumLength);
      if (maximumLength !== undefined && (!Number.isInteger(maximumLength) || maximumLength < 1 || maximumLength > 160)) throw new BadRequestException('Plugin UI route parameter maximumLength is invalid');
      return { name, type, ...(maximumLength === undefined ? {} : { maximumLength }) };
    });
    const usedPageParameters = routeParameters(routePath);
    if (usedPageParameters.length !== parameterNames.size || usedPageParameters.some((name) => !parameterNames.has(name))) throw new BadRequestException(`pages[${pageIndex}] route parameters and declarations must match`);

    if (!Array.isArray(page.dataSources) || page.dataSources.length > 30) throw new BadRequestException(`pages[${pageIndex}].dataSources must be an array`);
    const sourceIds = new Set<string>();
    const dataSources = page.dataSources.map((candidateSource, sourceIndex): PluginUiDataSource => {
      const source = object(candidateSource, `pages[${pageIndex}].dataSources[${sourceIndex}]`);
      const sourceId = string(source.id, 'data source id', 100);
      if (!ID.test(sourceId) || sourceIds.has(sourceId)) throw new BadRequestException('Plugin UI data source id is invalid or duplicated');
      sourceIds.add(sourceId);
      const method = string(source.method, 'data source method', 10).toUpperCase();
      if (!METHODS.has(method)) throw new BadRequestException('Plugin UI data source method is unsupported');
      const sourcePermission = string(source.permission, 'data source permission');
      if (!sourcePermission.startsWith(`${pluginId}.`) || !declaredPermissions.has(sourcePermission)) throw new BadRequestException('Plugin UI data source permission is not declared by the plugin');
      const sourcePath = safeRoute(source.path, 'data source path', true);
      if (routeParameters(sourcePath).some((name) => !parameterNames.has(name))) throw new BadRequestException('Plugin UI data source uses an undeclared route parameter');
      return { id: sourceId, method: method as PluginUiDataSource['method'], path: sourcePath, permission: sourcePermission };
    });

    if (!Array.isArray(page.components) || page.components.length < 1 || page.components.length > 100) throw new BadRequestException(`pages[${pageIndex}].components must contain 1 to 100 components`);
    const componentIds = new Set<string>();
    const components = page.components.map((candidateComponent, componentIndex): PluginUiComponent => {
      const component = object(candidateComponent, `pages[${pageIndex}].components[${componentIndex}]`);
      const componentId = string(component.id, 'component id', 100);
      const type = string(component.type, 'component type', 40) as PluginUiComponentType;
      if (!ID.test(componentId) || componentIds.has(componentId) || !COMPONENTS.has(type)) throw new BadRequestException('Plugin UI component id or type is invalid');
      componentIds.add(componentId);
      const source = component.source === undefined ? undefined : string(component.source, 'component source', 100);
      if (source && !sourceIds.has(source)) throw new BadRequestException(`Plugin UI component references unknown data source: ${source}`);
      if (component.fields !== undefined && !Array.isArray(component.fields)) throw new BadRequestException('Plugin UI component fields must be an array');
      if (component.options !== undefined) object(component.options, 'component options');
      if (type === 'table') {
        if (!source) throw new BadRequestException('Plugin UI table requires a data source');
        if (!Array.isArray(component.fields) || component.fields.length < 1 || component.fields.length > 30) throw new BadRequestException('Plugin UI table requires 1 to 30 column fields');
        const columnIds = new Set<string>();
        component.fields.forEach((candidateField, fieldIndex) => {
          const field = object(candidateField, `table fields[${fieldIndex}]`);
          const fieldId = string(field.id, 'table column id', 100);
          if (!ID.test(fieldId) || columnIds.has(fieldId)) throw new BadRequestException('Plugin UI table column id is invalid or duplicated');
          columnIds.add(fieldId);
          if (field.label !== undefined) string(field.label, 'table column label', 120);
          if (field.sortable !== undefined && typeof field.sortable !== 'boolean') throw new BadRequestException('Plugin UI table sortable must be boolean');
          if (field.filterable !== undefined && typeof field.filterable !== 'boolean') throw new BadRequestException('Plugin UI table filterable must be boolean');
        });
        const options = (component.options || {}) as Record<string, unknown>;
        if (options.pageSize !== undefined && (!Number.isInteger(options.pageSize) || Number(options.pageSize) < 1 || Number(options.pageSize) > 100)) throw new BadRequestException('Plugin UI table pageSize must be between 1 and 100');
        if (options.selectable !== undefined && typeof options.selectable !== 'boolean') throw new BadRequestException('Plugin UI table selectable must be boolean');
      }
      return {
        id: componentId, type,
        ...(component.title === undefined ? {} : { title: string(component.title, 'component title', 200) }),
        ...(source ? { source } : {}),
        ...(component.fields ? { fields: component.fields as Array<Record<string, unknown>> } : {}),
        ...(component.options ? { options: component.options as Record<string, unknown> } : {}),
      };
    });
    return { id, title: string(page.title, `pages[${pageIndex}].title`, 200), routePath, permission, parameters, dataSources, components };
  });
  return { schemaVersion: 2, kind: 'declarative-ui', pages };
}
