const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const snapshotPath = path.join(repositoryRoot, 'docs/architecture/generated/current-architecture-inventory.json');
const ignoredDirectories = new Set(['.git', '.next', '.core-build', 'coverage', 'dist', 'dist-core', 'node_modules']);

function relative(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/');
}

function walk(root, current = root) {
  if (!fs.existsSync(current)) return [];
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...walk(root, absolute));
    else if (entry.isFile()) files.push(relative(root, absolute));
  }
  return files;
}

function read(root, file) {
  return fs.readFileSync(path.join(root, ...file.split('/')), 'utf8');
}

function quotedArgument(value) {
  const match = String(value || '').match(/['"`]([^'"`]*)['"`]/);
  return match ? match[1] : '';
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function propertyValue(objectSource, property) {
  const match = objectSource.match(new RegExp(`\\b${property}\\s*:\\s*(['\"\`])([^'\"\`]*)\\1`));
  return match ? match[2] : null;
}

function prismaModelInventory(source) {
  const models = [];
  const starts = [...source.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm)];
  for (const start of starts) {
    const bodyStart = start.index + start[0].length;
    const closing = source.slice(bodyStart).match(/^}/m);
    if (!closing) throw new Error(`Unclosed Prisma model: ${start[1]}`);
    const end = bodyStart + closing.index;
    const body = source.slice(bodyStart, end);
    const fields = [];
    const indexes = [];
    let mappedTable = null;
    let offset = bodyStart;
    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('@@')) {
        if (/^@@(index|unique|id|fulltext)\b/.test(line)) indexes.push({ definition: line, line: lineNumber(source, offset) });
        const map = line.match(/^@@map\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (map) mappedTable = map[1];
      } else if (line && !line.startsWith('//')) {
        const field = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s+([^\s]+)(.*)$/);
        if (field) {
          const attributes = field[3].trim();
          const relation = attributes.match(/@relation(?:\(([^)]*)\))?/);
          const map = attributes.match(/@map\s*\(\s*['"]([^'"]+)['"]\s*\)/);
          fields.push({
            name: field[1],
            type: field[2],
            line: lineNumber(source, offset),
            relation: relation ? (quotedArgument(relation[1]) || 'implicit') : null,
            mappedColumn: map ? map[1] : null,
            attributes,
          });
        }
      }
      offset += rawLine.length + 1;
    }
    models.push({
      name: start[1],
      line: lineNumber(source, start.index),
      mappedTable,
      fields,
      indexes,
    });
  }
  return models;
}

