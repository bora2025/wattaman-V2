/**
 * Runtime SDK types, matching backend/src/plugins/plugin-sdk.ts. `Logger` is
 * a minimal structural interface here (not imported from @nestjs/common) so
 * this package has no framework dependency.
 */
export interface PluginLogger {
  log(message: string): void;
}

export type PluginRouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface PluginPrincipal {
  userId: string;
  role: string;
  email?: string;
}

export interface PluginRouteRequest {
  method: PluginRouteMethod;
  path: string;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body: unknown;
  principal: PluginPrincipal;
}

export interface PluginRouteDefinition {
  method: PluginRouteMethod;
  path: string;
  permission: string;
  contract?: { version: `${number}.${number}`; request?: { params?: { parse(value: unknown): Record<string, string> }; query?: { parse(value: unknown): Record<string, string | string[]> }; body?: { parse(value: unknown): unknown } }; response: { parse(value: unknown): unknown }; errors: Record<string, { status: number; message: string }> };
  handler(request: PluginRouteRequest): unknown | Promise<unknown>;
}

export interface DirectoryAudienceQuery {
  audience: 'SCHOOL' | 'ROLE' | 'CLASS';
  targetRole?: string;
  classId?: string;
}

export interface DirectoryRecipient {
  id: string;
  email: string | null;
  phone: string | null;
  role: string;
  channels: { inApp: boolean; email: boolean; sms: boolean };
}

export interface PluginRuntimeContext {
  sdkVersion: '1.1.0';
  pluginId: string;
  logger: PluginLogger;
  dependencies: { required: Readonly<Record<string, string>>; optional: Readonly<Record<string, string>>; isAvailable(pluginId: string): Promise<boolean> };
  events: {
    publish(event: string, payload: unknown): void;
    subscribe(event: string, handler: (payload: unknown) => void | Promise<void>): () => void;
  };
  durableEvents: { subscribe(definition: { id: string; event: string; versions: number[]; handler(event: { id: string; pluginId: string; eventName: string; schemaVersion: number; subjectKey: string; payload: unknown; createdAt: Date }): void | Promise<void> }): () => void };
  routes: { register(definition: PluginRouteDefinition): () => void };
  jobs: { register(definition: { id: string; intervalSeconds: number; handler(): void | Promise<void> }): Promise<() => void> };
  settings: { get<T>(key: string, fallback?: T): Promise<T | undefined>; set(key: string, value: unknown): Promise<void>; delete(key: string): Promise<void> };
  storage: { readText(name: string): Promise<string | null>; writeText(name: string, value: string): Promise<void>; delete(name: string): Promise<void>; list(prefix?: string): Promise<string[]> };
  permissions: { register(definitions: Array<{ id: string; label: string; description?: string }>): () => void };
  navigation: { register(entries: Array<{ id: string; label: string; href: string; permission?: string }>): () => void };
  notifications: {
    sendEmail(to: string, subject: string, text: string): Promise<{ sent: boolean } | { skipped: boolean; reason: string }>;
    sendSms(to: string, body: string): Promise<{ sent: boolean } | { skipped: boolean; reason: string }>;
    notifyInApp(userId: string, message: string, type: string): Promise<{ id: string }>;
  };
  database: {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<{ count: number }>;
    transaction<T>(work: (transaction: { query<R = unknown>(sql: string, params?: unknown[]): Promise<R[]>; execute(sql: string, params?: unknown[]): Promise<{ count: number }>; publish(input: { event: string; version: number; subjectKey: string; payload: unknown; idempotencyKey: string }): Promise<void> }) => Promise<T>): Promise<T>;
  };
  readModels: { publish(model: string, version: number, key: string, data: unknown): Promise<void>; read(ownerPluginId: string, model: string, acceptedVersions: number[]): Promise<Array<{ key: string; version: number; data: unknown; updatedAt: Date }>> };
  directory: {
    resolveAudience(input: DirectoryAudienceQuery): Promise<DirectoryRecipient[]>;
    lookupUsers(ids: string[]): Promise<Array<{ id: string; name: string; role: string }>>;
    lookupClasses(ids: string[]): Promise<Array<{ id: string; name: string }>>;
    classesForUser(userId: string, role: string): Promise<string[]>;
  };
  realtime: {
    notifyUser(userId: string, event: string, payload: unknown): void;
  };
}

export interface RuntimePluginModule {
  id: string;
  activate(context: PluginRuntimeContext): void | (() => void) | Promise<void | (() => void)>;
  deactivate?(context: PluginRuntimeContext): void | Promise<void>;
  health?(): unknown | Promise<unknown>;
}
