import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PluginRouteDefinition, PluginRouteRequest } from './plugin-sdk';

export interface PermissionExtension { pluginId: string; id: string; label: string; description?: string }
export interface NavigationExtension { pluginId: string; id: string; label: string; href: string; permission?: string }
export interface PageExtension { pluginId: string; schemaVersion: 1; id: string; title: string; routePath: string; kind: 'json-settings' }

@Injectable()
export class PluginExtensionsService {
  private readonly routes = new Map<string, PluginRouteDefinition>();
  private readonly permissions = new Map<string, PermissionExtension>();
  private readonly navigation = new Map<string, NavigationExtension>();
  private readonly pages = new Map<string, PageExtension>();

  registerRoute(pluginId: string, declaredPermissions: Set<string>, definition: PluginRouteDefinition) {
    const method = definition.method?.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new BadRequestException('Plugin route method is unsupported');
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(definition.path) || definition.path.includes('//') || definition.path.split('/').includes('..')) throw new BadRequestException('Plugin route path is invalid');
    if (!declaredPermissions.has(definition.permission)) throw new BadRequestException('Plugin route permission is not declared in the manifest');
    if (typeof definition.handler !== 'function') throw new BadRequestException('Plugin route handler is required');
    const key = `${pluginId}:${method}:${definition.path}`;
    if (this.routes.has(key)) throw new BadRequestException(`Plugin route is already registered: ${method} ${definition.path}`);
    this.routes.set(key, { ...definition, method: method as any });
    return () => this.routes.delete(key);
  }

  async dispatch(pluginId: string, request: PluginRouteRequest) {
    const definition = this.routes.get(`${pluginId}:${request.method}:${request.path}`);
    if (!definition) throw new NotFoundException('Plugin route not found');
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        Promise.resolve(definition.handler(request)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Plugin route timed out')), 10_000); timer.unref(); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }

  registerPermissions(pluginId: string, declared: Set<string>, definitions: PermissionExtension[]) {
    const keys: string[] = [];
    for (const definition of definitions) {
      if (!declared.has(definition.id) || !definition.label?.trim()) throw new BadRequestException(`Plugin permission is not declared: ${definition.id}`);
      const key = `${pluginId}:${definition.id}`;
      if (this.permissions.has(key)) throw new BadRequestException(`Plugin permission is already registered: ${definition.id}`);
      this.permissions.set(key, { ...definition, pluginId, label: definition.label.trim() });
      keys.push(key);
    }
    return () => keys.forEach((key) => this.permissions.delete(key));
  }

  registerNavigation(pluginId: string, declared: Set<string>, entries: NavigationExtension[]) {
    const keys: string[] = [];
    for (const entry of entries) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(entry.id) || !entry.label?.trim() || !entry.href.startsWith(`/plugins/${pluginId}/`) || entry.href.includes('..')) throw new BadRequestException('Plugin navigation entry is invalid');
      if (entry.permission && !declared.has(entry.permission)) throw new BadRequestException('Plugin navigation permission is not declared');
      const key = `${pluginId}:${entry.id}`;
      if (this.navigation.has(key)) throw new BadRequestException(`Plugin navigation is already registered: ${entry.id}`);
      this.navigation.set(key, { ...entry, pluginId, label: entry.label.trim() });
      keys.push(key);
    }
    return () => keys.forEach((key) => this.navigation.delete(key));
  }

  registerPage(pluginId: string, value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Plugin frontend entry must be an object');
    const page = value as Record<string, unknown>;
    if (page.schemaVersion !== 1 || page.kind !== 'json-settings' || typeof page.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(page.id) || typeof page.title !== 'string' || !page.title.trim() || typeof page.routePath !== 'string' || !/^[a-z0-9][a-z0-9/_-]*$/.test(page.routePath)) {
      throw new BadRequestException('Plugin frontend page descriptor is invalid');
    }
    const key = `${pluginId}:${page.id}`;
    if (this.pages.has(key)) throw new BadRequestException(`Plugin page is already registered: ${page.id}`);
    this.pages.set(key, { pluginId, schemaVersion: 1, id: page.id, title: page.title.trim(), routePath: page.routePath, kind: 'json-settings' });
    return () => this.pages.delete(key);
  }

  list() {
    return {
      sdkVersion: '1.0.0',
      permissions: [...this.permissions.values()],
      navigation: [...this.navigation.values()],
      pages: [...this.pages.values()],
    };
  }

  clear(pluginId: string) {
    for (const map of [this.routes, this.permissions, this.navigation, this.pages]) {
      for (const key of map.keys()) if (key.startsWith(`${pluginId}:`)) map.delete(key);
    }
  }
}