function navigationInventory(root, frontendFiles) {
  const navigation = [];
  for (const file of frontendFiles.filter((item) => /^frontend\/lib\/.*nav\.ts$/.test(item))) {
    const source = read(root, file);
    for (const match of source.matchAll(/\{[^{}]*\bhref\s*:\s*['"][^'"]+['"][^{}]*\}/g)) {
      const before = source.slice(0, match.index);
      const exports = [...before.matchAll(/export\s+const\s+([A-Za-z][A-Za-z0-9_]*)\s*=/g)];
      const set = exports.length ? exports[exports.length - 1][1] : null;
      navigation.push({
        file,
        set,
        href: propertyValue(match[0], 'href'),
        label: propertyValue(match[0], 'label'),
        icon: propertyValue(match[0], 'icon'),
        section: propertyValue(match[0], 'section'),
        badgeKey: propertyValue(match[0], 'badgeKey'),
        line: lineNumber(source, match.index),
      });
    }
  }
  return navigation.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function decoratorArguments(source, name) {
  const matches = [...source.matchAll(new RegExp(`@${name}\\s*\\(([^)]*)\\)`, 'g'))];
  if (!matches.length) return [];
  const argumentSource = matches[matches.length - 1][1];
  return [...argumentSource.matchAll(/['"`]([^'"`]*)['"`]|\b([A-Za-z][A-Za-z0-9_]*)\b/g)]
    .map((entry) => entry[1] || entry[2])
    .filter((value) => !['true', 'false', 'undefined'].includes(value));
}

function balancedParentheses(source, opening) {
  let depth = 0;
  let quote = null;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(opening + 1, index);
    }
  }
  return '';
}

function joinRoutePath(prefix, route) {
  const segments = [prefix, route].filter(Boolean).map((part) => part.replace(/^\/+|\/+$/g, ''));
  return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
}

function controllerInventory(root, controllerFiles) {
  const controllers = [];
  const routes = [];
  const routeExpression = /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(([^)]*)\)/g;
  const methodNames = { Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE', Options: 'OPTIONS', Head: 'HEAD', All: 'ALL' };
  for (const file of controllerFiles) {
    const source = read(root, file);
    const classMatch = source.match(/export\s+class\s+([A-Za-z][A-Za-z0-9_]*)/);
    const beforeClass = classMatch ? source.slice(0, classMatch.index) : source;
    const classBodyStart = classMatch ? source.indexOf('{', classMatch.index + classMatch[0].length) : 0;
    const controllerMatch = beforeClass.match(/@Controller(?:\(([^)]*)\))?/);
    const prefix = controllerMatch ? quotedArgument(controllerMatch[1]) : '';
    const classGuards = decoratorArguments(beforeClass, 'UseGuards');
    const classRoles = decoratorArguments(beforeClass, 'Roles');
    controllers.push({
      file,
      className: classMatch ? classMatch[1] : null,
      path: prefix,
      line: controllerMatch ? lineNumber(source, controllerMatch.index) : null,
      guards: classGuards,
      roles: classRoles,
    });

    routeExpression.lastIndex = 0;
    let routeMatch;
    while ((routeMatch = routeExpression.exec(source))) {
      const afterRoute = source.slice(routeExpression.lastIndex);
      const methodMatch = afterRoute.match(/\s*(?:(?:public|protected|private)\s+)?(?:async\s+)?([A-Za-z][A-Za-z0-9_]*)\s*\(/);
      if (!methodMatch) continue;
      const methodStart = routeExpression.lastIndex + methodMatch.index;
      const opening = source.indexOf('(', methodStart + methodMatch[0].lastIndexOf(methodMatch[1]) + methodMatch[1].length);
      const signature = balancedParentheses(source, opening).replace(/\s+/g, ' ').trim();
      const previousMethodEnd = Math.max(source.lastIndexOf('\n  }', routeMatch.index), source.lastIndexOf('\n}', routeMatch.index));
      const decoratorBlock = source.slice(Math.max(0, classBodyStart, previousMethodEnd), methodStart);
      const methodGuards = decoratorArguments(decoratorBlock, 'UseGuards');
      const methodRoles = decoratorArguments(decoratorBlock, 'Roles');
      const parameters = [...signature.matchAll(/@(Body|Param|Query|Headers|Req|Request|UploadedFile|UploadedFiles|Ip|Res|Response)\s*(?:\(([^)]*)\))?/g)]
        .map((entry) => ({ decorator: entry[1], key: quotedArgument(entry[2]) || null }));
      const referencedTypes = [...new Set([...signature.matchAll(/:\s*([A-Z][A-Za-z0-9_]*)\b/g)].map((entry) => entry[1]))].sort();
      const routePath = quotedArgument(routeMatch[2]);
      routes.push({
        file,
        line: lineNumber(source, routeMatch.index),
        controller: classMatch ? classMatch[1] : null,
        handler: methodMatch[1],
        method: methodNames[routeMatch[1]],
        path: routePath,
        fullPath: joinRoutePath(prefix, routePath),
        classGuards,
        methodGuards,
        effectiveRoles: methodRoles.length ? methodRoles : classRoles,
        parameters,
        referencedTypes,
      });
    }
  }
  return { controllers, routes };
}

function firstArgument(source) {
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) return source.slice(0, index).trim();
  }
  return source.trim();
}

function literalValue(expression) {
  const trimmed = expression.trim();
  if (trimmed.length < 2 || !["'", '"', '`'].includes(trimmed[0]) || trimmed.at(-1) !== trimmed[0]) return null;
  return trimmed.slice(1, -1);
}

function normalizeConsumerPath(expression, client) {
  let value = literalValue(expression);
  if (value === null) return null;
  value = value
    .replace(/^\$\{(?:getApiBase\(\)|apiBase|serverUrl)\}/, '')
    .replace(/^\$\{[^}]+\}/, '')
    .replace(/\$\{[^}]+\}/g, ':dynamic')
    .split('?')[0];
  if (client === 'fetchWithAuth' && value.startsWith('/')) value = `/api${value}`;
  if (!value.startsWith('/api/')) return null;
  return value.slice('/api'.length) || '/';
}

function consumerTarget(expression, normalizedPath) {
  const value = literalValue(expression) || '';
  if (/^\/api\/marketplace(?:\/|$)/.test(value)) return 'marketplace-api-proxy';
  if (/^\/api\/platform(?:\/|$)/.test(value)) return 'platform-api-proxy';
  if (normalizedPath) return 'school-api';
  return 'dynamic-or-external';
}

function routePatternMatches(pattern, candidate) {
  const expected = pattern.split('/').filter(Boolean);
  const actual = candidate.split('/').filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => segment.startsWith(':') || actual[index] === ':dynamic' || segment === actual[index]);
}

function apiConsumerInventory(root, files, backendRoutes) {
  const consumers = [];
  const callExpression = /\b(apiFetch|fetchWithAuth|fetch|axios\.(?:get|post|put|patch|delete))\s*\(/g;
  for (const file of files.filter((item) => /\.(?:ts|tsx|js|jsx)$/.test(item))) {
    const source = read(root, file);
    callExpression.lastIndex = 0;
    let match;
    while ((match = callExpression.exec(source))) {
      const opening = source.indexOf('(', match.index + match[1].length);
      const call = balancedParentheses(source, opening);
      const argument = firstArgument(call);
      const client = match[1];
      const normalizedPath = normalizeConsumerPath(argument, client);
      const methodMatch = call.match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)['"]/i);
      const method = client.startsWith('axios.') ? client.slice('axios.'.length).toUpperCase() : (methodMatch ? methodMatch[1].toUpperCase() : 'GET');
      const target = consumerTarget(argument, normalizedPath);
      const comparablePath = normalizedPath?.replace(/([^/]):dynamic$/, '$1') || null;
      const matchedRoutes = target === 'school-api' && comparablePath
        ? backendRoutes.filter((route) => (route.method === method || route.method === 'ALL') && routePatternMatches(route.fullPath, comparablePath))
          .map((route) => `${route.method} ${route.fullPath}`)
        : [];
      const surface = file.startsWith('frontend/') ? 'school-web'
        : file.startsWith('apps/mobile/') ? 'mobile'
          : 'workspace-app';
      consumers.push({
        file,
        line: lineNumber(source, match.index),
        surface,
        client,
        method,
        target,
        expression: argument.replace(/\s+/g, ' ').slice(0, 500),
        normalizedPath,
        matchedRoutes,
      });
    }
  }
  return consumers.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function resolveRelativeImport(root, fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(root, path.dirname(fromFile), specifier);
  const candidates = [base, ...['.ts', '.tsx', '.js', '.jsx'].map((extension) => `${base}${extension}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((name) => path.join(base, name))];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return resolved ? relative(root, resolved) : null;
}

function frontendImportInventory(root, frontendFiles) {
  const imports = [];
  for (const file of frontendFiles.filter((item) => /\.(?:ts|tsx|js|jsx)$/.test(item))) {
    const source = read(root, file);
    const expression = /(?:import[\s\S]*?\sfrom\s*|import\s*\(|require\s*\()(['"])([^'"]+)\1/g;
    for (const match of source.matchAll(expression)) {
      imports.push({
        file,
        line: lineNumber(source, match.index),
        specifier: match[2],
        resolved: resolveRelativeImport(root, file, match[2]),
      });
    }
  }
  return imports.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function sharedComponentInventory(frontendFiles, imports) {
  return frontendFiles
    .filter((file) => /^frontend\/components\/.*\.(?:ts|tsx|js|jsx)$/.test(file))
    .map((file) => ({
      file,
      imports: imports.filter((entry) => entry.file === file).map((entry) => entry.resolved || entry.specifier),
      importedBy: imports.filter((entry) => entry.resolved === file).map((entry) => entry.file),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function frontendProxyInventory(root, files) {
  const proxies = [];
  for (const file of files.filter((item) => /(?:^|\/)app\/api\/.*\/route\.ts$/.test(item))) {
    const source = read(root, file);
    const marker = '/app/api/';
    const routeStart = file.indexOf(marker);
    const route = routeStart >= 0 ? `/api/${file.slice(routeStart + marker.length, -'/route.ts'.length)}` : null;
    const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)]
      .map((match) => ({ method: match[1], line: lineNumber(source, match.index) }));
    proxies.push({ file, route, methods });
  }
  return proxies.sort((a, b) => a.file.localeCompare(b.file));
}

function deepLinkInventory(root, frontendFiles) {
  const links = [];
  const expressions = [
    { kind: 'jsx-href', regex: /\bhref\s*=\s*(?:\{\s*)?(['"`])([^'"`]+)\1/g, valueGroup: 2 },
    { kind: 'router', regex: /\b(?:router\.(?:push|replace)|redirect)\s*\(\s*(['"`])([^'"`]+)\1/g, valueGroup: 2 },
    { kind: 'location', regex: /\b(?:window\.)?location\.(?:assign|replace)\s*\(\s*(['"`])([^'"`]+)\1/g, valueGroup: 2 },
    { kind: 'location-href', regex: /\b(?:window\.)?location\.href\s*=\s*(['"`])([^'"`]+)\1/g, valueGroup: 2 },
  ];
  for (const file of frontendFiles.filter((item) => /\.(?:ts|tsx|js|jsx)$/.test(item))) {
    const source = read(root, file);
    for (const descriptor of expressions) {
      for (const match of source.matchAll(descriptor.regex)) {
        const value = match[descriptor.valueGroup];
        if (!value.startsWith('/') && !value.startsWith('http') && !value.startsWith('${')) continue;
        links.push({
          file,
          line: lineNumber(source, match.index),
          kind: descriptor.kind,
          expression: value.replace(/\$\{[^}]+\}/g, ':dynamic'),
        });
      }
    }
  }
  return links.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

function scheduledJobInventory(root, sourceFiles) {
  const jobs = [];
  const expression = /@(Cron|Interval|Timeout)\s*\(([^)]*)\)/g;
  for (const file of sourceFiles) {
    const source = read(root, file);
    for (const match of source.matchAll(expression)) {
      const after = source.slice(match.index + match[0].length);
      const handler = after.match(/\s*(?:async\s+)?([A-Za-z][A-Za-z0-9_]*)\s*\(/);
      const classes = [...source.slice(0, match.index).matchAll(/export\s+class\s+([A-Za-z][A-Za-z0-9_]*)/g)];
      jobs.push({
        file,
        line: lineNumber(source, match.index),
        kind: match[1],
        scheduleExpression: match[2].replace(/\s+/g, ' ').trim(),
        scheduleValue: quotedArgument(match[2]) || null,
        className: classes.length ? classes.at(-1)[1] : null,
        handler: handler ? handler[1] : null,
        processOwnership: 'worker-or-combined',
      });
    }
  }
  return jobs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function websocketGatewayInventory(root, sourceFiles) {
  const gateways = [];
  for (const file of sourceFiles) {
    const source = read(root, file);
    const decorator = /^\s*@WebSocketGateway\s*\(/m.exec(source);
    if (!decorator) continue;
    const opening = source.indexOf('(', decorator.index);
    const configuration = balancedParentheses(source, opening).replace(/\s+/g, ' ').trim();
    const classMatch = source.slice(opening).match(/export\s+class\s+([A-Za-z][A-Za-z0-9_]*)/);
    const className = classMatch ? classMatch[1] : null;
    const classPosition = classMatch ? opening + classMatch.index : source.length;
    const decoratorBlock = source.slice(decorator.index, classPosition);
    const subscriptions = [];
    for (const match of source.matchAll(/@SubscribeMessage\s*\(([^)]*)\)/g)) {
      const after = source.slice(match.index + match[0].length);
      const handler = after.match(/\s*(?:async\s+)?([A-Za-z][A-Za-z0-9_]*)\s*\(/);
      subscriptions.push({ event: quotedArgument(match[1]), handler: handler ? handler[1] : null, line: lineNumber(source, match.index) });
    }
    gateways.push({
      file,
      line: lineNumber(source, decorator.index),
      className,
      namespace: propertyValue(configuration, 'namespace') || '/',
      corsConfigured: /\bcors\s*:/.test(configuration),
      guards: decoratorArguments(decoratorBlock, 'UseGuards'),
      authenticatesConnection: /\bauthenticateSocket\s*\(/.test(source),
      enforcesSchoolAccessOnConnection: /\bdisconnectIfSuspended\s*\(/.test(source),
      requiresAuthenticatedMessageUser: /\brequireSocketUser\s*\(/.test(source),
      hasConnectionHook: /\bhandleConnection\s*\(/.test(source),
      hasDisconnectHook: /\bhandleDisconnect\s*\(/.test(source),
      subscriptions,
    });
  }
  return gateways.sort((a, b) => a.file.localeCompare(b.file));
}

function pluginJobInventory(root, pluginFiles) {
  const jobs = [];
  for (const file of pluginFiles.filter((item) => /\.(?:js|ts)$/.test(item))) {
    const source = read(root, file);
    for (const match of source.matchAll(/\bcontext\.jobs\.register\s*\(/g)) {
      const opening = source.indexOf('(', match.index);
      const registration = balancedParentheses(source, opening);
      const id = registration.match(/\bid\s*:\s*['"`]([^'"`]+)['"`]/);
      const interval = registration.match(/\bintervalSeconds\s*:\s*([^,}\n]+)/);
      jobs.push({
        file,
        line: lineNumber(source, match.index),
        id: id ? id[1] : null,
        intervalSecondsExpression: interval ? interval[1].trim() : null,
        handlerDeclared: /\bhandler\s*\(/.test(registration) || /\bhandler\s*:/.test(registration),
        processOwnership: 'worker-or-combined',
      });
    }
  }
  return jobs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function matchRecords(root, files, patterns) {
  const records = [];
  for (const file of files.filter((item) => /\.(?:ts|tsx|js|jsx)$/.test(item))) {
    const source = read(root, file);
    for (const descriptor of patterns) {
      for (const match of source.matchAll(descriptor.regex)) {
        records.push({
          file,
          line: lineNumber(source, match.index),
          kind: descriptor.kind,
          value: descriptor.value ? descriptor.value(match) : (match[1] || null),
        });
      }
    }
  }
  return records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

function splitArguments(source) {
  const argumentsList = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const previous = source[index - 1];
    if (quote) {
      if (character === quote && previous !== '\\') quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') { quote = character; continue; }
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth -= 1;
    if (character === ',' && depth === 0) {
      argumentsList.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  const finalArgument = source.slice(start).trim();
  if (finalArgument) argumentsList.push(finalArgument);
  return argumentsList;
}

function notificationInventory(root, files, apiConsumers, scheduledJobs) {
  const deliveries = [];
  const deliveryPatterns = [
    { regex: /\b(?:this\.|context\.)?notifications?\.(sendEmail|sendSms|notifyInApp)\s*\(/g, channel: (method) => ({ sendEmail: 'email', sendSms: 'sms', notifyInApp: 'in-app' })[method] },
    { regex: /\bsgMail\.send\s*\(/g, method: 'send', channel: () => 'email-provider' },
    { regex: /\b(?:this\.)?twilioClient\.messages\.create\s*\(/g, method: 'create', channel: () => 'sms-provider' },
  ];
  for (const file of files.filter((item) => /\.(?:ts|tsx|js|jsx)$/.test(item))) {
    const source = read(root, file);
    for (const descriptor of deliveryPatterns) {
      for (const match of source.matchAll(descriptor.regex)) {
        const method = descriptor.method || match[1];
        const opening = source.indexOf('(', match.index);
        const args = splitArguments(balancedParentheses(source, opening));
        deliveries.push({
          file,
          line: lineNumber(source, match.index),
          channel: descriptor.channel(method),
          method,
          recipientExpression: args[0]?.replace(/\s+/g, ' ').slice(0, 300) || null,
          templateExpressions: args.slice(1).map((argument) => argument.replace(/\s+/g, ' ').slice(0, 500)),
        });
      }
    }
  }
  deliveries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.channel.localeCompare(b.channel));

  const databaseWrites = matchRecords(root, files, [
    { kind: 'notification-write', regex: /\b(?:this\.)?prisma\.notification\.(create|createMany|upsert|update|updateMany|delete|deleteMany)\s*\(/g, value: (match) => match[1] },
  ]);
  const recipientResolution = matchRecords(root, files, [
    { kind: 'directory-recipient-resolution', regex: /\b(?:this\.|context\.)?directory(?:Service)?\.(resolveAudience|lookupUsers|lookupClasses|classesForUser)\s*\(/g, value: (match) => match[1] },
  ]);
  const preferenceAccess = matchRecords(root, files, [
    { kind: 'notification-preference', regex: /\b(?:this\.)?prisma\.notificationPreference\.(findUnique|findFirst|findMany|create|createMany|upsert|update|updateMany|delete|deleteMany)\s*\(/g, value: (match) => match[1] },
  ]);
  const quotaControls = matchRecords(root, files, [
    { kind: 'plugin-notification-quota', regex: /\b(PLUGIN_NOTIFICATION_DAILY_LIMIT|PluginNotificationQuotaService|PluginNotificationUsage)\b/g, value: (match) => match[1] },
  ]);
  const notificationApiConsumers = apiConsumers.filter((consumer) =>
    /(?:notification|announcement|message|billing-alert)/i.test(`${consumer.normalizedPath || ''} ${consumer.expression}`));
  const digestJobs = scheduledJobs.filter((job) => /(?:notification|digest)/i.test(`${job.file} ${job.className || ''} ${job.handler || ''}`));

  return { deliveries, databaseWrites, recipientResolution, preferenceAccess, quotaControls, notificationApiConsumers, digestJobs };
}

function reportInventory(root, files, frontendPages, httpRoutes, apiConsumers, fileStorage) {
  const reportPages = frontendPages.filter((page) => /(?:report|analytics|dashboard|print|export)/i.test(page.route));
  const reportRoutes = httpRoutes.filter((route) => /(?:report|analytics|summary|totals|grid|export)/i.test(`${route.fullPath} ${route.handler}`));
  const reportApiConsumers = apiConsumers.filter((consumer) =>
    /(?:report|analytics|summary|totals|grid|export)/i.test(`${consumer.normalizedPath || ''} ${consumer.expression}`));
  const surfaceFiles = new Set([
    ...reportPages.map((entry) => entry.file),
    ...reportRoutes.map((entry) => entry.file),
    ...reportApiConsumers.map((entry) => entry.file),
    ...files.filter((file) => /report|data-export/i.test(file)),
  ]);
  const reportFiles = [...surfaceFiles].sort();
  const filters = matchRecords(root, reportFiles, [
    { kind: 'query-string-filter', regex: /[?&]([A-Za-z][A-Za-z0-9_-]*)=/g, value: (match) => match[1] },
    { kind: 'url-search-parameter', regex: /\b(?:searchParams|params)\.(?:get|getAll|has|set|append)\s*\(\s*['"`]([^'"`]+)['"`]/g, value: (match) => match[1] },
    { kind: 'request-query-filter', regex: /@Query\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g, value: (match) => match[1] },
  ]);
  const calculations = matchRecords(root, reportFiles, [
    { kind: 'collection-calculation', regex: /\.(reduce|filter|map)\s*\(/g, value: (match) => match[1] },
    { kind: 'database-calculation', regex: /\.(count|aggregate|groupBy)\s*\(/g, value: (match) => match[1] },
    { kind: 'aggregate-selection', regex: /\b(_sum|_avg|_count|_min|_max)\s*:/g, value: (match) => match[1] },
    { kind: 'named-metric', regex: /\b(?:const|let)\s+([A-Za-z][A-Za-z0-9_]*(?:total|count|average|avg|percent|percentage|rate|balance|score)[A-Za-z0-9_]*)\s*=/gi, value: (match) => match[1] },
  ]);
  const exportSites = fileStorage.downloadAndDocumentSites.filter((entry) => entry.kind !== 'print');
  const printViews = [
    ...frontendPages.filter((page) => /(?:^|\/)print(?:\/|$)/i.test(page.route)).map((page) => ({ file: page.file, line: null, kind: 'print-page', value: page.route })),
    ...fileStorage.downloadAndDocumentSites.filter((entry) => entry.kind === 'print'),
  ].sort((a, b) => a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0));

  return { reportFiles, reportPages, reportRoutes, reportApiConsumers, filters, calculations, exportSites, printViews };
}

function mobileInventory(root, appFiles, apiConsumers) {
  const mobileFiles = appFiles.filter((file) => file.startsWith('apps/mobile/'));
  const sourceFiles = mobileFiles.filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
  const screens = sourceFiles
    .filter((file) => /\/screens\/[^/]+Screen\.(?:ts|tsx|js|jsx)$/.test(file))
    .map((file) => {
      const source = read(root, file);
      const component = source.match(/export\s+default\s+function\s+([A-Za-z][A-Za-z0-9_]*)/)?.[1] || null;
      return { file, component };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
  const navigationRegistrations = matchRecords(root, sourceFiles, [
    { kind: 'stack-screen', regex: /<Stack\.Screen\b[^>]*\bname\s*=\s*['"]([^'"]+)['"][^>]*>/g, value: (match) => {
      const component = match[0].match(/\bcomponent\s*=\s*\{([A-Za-z][A-Za-z0-9_]*)\}/)?.[1] || null;
      return `${match[1]}:${component || 'unknown'}`;
    } },
    { kind: 'navigate-call', regex: /\bnavigation\.(?:navigate|replace|push)\s*\(\s*['"`]([^'"`]+)['"`]/g, value: (match) => match[1] },
  ]);
  const secureStorage = matchRecords(root, sourceFiles, [
    { kind: 'secure-store', regex: /\bSecureStore\.(getItemAsync|setItemAsync|deleteItemAsync)\s*\(\s*([^,)]+)/g, value: (match) => `${match[1]}:${match[2].trim()}` },
  ]);
  const offlineAndNetworkBehavior = matchRecords(root, sourceFiles, [
    { kind: 'offline-signal', regex: /\b(offline|isConnected|NetInfo|AsyncStorage)\b/gi, value: (match) => match[1] },
    { kind: 'request-timeout', regex: /\bAbortController\s*\(/g, value: () => 'AbortController' },
    { kind: 'authentication-retry', regex: /\brefreshAccessToken\s*\(/g, value: () => 'refreshAccessToken' },
  ]);
  const nativeCapabilities = matchRecords(root, sourceFiles, [
    { kind: 'expo-module', regex: /from\s+['"](expo-(?:camera|location|haptics|audio|secure-store))['"]/g, value: (match) => match[1] },
    { kind: 'permission-request', regex: /\b(useCameraPermissions|requestForegroundPermissionsAsync)\s*\(/g, value: (match) => match[1] },
    { kind: 'barcode-scanner', regex: /\bonBarcodeScanned\s*=/g, value: () => 'onBarcodeScanned' },
  ]);
  const packagePath = 'apps/mobile/package.json';
  const appConfigPath = 'apps/mobile/app.json';
  const packageDocument = fs.existsSync(path.join(root, packagePath)) ? JSON.parse(read(root, packagePath)) : {};
  const appDocument = fs.existsSync(path.join(root, appConfigPath)) ? JSON.parse(read(root, appConfigPath)) : {};
  const expo = appDocument.expo || {};
  const configuredPlugins = (expo.plugins || []).map((entry) => Array.isArray(entry) ? entry[0] : entry).sort();
  const configuredPermissions = [
    ...(expo.android?.permissions || []),
    ...Object.keys(expo.ios?.infoPlist || {}),
  ].sort();
  const dependencies = Object.entries(packageDocument.dependencies || {})
    .map(([name, version]) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const mobileApiConsumers = apiConsumers.filter((consumer) => consumer.surface === 'mobile');

  return {
    screens,
    navigationRegistrations,
    mobileApiConsumers,
    secureStorage,
    offlineAndNetworkBehavior,
    nativeCapabilities,
    configuredPlugins,
    configuredPermissions,
    dependencies,
  };
}

const ownershipManifestPath = 'docs/architecture/ownership-manifest.json';
const UNOWNED = 'unclassified';

function loadOwnershipManifest(root) {
  const file = path.join(root, ...ownershipManifestPath.split('/'));
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function tally(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * LC1-011: one future owner for every discovered item, resolved from the reviewed ownership manifest
 * rather than from rules buried in this scanner. Rules are ordered and the first match wins. There is
 * deliberately no catch-all, so a new backend area, page, route file or model with no rule becomes a
 * reported gap instead of silently turning into core. A mixed module names a split plan; each of its
 * items still resolves to exactly one owner.
 */
function ownershipInventory(inventory, manifest) {
  const errors = [];
  if (!manifest) errors.push(`Ownership manifest is missing: ${ownershipManifestPath}`);
  const source = manifest || {};
  const owners = source.owners || {};
  const decisions = source.decisions || {};
  const splitPlans = source.splitPlans || {};
  const models = source.models || {};

  const compile = (section) => (source[section] || []).map((rule, index) => {
    const id = `${section}[${index}]`;
    let regex = null;
    try { regex = new RegExp(rule.match); } catch (error) { errors.push(`${id}: invalid pattern: ${error.message}`); }
    return { ...rule, id, regex, used: 0 };
  });
  const fileRules = compile('files');
  const routeRules = compile('routes');
  const pageRules = compile('pages');

  const checkReference = (where, entry) => {
    if (!owners[entry.owner]) errors.push(`${where}: unknown owner ${entry.owner}`);
    if (entry.decision && !decisions[entry.decision]) errors.push(`${where}: unknown decision ${entry.decision}`);
    if (entry.splitPlan) {
      const plan = splitPlans[entry.splitPlan];
      if (!plan) errors.push(`${where}: unknown split plan ${entry.splitPlan}`);
      else if (!(plan.owners || []).includes(entry.owner)) errors.push(`${where}: ${entry.owner} is not an owner in split plan ${entry.splitPlan}`);
    }
  };
  [...fileRules, ...routeRules, ...pageRules].forEach((rule) => checkReference(rule.id, rule));
  for (const [name, entry] of Object.entries(models)) {
    checkReference(`models.${name}`, entry);
    if (!inventory.prismaModels.some((model) => model.name === name)) errors.push(`models.${name}: no such Prisma model`);
  }
  for (const [id, plan] of Object.entries(splitPlans)) {
    for (const owner of plan.owners || []) if (!owners[owner]) errors.push(`splitPlans.${id}: unknown owner ${owner}`);
    if (plan.decision && !decisions[plan.decision]) errors.push(`splitPlans.${id}: unknown decision ${plan.decision}`);
  }
  for (const [id, owner] of Object.entries(owners)) {
    for (const dependency of [...(owner.dependsOn || []), ...(owner.optionalDependsOn || [])]) {
      if (!owners[dependency]) errors.push(`owners.${id}: unknown dependency ${dependency}`);
    }
  }
  if (manifest && !owners[source.mobileConfigurationOwner]) errors.push(`mobileConfigurationOwner: unknown owner ${source.mobileConfigurationOwner}`);

  const assigned = (rule) => ({
    owner: rule.owner,
    rule: rule.id,
    ...(rule.decision ? { decision: rule.decision } : {}),
    ...(rule.splitPlan ? { splitPlan: rule.splitPlan } : {}),
  });
  const firstMatch = (rules, value) => {
    const rule = rules.find((candidate) => candidate.regex && candidate.regex.test(value));
    if (rule) rule.used += 1;
    return rule;
  };
  const pageOwner = (route) => {
    const rule = firstMatch(pageRules, route);
    return rule ? assigned(rule) : { owner: UNOWNED, rule: null };
  };

  const pageRouteByFile = new Map(inventory.frontendPages.map((page) => [page.file, page.route]));
  const importers = new Map();
  for (const entry of inventory.frontendImports) {
    if (!entry.resolved) continue;
    if (!importers.has(entry.resolved)) importers.set(entry.resolved, new Set());
    importers.get(entry.resolved).add(entry.file);
  }
  // A non-page file inside a route folder (loading.tsx, a layout, a page's own form) belongs to the
  // nearest page at or above it.
  const segmentOwner = (file) => {
    for (let directory = path.posix.dirname(file); directory.startsWith('frontend/app'); directory = path.posix.dirname(directory)) {
      const page = `${directory}/page.tsx`;
      if (pageRouteByFile.has(page)) {
        const owned = pageOwner(pageRouteByFile.get(page));
        return owned.owner === UNOWNED ? owned : { ...owned, rule: 'route-segment-owner', derivedFrom: [page] };
      }
      if (directory === 'frontend/app') break;
    }
    return { owner: UNOWNED, rule: null };
  };
  const fileCache = new Map();
  // A component or helper with no rule takes the owner of the files importing it when they all agree;
  // when they disagree it is a gap naming the competing owners, so the manifest has to decide.
  const fileOwner = (file, visiting = new Set()) => {
    if (fileCache.has(file)) return fileCache.get(file);
    if (visiting.has(file)) return null;
    let result;
    if (pageRouteByFile.has(file)) result = pageOwner(pageRouteByFile.get(file));
    else {
      const rule = firstMatch(fileRules, file);
      if (rule) result = assigned(rule);
      else if (/^frontend\/(components|lib)\//.test(file)) {
        visiting.add(file);
        const derivedFrom = [...(importers.get(file) || [])].sort();
        const importerOwners = [...new Set(derivedFrom.map((importer) => fileOwner(importer, visiting)).filter(Boolean).map((entry) => entry.owner))].sort();
        visiting.delete(file);
        result = importerOwners.length === 1 && importerOwners[0] !== UNOWNED
          ? { owner: importerOwners[0], rule: 'sole-importer-owner', derivedFrom }
          : { owner: UNOWNED, rule: null, importerOwners };
      } else if (file.startsWith('frontend/app/')) result = segmentOwner(file);
      else result = { owner: UNOWNED, rule: null };
    }
    fileCache.set(file, result);
    return result;
  };

  // Every file a record points at, plus report files and resolved import targets: records inside a
  // file (notifications, reports, file storage, consumers, mobile calls) are owned through it.
  const discoveredFiles = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (typeof value.file === 'string') discoveredFiles.add(value.file);
      Object.values(value).forEach(visit);
    }
  };
  visit(inventory);
  inventory.reports.reportFiles.forEach((file) => discoveredFiles.add(file));
  [...inventory.frontendImports, ...inventory.sourceImports].forEach((entry) => { if (entry.resolved) discoveredFiles.add(entry.resolved); });

  const modelOwner = (name) => {
    const entry = models[name];
    return entry ? { owner: entry.owner, rule: `models.${name}`, ...(entry.decision ? { decision: entry.decision } : {}) } : { owner: UNOWNED, rule: null };
  };
  const mobileOwner = { owner: owners[source.mobileConfigurationOwner] ? source.mobileConfigurationOwner : UNOWNED, rule: 'mobileConfigurationOwner' };

  const items = {
    modules: inventory.nestModules.map((entry) => ({ file: entry.file, rootComposition: entry.rootComposition, ...fileOwner(entry.file) })),
    models: inventory.prismaModels.map((entry) => ({ model: entry.name, ...modelOwner(entry.name) })),
    controllers: inventory.controllers.map((entry) => ({ file: entry.file, className: entry.className, ...fileOwner(entry.file) })),
    routes: inventory.httpRoutes.map((entry) => {
      const route = `${entry.method} ${entry.fullPath}`;
      const rule = firstMatch(routeRules, route);
      return { route, file: entry.file, handler: entry.handler, ...(rule ? assigned(rule) : fileOwner(entry.file)) };
    }),
    pages: inventory.frontendPages.map((entry) => ({ route: entry.route, file: entry.file, ...pageOwner(entry.route) })),
    navigation: inventory.navigation.map((entry) => ({
      set: entry.set, href: entry.href, label: entry.label,
      ...(entry.href ? pageOwner(entry.href.split(/[?#]/)[0]) : { owner: UNOWNED, rule: null }),
    })),
    scheduledJobs: inventory.scheduledJobs.map((entry) => ({ file: entry.file, handler: `${entry.className}.${entry.handler}`, ...fileOwner(entry.file) })),
    websocketGateways: inventory.websocketGateways.map((entry) => ({ file: entry.file, className: entry.className, ...fileOwner(entry.file) })),
    pluginJobs: inventory.pluginJobRegistrations.map((entry) => ({ file: entry.file, id: entry.id, ...fileOwner(entry.file) })),
    frontendApiProxies: inventory.frontendApiProxies.map((entry) => ({ file: entry.file, route: entry.route, ...fileOwner(entry.file) })),
    officialPlugins: inventory.officialPlugins.map((entry) => ({
      directory: entry.directory, pluginId: entry.pluginId, version: entry.version, ...fileOwner(`${entry.directory}/`),
    })),
    files: [...discoveredFiles].sort().map((file) => ({ file, ...fileOwner(file) })),
    mobileConfiguration: [
      ...inventory.mobile.configuredPlugins.map((name) => ({ kind: 'expo-plugin', name })),
      ...inventory.mobile.configuredPermissions.map((name) => ({ kind: 'permission', name })),
      ...inventory.mobile.dependencies.map((entry) => ({ kind: 'dependency', name: entry.name })),
    ].map((entry) => ({ ...entry, ...mobileOwner })),
  };

  const keyOf = {
    modules: (item) => item.file, models: (item) => item.model, controllers: (item) => item.file, routes: (item) => item.route,
    pages: (item) => item.route, navigation: (item) => `${item.set} ${item.href}`, scheduledJobs: (item) => `${item.file}#${item.handler}`,
    websocketGateways: (item) => item.file, pluginJobs: (item) => `${item.file}#${item.id}`, frontendApiProxies: (item) => item.file,
    officialPlugins: (item) => item.directory, files: (item) => item.file, mobileConfiguration: (item) => `${item.kind}:${item.name}`,
  };
  const gaps = [];
  const byOwner = {};
  for (const [category, list] of Object.entries(items)) {
    for (const item of list) {
      byOwner[item.owner] ||= {};
      byOwner[item.owner][category] = (byOwner[item.owner][category] || 0) + 1;
      if (item.owner === UNOWNED) {
        // A route, page or job gap also names its file, so the gate can say which file needs a rule.
        const key = keyOf[category](item);
        gaps.push({ category, key, ...(item.file && item.file !== key ? { file: item.file } : {}), ...(item.importerOwners ? { importerOwners: item.importerOwners } : {}) });
      }
    }
  }
  const everyItem = Object.values(items).flat();

  const recordsIn = (group) => Object.values(group).filter(Array.isArray).flat().filter((record) => record && typeof record.file === 'string');
  const ownersOf = (records) => tally(records.map((record) => fileOwner(record.file).owner));
  const recordOwners = {
    notifications: ownersOf(recordsIn(inventory.notifications)),
    reports: ownersOf(recordsIn(inventory.reports)),
    fileStorage: ownersOf(recordsIn(inventory.fileStorage)),
    mobile: ownersOf(recordsIn(inventory.mobile)),
    apiConsumers: ownersOf(inventory.apiConsumers),
    frontendDeepLinks: ownersOf(inventory.frontendDeepLinks),
  };

  const splitPlanSummary = Object.entries(splitPlans).sort(([a], [b]) => a.localeCompare(b)).map(([id, plan]) => {
    const members = everyItem.filter((item) => item.splitPlan === id);
    return { id, area: plan.area || null, owners: plan.owners || [], decision: plan.decision || null, items: members.length, itemsByOwner: tally(members.map((item) => item.owner)) };
  });
  for (const plan of splitPlanSummary) if (plan.items === 0) errors.push(`splitPlans.${plan.id}: no discovered item uses this split plan`);
  const unusedRules = [...fileRules, ...routeRules, ...pageRules].filter((rule) => rule.used === 0).map((rule) => ({ rule: rule.id, match: rule.match }));

  return {
    status: source.status || 'missing-manifest',
    manifest: ownershipManifestPath,
    owners: Object.keys(owners).sort(),
    summary: {
      items: everyItem.length,
      provisionalItems: everyItem.filter((item) => item.decision).length,
      gaps: gaps.length,
      errors: errors.length,
      unusedRules: unusedRules.length,
      splitPlans: splitPlanSummary.length,
    },
    byOwner: Object.fromEntries(Object.entries(byOwner).sort(([a], [b]) => a.localeCompare(b))),
    provisional: tally(everyItem.filter((item) => item.decision).map((item) => item.decision)),
    splitPlans: splitPlanSummary,
    recordOwners,
    gaps,
    errors,
    unusedRules,
    items,
  };
}

function fileStorageInventory(root, files) {
  const uploadHandlers = matchRecords(root, files, [
    { kind: 'file-interceptor', regex: /\bFileInterceptor\s*\(\s*(['"`])([^'"`]+)\1/g, value: (match) => match[2] },
    { kind: 'uploaded-file-parameter', regex: /@UploadedFile(?:s)?\s*\(/g, value: () => null },
  ]);
  const frontendFileInputs = matchRecords(root, files, [
    { kind: 'file-input', regex: /<input\b[^>]*\btype\s*=\s*(['"])file\1[^>]*>/gi, value: (match) => match[0].replace(/\s+/g, ' ').slice(0, 300) },
  ]);
  const downloadAndDocumentSites = matchRecords(root, files, [
    { kind: 'content-disposition', regex: /['"]Content-Disposition['"]\s*:/g, value: () => null },
    { kind: 'browser-download', regex: /\.download\s*=|URL\.createObjectURL\s*\(/g, value: (match) => match[0] },
    { kind: 'pdf-generation', regex: /\b(?:new\s+jsPDF|PDFDocument\s*\(|renderToBuffer\s*\()/g, value: (match) => match[0] },
    { kind: 'spreadsheet-generation', regex: /\b(?:new\s+ExcelJS\.|XLSX\.(?:write|writeFile)|workbook\.xlsx\.write)/g, value: (match) => match[0] },
    { kind: 'csv-generation', regex: /\b(?:text\/csv|toCsv|toCSV|csvContent|csvRows)\b/g, value: (match) => match[0] },
    { kind: 'print', regex: /\bwindow\.print\s*\(/g, value: () => 'window.print' },
  ]);
  const filesystemOperations = matchRecords(root, files, [
    { kind: 'filesystem', regex: /\b(?:fs\.)?(readFile|writeFile|appendFile|mkdir|rename|copyFile|unlink|rm|readdir|stat|access|open)\s*\(/g, value: (match) => match[1] },
  ]);
  const storageConfiguration = matchRecords(root, files, [
    { kind: 'environment', regex: /\bprocess\.env\.([A-Z][A-Z0-9_]*(?:DIR|PATH|BUCKET|ENDPOINT|REGION)[A-Z0-9_]*)\b/g, value: (match) => match[1] },
    { kind: 'environment', regex: /\bprocess\.env\[['"]([A-Z][A-Z0-9_]*(?:DIR|PATH|BUCKET|ENDPOINT|REGION)[A-Z0-9_]*)['"]\]/g, value: (match) => match[1] },
    { kind: 'environment-object', regex: /(?<!process\.)\benv\.([A-Z][A-Z0-9_]*(?:DIR|PATH|BUCKET|ENDPOINT|REGION)[A-Z0-9_]*)\b/g, value: (match) => match[1] },
    { kind: 'persistent-path', regex: /['"](\/data\/(?:backups|plugins|plugin-data|update-state|marketplace-identity|artifacts)(?:\/[^'"]*)?)['"]/g, value: (match) => match[1] },
  ]);
  const pluginStorageCalls = matchRecords(root, files, [
    { kind: 'plugin-storage', regex: /\bcontext\.storage\.(readText|writeText|delete|list)\s*\(/g, value: (match) => match[1] },
  ]);
  return { uploadHandlers, frontendFileInputs, downloadAndDocumentSites, filesystemOperations, storageConfiguration, pluginStorageCalls };
}

function scanDecorators(root, files, expression, typeNames) {
  const records = [];
  for (const file of files) {
    const source = read(root, file);
    expression.lastIndex = 0;
    let match;
    while ((match = expression.exec(source))) {
      records.push({
        file,
        line: lineNumber(source, match.index),
        type: typeNames ? typeNames[match[1]] || match[1] : match[1],
        value: quotedArgument(match[2]),
      });
    }
  }
  return records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const PRISMA_OPERATIONS = 'findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|create|createMany|createManyAndReturn|update|updateMany|updateManyAndReturn|upsert|delete|deleteMany|count|aggregate|groupBy';

/**
 * Prisma model access in production backend code: which file reads or writes which model. The middle
 * name must be a real model's delegate and the call a Prisma operation, so an arbitrary
 * `x.y.findMany(` is not mistaken for table access; the client variable itself varies (`this.prisma`,
 * `tx` inside a transaction, `p`, `client`). Specs are left out because their doubles would only
 * repeat the production edges.
 */
function prismaDataAccessInventory(root, backendFiles, prismaModels) {
  const delegates = new Map(prismaModels.map((model) => [model.name[0].toLowerCase() + model.name.slice(1), model.name]));
  const expression = new RegExp(`\\b(?:this\\.)?[A-Za-z_$][\\w$]*\\.([a-z][A-Za-z0-9]*)\\.(${PRISMA_OPERATIONS})\\s*\\(`, 'g');
  const records = [];
  for (const file of backendFiles.filter((item) => item.endsWith('.ts') && !item.endsWith('.spec.ts'))) {
    const source = read(root, file);
    for (const match of source.matchAll(expression)) {
      const model = delegates.get(match[1]);
      if (model) records.push({ file, line: lineNumber(source, match.index), model, operation: match[2] });
    }
  }
  return records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/** Files that compose the whole application, so importing every feature from them is composition, not use. */
const COMPOSITION_ROOTS = new Set(['backend/src/app.module.ts', 'apps/mobile/App.tsx']);

/** What removes each kind of core-to-feature reference, by the checklist item that replaces it. */
const CORE_TO_FEATURE_RESOLUTION = {
  composition: 'Module and screen registry: core composes only active plugins (LC2-003, LC2-004, LC2-005)',
  navigation: 'Navigation registry built from plugin contributions (LC2-008, LC2-009)',
  link: 'Plugin navigation and dashboard contributions (LC2-008, LC2-011)',
  'api-call': 'Plugin dashboard and search contributions, or a published contract (LC2-011, LC2-012, LC4-009)',
  'ui-import': 'Plugin UI contributions rendered by the core shell instead of compiled imports (LC2-011, LC3-001)',
  import: 'Versioned contract or event instead of importing plugin code (LC4-009, LC4-010)',
  'data-access': 'Versioned contract or read model instead of reading plugin tables (LC4-009, LC4-012; LC0-003 for identity)',
  relation: 'Stable ID without a cross-namespace foreign key (migration plan 10.2; LC0-003 for identity)',
};

function groupBy(list, keyOf) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()];
}

/** Tarjan's algorithm: every group of owners that can reach one another, smallest cycle members sorted. */
function ownerCycles(nodes, pairs) {
  let counter = 0;
  const stack = [];
  const onStack = new Set();
  const order = new Map();
  const low = new Map();
  const cycles = [];
  const connect = (node) => {
    order.set(node, counter); low.set(node, counter); counter += 1;
    stack.push(node); onStack.add(node);
    for (const target of pairs.filter((pair) => pair.from === node).map((pair) => pair.to)) {
      if (!order.has(target)) { connect(target); low.set(node, Math.min(low.get(node), low.get(target))); }
      else if (onStack.has(target)) low.set(node, Math.min(low.get(node), order.get(target)));
    }
    if (low.get(node) !== order.get(node)) return;
    const members = [];
    let member;
    do { member = stack.pop(); onStack.delete(member); members.push(member); } while (member !== node);
    if (members.length > 1) cycles.push(members.sort());
  };
  for (const node of nodes) if (!order.has(node)) connect(node);
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * LC1-012: every reference that crosses from one owner to another, classified against the target
 * architecture. Core must not depend on a feature (lean-core plan section 5); a feature may depend on
 * core, and on another feature only when the manifest declares it (migration plan section 11) and then
 * through a contract; plugins must not form a cycle. The graph reads imports, Prisma model access,
 * Prisma foreign keys, API calls, page links, navigation entries and plugin SDK capabilities. Test
 * imports are kept visible as their own kind but never counted as findings.
 */
function dependencyInventory(inventory, manifest) {
  const { ownership } = inventory;
  const owners = (manifest && manifest.owners) || {};
  const kindOf = (owner) => (owners[owner] ? owners[owner].kind : 'unknown');
  const coreOwner = Object.keys(owners).find((id) => owners[id].kind === 'core') || null;
  const fileOwners = new Map(ownership.items.files.map((item) => [item.file, item.owner]));
  const modelOwners = new Map(ownership.items.models.map((item) => [item.model, item.owner]));
  const routeOwners = new Map(ownership.items.routes.map((item) => [item.route, item.owner]));
  const pages = ownership.items.pages.map((item) => ({ owner: item.owner, segments: item.route.split('/').filter(Boolean) }));

  // A reference from a mixed module to another owner of the same split plan disappears when that split
  // is carried out, so it is tagged with the plan rather than treated like any other dependency.
  const fileSplitPlans = new Map(ownership.items.files.filter((item) => item.splitPlan).map((item) => [item.file, item.splitPlan]));
  const splitPlans = (manifest && manifest.splitPlans) || {};
  const references = [];
  const add = (from, to, kind, source, target) => {
    if (!from || !to || from === to) return;
    const plan = fileSplitPlans.get(source.replace(/:\d+$/, ''));
    const withinSplit = plan && (splitPlans[plan]?.owners || []).includes(to) ? plan : null;
    references.push({ from, to, kind, source, target, ...(withinSplit ? { splitPlan: withinSplit } : {}) });
  };
  const isTest = (file) => /\.(spec|test)\.[jt]sx?$/.test(file) || /(^|\/)(e2e|test|tests|__mocks__)\//.test(file);
  // Frontend and mobile imports are compiled UI, which core replaces with rendered plugin contributions.
  const importKind = (file) => {
    if (COMPOSITION_ROOTS.has(file)) return 'composition';
    if (isTest(file)) return 'test-import';
    return /^(frontend|apps\/mobile)\//.test(file) ? 'ui-import' : 'import';
  };

  for (const entry of [...inventory.frontendImports, ...inventory.sourceImports]) {
    if (!entry.resolved) continue;
    add(fileOwners.get(entry.file), fileOwners.get(entry.resolved), importKind(entry.file), `${entry.file}:${entry.line}`, entry.resolved);
  }
  for (const entry of inventory.prismaDataAccess) {
    add(fileOwners.get(entry.file), modelOwners.get(entry.model), 'data-access', `${entry.file}:${entry.line}`, `${entry.model}.${entry.operation}`);
  }
  // The model holding the foreign key depends on the model it points at; list-side back relations add nothing.
  for (const model of inventory.prismaModels) {
    for (const field of model.fields) {
      if (!field.relation || !/\bfields\s*:/.test(field.attributes)) continue;
      const target = field.type.replace(/[?[\]]/g, '');
      add(modelOwners.get(model.name), modelOwners.get(target), 'relation', `${model.name}.${field.name}`, target);
    }
  }
  for (const consumer of inventory.apiConsumers) {
    const targets = new Map();
    for (const route of consumer.matchedRoutes) if (!targets.has(routeOwners.get(route))) targets.set(routeOwners.get(route), route);
    for (const [to, route] of targets) add(fileOwners.get(consumer.file), to, 'api-call', `${consumer.file}:${consumer.line}`, route);
  }

  // A link resolves only when every page it could reach has the same owner.
  const pageMatches = (pattern, actual) => {
    for (let index = 0; index < pattern.length; index += 1) {
      const segment = pattern[index];
      if (/^\[\[\.\.\..+\]\]$/.test(segment)) return true;
      if (/^\[\.\.\..+\]$/.test(segment)) return actual.length > index;
      if (index >= actual.length) return false;
      if (segment.startsWith('[') || actual[index] === ':dynamic') continue;
      if (segment !== actual[index]) return false;
    }
    return pattern.length === actual.length;
  };
  let unresolvedLinks = 0;
  for (const link of inventory.frontendDeepLinks) {
    const target = link.expression.split(/[?#]/)[0];
    if (!target.startsWith('/') || target.startsWith('/api/')) continue;
    const segments = target.split('/').filter(Boolean);
    const reached = [...new Set(pages.filter((page) => pageMatches(page.segments, segments)).map((page) => page.owner))];
    if (reached.length !== 1) { unresolvedLinks += 1; continue; }
    add(fileOwners.get(link.file), reached[0], 'link', `${link.file}:${link.line}`, target);
  }
  inventory.navigation.forEach((entry, index) => {
    add(fileOwners.get(entry.file), ownership.items.navigation[index].owner, 'navigation', `${entry.file}:${entry.line}`, entry.href);
  });
  // The target direction: a plugin reaches core only through the SDK capabilities its manifest declares.
  inventory.officialPlugins.forEach((plugin, index) => {
    for (const capability of plugin.capabilities || []) add(ownership.items.officialPlugins[index].owner, coreOwner, 'sdk-capability', plugin.manifest, capability);
  });

  references.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)
    || a.source.localeCompare(b.source, undefined, { numeric: true }) || a.target.localeCompare(b.target));

  const declaredAs = (from, to) => {
    if ((owners[from]?.dependsOn || []).includes(to)) return 'required';
    if ((owners[from]?.optionalDependsOn || []).includes(to)) return 'optional';
    return null;
  };
  const classify = (from, to) => {
    if (kindOf(from) === 'central-service' || kindOf(to) === 'central-service') return 'control-plane';
    if (kindOf(from) === 'core') return 'core-to-feature';
    if (kindOf(to) === 'core') return 'feature-to-core';
    const declared = declaredAs(from, to);
    if (declared === 'required') return 'declared-dependency';
    if (declared === 'optional') return 'declared-optional-dependency';
    return 'undeclared-dependency';
  };
  const examples = (refs) => refs.slice(0, 5).map((ref) => `${ref.source} -> ${ref.target}`);

  const ownerEdges = groupBy(references, (ref) => `${ref.from} ${ref.to}`).map((refs) => ({
    from: refs[0].from, to: refs[0].to, classification: classify(refs[0].from, refs[0].to), references: refs.length, byKind: tally(refs.map((ref) => ref.kind)),
  }));
  const production = references.filter((ref) => ref.kind !== 'test-import');
  const withinSplit = (refs) => refs.filter((ref) => ref.splitPlan).length;
  const coreToFeature = groupBy(production.filter((ref) => classify(ref.from, ref.to) === 'core-to-feature'), (ref) => `${ref.to} ${ref.kind}`)
    .map((refs) => ({
      to: refs[0].to, kind: refs[0].kind, references: refs.length, withinSplitPlan: withinSplit(refs),
      resolution: CORE_TO_FEATURE_RESOLUTION[refs[0].kind] || null, examples: examples(refs),
    }))
    .sort((a, b) => a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind));
  const featureReferences = production.filter((ref) => kindOf(ref.from) === 'official-plugin' && kindOf(ref.to) === 'official-plugin');
  const featurePairs = groupBy(featureReferences, (ref) => `${ref.from} ${ref.to}`)
    .map((refs) => ({
      from: refs[0].from, to: refs[0].to, declared: declaredAs(refs[0].from, refs[0].to), references: refs.length,
      withinSplitPlan: withinSplit(refs), byKind: tally(refs.map((ref) => ref.kind)), examples: examples(refs),
    }));
  const declaredUnused = Object.entries(owners).sort(([a], [b]) => a.localeCompare(b)).flatMap(([from, owner]) => [
    ...(owner.dependsOn || []).map((to) => ({ from, to, declared: 'required' })),
    ...(owner.optionalDependsOn || []).map((to) => ({ from, to, declared: 'optional' })),
  ]).filter((entry) => !featurePairs.some((pair) => pair.from === entry.from && pair.to === entry.to));
  const featureOwners = Object.keys(owners).filter((id) => owners[id].kind === 'official-plugin').sort();

  const undeclared = featurePairs.filter((pair) => !pair.declared);
  // Cycles are judged on what remains once the splits are carried out: a reference a split plan removes
  // is not a dependency the target architecture has to break.
  const cyclePairs = groupBy(featureReferences.filter((ref) => !ref.splitPlan), (ref) => `${ref.from} ${ref.to}`)
    .map((refs) => ({ from: refs[0].from, to: refs[0].to }));
  const featureCycles = ownerCycles(featureOwners, cyclePairs);
  return {
    status: 'current-state',
    rules: 'Owners and declared plugin dependencies come from docs/architecture/ownership-manifest.json.',
    cycleBasis: 'Production references between plugins, excluding references that a split plan removes.',
    summary: {
      crossOwnerReferences: references.length,
      productionReferences: production.length,
      withinSplitPlanReferences: withinSplit(production),
      ownerPairs: ownerEdges.length,
      coreToFeatureReferences: coreToFeature.reduce((sum, group) => sum + group.references, 0),
      undeclaredFeatureDependencies: undeclared.length,
      featureCycles: featureCycles.length,
      unresolvedLinks,
    },
    ownerEdges,
    coreToFeature,
    featureToFeature: featurePairs.map(({ examples: _examples, ...pair }) => pair),
    undeclared,
    declaredUnused,
    featureCycles,
    references,
  };
}

const dataClassificationPath = 'docs/architecture/data-classification.json';
const DATA_CATEGORIES = ['child', 'credential', 'financial', 'location', 'personal'];
const DATA_TIERS = [2, 3, 4, 'unbounded', 'inherits', 'business'];
const PERSONAL_TIERS = [2, 3, 'unbounded', 'inherits'];
/** Field names that usually carry sensitive data: each such field must be classified, or reviewed as not sensitive. */
const SENSITIVE_FIELD_NAME = /(password|passwd|token|secret|hash|signature|apikey|privatekey|email|phone|address|photo|avatar|birth|nationalid|passport|latitude|longitude|location|salary|amount|price|discount|balance|bank|iban|^ip$|useragent|qrcode|qrvalue|checkincode)/i;

function loadDataClassification(root) {
  const file = path.join(root, ...dataClassificationPath.split('/'));
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * Where school data can leave the installation: outbound HTTP calls and object-storage clients in the
 * backend and in the web app's server-side route handlers. A `fetch(` inside a comment is not a call;
 * `//` counts as a comment only at the start of a line or after whitespace, so a URL does not hide one.
 */
function outboundCallInventory(root, files) {
  const records = [];
  for (const file of files.filter((item) => /\.(ts|tsx|js)$/.test(item) && !/\.(spec|test)\.[jt]sx?$/.test(item))) {
    const source = read(root, file);
    for (const match of source.matchAll(/\bfetch\s*\(|\bnew\s+S3Client\s*\(/g)) {
      const before = source.slice(source.lastIndexOf('\n', match.index) + 1, match.index);
      if (/(^|\s)\/\//.test(before) || /^\s*(\*|\/\*)/.test(before)) continue;
      records.push({ file, line: lineNumber(source, match.index), kind: match[0].startsWith('fetch') ? 'http' : 'object-storage' });
    }
  }
  return records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

/**
 * LC1-013: personal, child, financial, credential and location data, from the machine-checked
 * companion of data-classification.md (A-002). Every model must be classified, a field whose name
 * suggests sensitive data must be classified or reviewed, student-linked records must come out as
 * child data, and every outbound call or external notification channel must reach a declared
 * destination. The per-owner rollup is what each future plugin declares under lean-core plan 12.11.
 */
function dataClassificationInventory(inventory, classification) {
  const errors = [];
  const gaps = [];
  if (!classification) errors.push(`Data classification is missing: ${dataClassificationPath}`);
  const source = classification || {};
  const subjects = source.subjects || {};
  const destinations = source.destinations || {};
  const entries = source.models || {};
  const modelOwners = new Map(inventory.ownership.items.models.map((item) => [item.model, item.owner]));
  const fileOwners = new Map(inventory.ownership.items.files.map((item) => [item.file, item.owner]));
  const modelNames = new Set(inventory.prismaModels.map((model) => model.name));
  for (const name of Object.keys(entries)) if (!modelNames.has(name)) errors.push(`models.${name}: no such Prisma model`);

  const models = inventory.prismaModels.map((model) => {
    const owner = modelOwners.get(model.name) || 'unclassified';
    const entry = entries[model.name];
    if (!entry) {
      gaps.push({ category: 'models', key: model.name, reason: 'model is not classified' });
      return { model: model.name, owner, subjects: [], categories: [], fields: [] };
    }
    const where = `models.${model.name}`;
    const fieldNames = new Set(model.fields.map((field) => field.name));
    const fields = Object.entries(entry.fields || {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, field]) => {
      if (!fieldNames.has(name)) errors.push(`${where}.fields.${name}: no such field`);
      if (!DATA_TIERS.includes(field.tier)) errors.push(`${where}.fields.${name}: unknown tier ${field.tier}`);
      for (const category of field.categories || []) if (!DATA_CATEGORIES.includes(category)) errors.push(`${where}.fields.${name}: unknown category ${category}`);
      return { field: name, tier: field.tier, categories: [...(field.categories || [])].sort(), ...(field.thirdParty ? { thirdParty: [...field.thirdParty].sort() } : {}) };
    });
    for (const name of Object.keys(entry.unflagged || {})) if (!fieldNames.has(name)) errors.push(`${where}.unflagged.${name}: no such field`);
    for (const subject of entry.subjects || []) if (!subjects[subject]) errors.push(`${where}: unknown subject ${subject}`);

    // Drift guard for A-002's change rule: a new field that looks sensitive cannot slip in unclassified.
    for (const field of model.fields) {
      if (modelNames.has(field.type.replace(/[?[\]]/g, '')) || /^Boolean/.test(field.type) || /(Id|At)$/.test(field.name)) continue;
      if (!SENSITIVE_FIELD_NAME.test(field.name) || (entry.fields || {})[field.name] || (entry.unflagged || {})[field.name]) continue;
      gaps.push({ category: 'fields', key: `${model.name}.${field.name}`, reason: 'looks sensitive but is neither classified nor reviewed as not sensitive' });
    }

    const modelSubjects = [...(entry.subjects || [])].sort();
    const categories = new Set(fields.flatMap((field) => field.categories));
    if (modelSubjects.length || fields.some((field) => PERSONAL_TIERS.includes(field.tier))) categories.add('personal');
    if (modelSubjects.some((subject) => subjects[subject] && subjects[subject].child)) categories.add('child');
    const studentLinked = model.name === 'Student' || fieldNames.has('studentId')
      || model.fields.some((field) => field.type.replace(/[?[\]]/g, '') === 'Student' && /\bfields\s*:/.test(field.attributes));
    if (studentLinked && !categories.has('child')) errors.push(`${where}: holds student-linked records but is not classified as child data`);
    return { model: model.name, owner, subjects: modelSubjects, categories: [...categories].sort(), fields };
  });

  const outboundRules = (source.outbound || []).map((rule, index) => {
    const id = `outbound[${index}]`;
    let regex = null;
    try { regex = new RegExp(rule.match); } catch (error) { errors.push(`${id}: invalid pattern: ${error.message}`); }
    if (!destinations[rule.destination]) errors.push(`${id}: unknown destination ${rule.destination}`);
    return { ...rule, id, regex, used: 0 };
  });
  const channels = source.notificationChannels || {};
  for (const [channel, destination] of Object.entries(channels)) {
    if (destination !== null && !destinations[destination]) errors.push(`notificationChannels.${channel}: unknown destination ${destination}`);
  }
  const flows = [];
  for (const call of inventory.outboundCalls) {
    const rule = outboundRules.find((candidate) => candidate.regex && candidate.regex.test(call.file));
    if (!rule) { gaps.push({ category: 'flows', key: `${call.file}:${call.line}`, reason: 'outbound call has no declared destination' }); continue; }
    rule.used += 1;
    flows.push({ destination: rule.destination, owner: fileOwners.get(call.file) || 'unclassified', source: `${call.file}:${call.line}`, via: call.kind });
  }
  for (const delivery of inventory.notifications.deliveries) {
    if (/\.(spec|test)\.[jt]sx?$/.test(delivery.file)) continue;
    if (!(delivery.channel in channels)) {
      gaps.push({ category: 'flows', key: `${delivery.file}:${delivery.line}`, reason: `notification channel ${delivery.channel} has no declared destination` });
      continue;
    }
    if (channels[delivery.channel] === null) continue; // in-app notifications stay inside the school
    flows.push({ destination: channels[delivery.channel], owner: fileOwners.get(delivery.file) || 'unclassified', source: `${delivery.file}:${delivery.line}`, via: delivery.channel });
  }
  flows.sort((a, b) => a.destination.localeCompare(b.destination) || a.source.localeCompare(b.source, undefined, { numeric: true }));

  const externalFlows = Object.entries(destinations).sort(([a], [b]) => a.localeCompare(b)).map(([id, destination]) => {
    const references = flows.filter((flow) => flow.destination === id);
    return {
      destination: id, name: destination.name, external: destination.external !== false, data: destination.data || null,
      categories: [...(destination.categories || [])].sort(), references: references.length,
      owners: tally(references.map((flow) => flow.owner)), examples: references.slice(0, 5).map((flow) => flow.source),
    };
  });
  const unusedRules = [
    ...outboundRules.filter((rule) => rule.used === 0).map((rule) => ({ rule: rule.id, match: rule.match })),
    ...externalFlows.filter((flow) => flow.references === 0).map((flow) => ({ rule: `destinations.${flow.destination}`, match: null })),
  ];

  const buckets = {};
  const bucket = (owner) => (buckets[owner] ||= { categories: new Set(), subjects: new Set(), modelsByCategory: {}, classifiedFields: 0, externalDestinations: new Set() });
  for (const model of models) {
    const entry = bucket(model.owner);
    model.subjects.forEach((subject) => entry.subjects.add(subject));
    model.categories.forEach((category) => { entry.categories.add(category); (entry.modelsByCategory[category] ||= []).push(model.model); });
    entry.classifiedFields += model.fields.length;
  }
  for (const flow of flows) if (destinations[flow.destination] && destinations[flow.destination].external !== false) bucket(flow.owner).externalDestinations.add(flow.destination);
  const byOwner = Object.fromEntries(Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([owner, entry]) => [owner, {
    categories: [...entry.categories].sort(),
    subjects: [...entry.subjects].sort(),
    modelsByCategory: Object.fromEntries(Object.entries(entry.modelsByCategory).sort(([a], [b]) => a.localeCompare(b)).map(([category, list]) => [category, list.sort()])),
    classifiedFields: entry.classifiedFields,
    externalDestinations: [...entry.externalDestinations].sort(),
  }]));

  const allFields = models.flatMap((model) => model.fields);
  return {
    status: source.status || 'missing-manifest',
    manifest: dataClassificationPath,
    source: source.source || null,
    summary: {
      models: models.length,
      classifiedModels: models.filter((model) => entries[model.model]).length,
      classifiedFields: allFields.length,
      thirdPartyFields: allFields.filter((field) => field.thirdParty).length,
      modelsByCategory: Object.fromEntries(DATA_CATEGORIES.map((category) => [category, models.filter((model) => model.categories.includes(category)).length])),
      fieldsByTier: tally(allFields.map((field) => String(field.tier))),
      externalDestinations: externalFlows.filter((flow) => flow.external && flow.references > 0).length,
      gaps: gaps.length,
      errors: errors.length,
      unusedRules: unusedRules.length,
    },
    byOwner,
    externalFlows,
    gaps,
    errors,
    unusedRules,
    models,
    flows,
  };
}

/** The kinds of item an unowned file can hold, in the order the gate lists them. */
const GATE_FILE_LABELS = [
  ['modules', 'Nest module'], ['controllers', 'controller'], ['routes', 'route'], ['scheduledJobs', 'scheduled job'],
  ['websocketGateways', 'WebSocket gateway'], ['pluginJobs', 'plugin job'], ['frontendApiProxies', 'API proxy'],
];

function counted(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function joinParts(parts) {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * LC1-014: the CI gate. It fails when something discovered has no owner or no data classification, or
 * when either manifest has an error or a stale entry -- when an item is new and unreviewed, not merely
 * changed. Problems are grouped by what to fix and name the file to edit, so a failed pull request says
 * what to do instead of printing an assertion diff.
 */
function gateReport(inventory) {
  const { ownership, dataClassification: data } = inventory;
  const errors = [...ownership.errors, ...data.errors];
  const stale = [...ownership.unusedRules, ...data.unusedRules].map((entry) => (entry.match ? `${entry.rule} (${entry.match})` : entry.rule));
  if (!ownership.gaps.length && !data.gaps.length && !errors.length && !stale.length) {
    return {
      ok: true,
      summary: 'no problems',
      lines: [`Architecture gate passed: ${counted(ownership.summary.items, 'discovered item')} owned and ${counted(data.summary.models, 'model')} classified.`],
    };
  }

  // A page's own file is fixed by its page rule, so it is not listed again as a file.
  const pageFiles = new Set(ownership.gaps.filter((gap) => gap.category === 'pages' && gap.file).map((gap) => gap.file));
  const files = new Map();
  const pages = new Set();
  const models = [];
  const shared = [];
  const mobile = [];
  for (const gap of ownership.gaps) {
    if (gap.category === 'models') models.push(gap.key);
    else if (gap.category === 'pages') pages.add(gap.key);
    else if (gap.category === 'navigation') pages.add(gap.key.slice(gap.key.indexOf(' ') + 1).split(/[?#]/)[0]);
    else if (gap.category === 'mobileConfiguration') mobile.push(gap.key);
    else if (gap.importerOwners) shared.push(`${gap.key}: imported by ${gap.importerOwners.join(', ')}`);
    else {
      const file = gap.file || gap.key.split('#')[0];
      if (pageFiles.has(file)) continue;
      if (!files.has(file)) files.set(file, []);
      files.get(file).push(gap.category);
    }
  }
  const describeFile = ([file, categories]) => {
    const kinds = GATE_FILE_LABELS
      .map(([category, label]) => [label, categories.filter((entry) => entry === category).length])
      .filter(([, count]) => count > 0)
      .map(([label, count]) => (count === 1 ? label : `${count} ${label}s`));
    return kinds.length ? `${file} (${kinds.join(', ')})` : file;
  };

  const parts = [];
  if (ownership.gaps.length) parts.push(counted(ownership.gaps.length, 'ownership gap'));
  if (data.gaps.length) parts.push(counted(data.gaps.length, 'data-classification gap'));
  if (errors.length) parts.push(counted(errors.length, 'manifest error'));
  if (stale.length) parts.push(counted(stale.length, 'stale manifest entry', 'stale manifest entries'));
  const summary = joinParts(parts);
  const lines = [`Architecture gate failed: ${summary}.`];
  const section = (title, entries) => { if (entries.length) lines.push('', title, ...entries.map((entry) => `  - ${entry}`)); };
  const dataGaps = (category) => data.gaps.filter((gap) => gap.category === category).map((gap) => gap.key);
  section(`Files with no owner. Add a "files" rule to ${ownershipManifestPath}:`, [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(describeFile));
  section(`Components shared by several owners. Give each one an explicit "files" rule in ${ownershipManifestPath}:`, shared.sort());
  section(`Pages with no owner. Add a "pages" rule to ${ownershipManifestPath}:`, [...pages].sort());
  section(`Models with no owner. Add them to "models" in ${ownershipManifestPath}:`, models.sort());
  section(`Mobile configuration with no owner. Set "mobileConfigurationOwner" in ${ownershipManifestPath}:`, mobile.sort());
  section(`Models with no data classification. Add them to "models" in ${dataClassificationPath}:`, dataGaps('models').sort());
  section('Fields that look sensitive but are not reviewed. Classify them under the model\'s "fields", or add them to "unflagged" with the reason:', dataGaps('fields').sort());
  section(`Outbound flows with no destination. Add an "outbound" rule or a "notificationChannels" entry to ${dataClassificationPath}:`, dataGaps('flows'));
  section('Manifest errors:', errors);
  section('Stale manifest entries that match nothing. Remove or correct them:', stale);
  lines.push(
    '',
    'Then run `npm run architecture:inventory:write` and commit the manifests with the regenerated snapshot.',
    'Owners follow docs/architecture/module-to-plugin-migration-plan.md; data tiers follow docs/architecture/data-classification.md.',
  );
  return { ok: false, summary, lines };
}

function buildInventory(root = repositoryRoot) {
  const backendFiles = walk(root, path.join(root, 'backend/src'));
  const frontendFiles = walk(root, path.join(root, 'frontend'));
  const appFiles = walk(root, path.join(root, 'apps'));
  const pluginFiles = walk(root, path.join(root, 'plugins'));
  const backendScriptFiles = walk(root, path.join(root, 'backend/scripts'));
  const moduleFiles = backendFiles.filter((file) => file.endsWith('.module.ts'));
  const controllerFiles = backendFiles.filter((file) => file.endsWith('.controller.ts'));
  const sourceFiles = backendFiles.filter((file) => file.endsWith('.ts'));
  const prismaPath = 'backend/prisma/schema.prisma';
  const prisma = fs.existsSync(path.join(root, prismaPath)) ? read(root, prismaPath) : '';

  const nestModules = moduleFiles.map((file) => ({
    file,
    rootComposition: file === 'backend/src/app.module.ts',
  }));

  const prismaModels = prismaModelInventory(prisma);

  const { controllers, routes: httpRoutes } = controllerInventory(root, controllerFiles);

  const frontendPages = frontendFiles
    .filter((file) => file.startsWith('frontend/app/') && file.endsWith('/page.tsx'))
    .map((file) => ({ file, route: `/${file.slice('frontend/app/'.length, -'/page.tsx'.length)}`.replace('/page', '/') }))
    .map((entry) => ({ ...entry, route: entry.route === '/' ? '/' : entry.route.replace(/\/$/, '') }));

  const navigation = navigationInventory(root, frontendFiles);
  const apiConsumers = apiConsumerInventory(root, [...frontendFiles, ...appFiles], httpRoutes);
  const frontendImports = frontendImportInventory(root, frontendFiles);
  // The same relative-import scanner, run over the backend, the school mobile app and official
  // plugins: LC1-012 needs their edges too. Specs are kept here and classified as test imports later.
  const sourceImports = frontendImportInventory(root, [...backendFiles, ...appFiles.filter((file) => file.startsWith('apps/mobile/')), ...pluginFiles]);
  const prismaDataAccess = prismaDataAccessInventory(root, backendFiles, prismaModels);
  // Where school data can leave the installation: backend code and the web app's server-side proxies.
  const outboundCalls = outboundCallInventory(root, [...backendFiles, ...frontendFiles.filter((file) => /^frontend\/app\/api\/.*\/route\.ts$/.test(file))]);
  const sharedComponents = sharedComponentInventory(frontendFiles, frontendImports);
  const frontendApiProxies = frontendProxyInventory(root, [...frontendFiles, ...appFiles]);
  const frontendDeepLinks = deepLinkInventory(root, frontendFiles);

  const scheduledJobs = scheduledJobInventory(root, sourceFiles);
  const websocketGateways = websocketGatewayInventory(root, sourceFiles);
  const pluginJobRegistrations = pluginJobInventory(root, pluginFiles);
  const fileStorage = fileStorageInventory(root, [...backendFiles, ...backendScriptFiles, ...frontendFiles, ...pluginFiles]);
  const notifications = notificationInventory(root, [...backendFiles, ...frontendFiles, ...appFiles, ...pluginFiles], apiConsumers, scheduledJobs);
  const reports = reportInventory(root, [...backendFiles, ...frontendFiles, ...appFiles, ...pluginFiles], frontendPages, httpRoutes, apiConsumers, fileStorage);
  const mobile = mobileInventory(root, appFiles, apiConsumers);

  const pluginRoot = path.join(root, 'plugins');
  // Official plugins keep their manifest in plugin.json (plugins/announcements); manifest.json is
  // also accepted. Recording the declared id is what lets ownership name the existing plugin, and
  // the declared capabilities are the plugin-to-core edges of the target architecture.
  const officialPlugins = fs.existsSync(pluginRoot)
    ? fs.readdirSync(pluginRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const manifestName = ['plugin.json', 'manifest.json'].find((name) => fs.existsSync(path.join(pluginRoot, entry.name, name)));
        const manifest = manifestName ? `plugins/${entry.name}/${manifestName}` : null;
        const document = manifest ? JSON.parse(read(root, manifest)) : {};
        return {
          directory: `plugins/${entry.name}`, manifest, pluginId: document.id || null, version: document.version || null,
          capabilities: [...(document.capabilities || [])].sort(), dependencies: document.dependencies || {},
        };
      })
    : [];

  const inventory = {
    schemaVersion: 12,
    counts: {
      nestFeatureModules: nestModules.filter((entry) => !entry.rootComposition).length,
      prismaModels: prismaModels.length,
      prismaRelationFields: prismaModels.reduce((sum, model) => sum + model.fields.filter((field) => field.relation).length, 0),
      prismaIndexes: prismaModels.reduce((sum, model) => sum + model.indexes.length, 0),
      controllers: controllers.length,
      httpRouteDecorators: httpRoutes.length,
      apiConsumerCalls: apiConsumers.length,
      matchedApiConsumerCalls: apiConsumers.filter((consumer) => consumer.matchedRoutes.length > 0).length,
      dynamicOrExternalApiConsumerCalls: apiConsumers.filter((consumer) => consumer.normalizedPath === null).length,
      unmatchedStaticSchoolApiConsumerCalls: apiConsumers.filter((consumer) => consumer.target === 'school-api' && consumer.matchedRoutes.length === 0).length,
      frontendPages: frontendPages.length,
      frontendApiProxies: frontendApiProxies.length,
      frontendImports: frontendImports.length,
      sharedComponents: sharedComponents.length,
      frontendDeepLinks: frontendDeepLinks.length,
      navigationEntries: navigation.length,
      scheduledJobDecorators: scheduledJobs.length,
      websocketGateways: websocketGateways.length,
      websocketSubscribedEvents: websocketGateways.reduce((sum, gateway) => sum + gateway.subscriptions.length, 0),
      pluginJobRegistrations: pluginJobRegistrations.length,
      uploadHandlers: fileStorage.uploadHandlers.length,
      frontendFileInputs: fileStorage.frontendFileInputs.length,
      downloadAndDocumentSites: fileStorage.downloadAndDocumentSites.length,
      filesystemOperations: fileStorage.filesystemOperations.length,
      storageConfigurationReferences: fileStorage.storageConfiguration.length,
      pluginStorageCalls: fileStorage.pluginStorageCalls.length,
      notificationDeliveries: notifications.deliveries.length,
      notificationDatabaseWrites: notifications.databaseWrites.length,
      notificationRecipientResolutionCalls: notifications.recipientResolution.length,
      notificationPreferenceAccesses: notifications.preferenceAccess.length,
      notificationQuotaReferences: notifications.quotaControls.length,
      notificationApiConsumerCalls: notifications.notificationApiConsumers.length,
      notificationDigestJobs: notifications.digestJobs.length,
      reportFiles: reports.reportFiles.length,
      reportPages: reports.reportPages.length,
      reportRoutes: reports.reportRoutes.length,
      reportApiConsumerCalls: reports.reportApiConsumers.length,
      reportFilters: reports.filters.length,
      reportCalculations: reports.calculations.length,
      reportExportSites: reports.exportSites.length,
      printViews: reports.printViews.length,
      mobileScreens: mobile.screens.length,
      mobileNavigationRegistrations: mobile.navigationRegistrations.length,
      mobileApiDependencies: mobile.mobileApiConsumers.length,
      mobileSecureStorageCalls: mobile.secureStorage.length,
      mobileOfflineAndNetworkSignals: mobile.offlineAndNetworkBehavior.length,
      mobileNativeCapabilityReferences: mobile.nativeCapabilities.length,
      mobileConfiguredPlugins: mobile.configuredPlugins.length,
      mobileConfiguredPermissions: mobile.configuredPermissions.length,
      mobilePackageDependencies: mobile.dependencies.length,
      officialPlugins: officialPlugins.length,
      sourceImports: sourceImports.length,
      prismaDataAccesses: prismaDataAccess.length,
      outboundCalls: outboundCalls.length,
    },
    nestModules,
    prismaModels,
    prismaDataAccess,
    outboundCalls,
    controllers,
    httpRoutes,
    apiConsumers,
    frontendPages,
    frontendApiProxies,
    frontendImports,
    sourceImports,
    sharedComponents,
    frontendDeepLinks,
    navigation,
    scheduledJobs,
    websocketGateways,
    pluginJobRegistrations,
    fileStorage,
    notifications,
    reports,
    mobile,
    officialPlugins,
  };
  // Ownership and dependencies stay out of `counts`: those are the scanners' structural totals, and
  // each has its own summary. The dependency graph needs every endpoint owned first.
  const ownershipManifest = loadOwnershipManifest(root);
  inventory.ownership = ownershipInventory(inventory, ownershipManifest);
  inventory.dependencies = dependencyInventory(inventory, ownershipManifest);
  inventory.dataClassification = dataClassificationInventory(inventory, loadDataClassification(root));
  return inventory;
}

function serialized(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function writeSnapshot(inventory = buildInventory()) {
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(snapshotPath, serialized(inventory));
  return snapshotPath;
}

function checkSnapshot(inventory = buildInventory()) {
  if (!fs.existsSync(snapshotPath)) throw new Error(`Architecture inventory snapshot is missing: ${relative(repositoryRoot, snapshotPath)}`);
  const expected = fs.readFileSync(snapshotPath, 'utf8').replace(/\r\n/g, '\n');
  const actual = serialized(inventory);
  if (expected !== actual) {
    // Say whether the change is only waiting for review, or whether the gate has to be fixed first.
    const gate = gateReport(inventory);
    throw new Error(gate.ok
      ? 'Architecture inventory drift detected. Everything is owned and classified: review the change, then run `npm run architecture:inventory:write` and commit the updated snapshot.'
      : `Architecture inventory drift detected. The gate also fails (${gate.summary}): run \`npm run architecture:inventory:gate\` to see what to fix before regenerating the snapshot.`);
  }
  return inventory;
}

if (require.main === module) {
  const command = process.argv[2] || '--summary';
  if (command === '--write') {
    const inventory = buildInventory();
    const output = writeSnapshot(inventory);
    process.stdout.write(`Architecture inventory written to ${relative(repositoryRoot, output)}\n`);
    // Writing still succeeds, but a snapshot that CI will reject should not look finished.
    const gate = gateReport(inventory);
    if (!gate.ok) {
      process.stderr.write(`${gate.lines.join('\n')}\n\nThe snapshot was written, but CI will fail until these are fixed.\n`);
      process.exitCode = 1;
    }
  } else if (command === '--check') {
    const inventory = checkSnapshot();
    process.stdout.write(`Architecture inventory is current: ${JSON.stringify(inventory.counts)}\n`);
  } else if (command === '--gate') {
    // LC1-014: fails only when something is new and unreviewed, and lists what to fix.
    const gate = gateReport(buildInventory());
    (gate.ok ? process.stdout : process.stderr).write(`${gate.lines.join('\n')}\n`);
    if (!gate.ok) process.exitCode = 1;
  } else if (command === '--summary') {
    process.stdout.write(`${JSON.stringify(buildInventory().counts, null, 2)}\n`);
  } else if (command === '--ownership') {
    // The reviewable view of LC1-011: totals per owner, provisional decisions, split plans and anything
    // still unowned. Exits non-zero while a gap, manifest error or stale rule remains.
    const { ownership } = buildInventory();
    const { items, recordOwners, ...review } = ownership;
    process.stdout.write(`${JSON.stringify(review, null, 2)}\n`);
    if (ownership.gaps.length || ownership.errors.length || ownership.unusedRules.length) process.exitCode = 1;
  } else {
    throw new Error(`Unknown argument: ${command}`);
  }
}

module.exports = { buildInventory, checkSnapshot, gateReport, serialized, writeSnapshot };
