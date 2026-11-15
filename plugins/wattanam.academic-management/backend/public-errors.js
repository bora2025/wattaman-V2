'use strict';

// Academic Management's messages reach the user instead of "Internal server error".
//
// The core shows a plugin's error only when the route declares it in its contract (code → status and
// public message); anything else stays a private server error. Every route of this plugin is registered
// with the contract below, and a thrown Error whose message is one of the plugin's own messages
// (public-errors-table.js, generated from the source by tools/generate-academic-public-errors.js) is
// turned into that declared error. Messages with a value in them (a field, a subject, a number) are
// declared with their wording and `detail: true`, so a core that supports it shows the exact message.
// Database and other unexpected errors are not in the table and stay private.
const { STATIC, PATTERNS, ERRORS } = require('./public-errors-table');

const PASSTHROUGH = { parse: (value) => value };
const COMPILED = PATTERNS.map(([source, code]) => [new RegExp(source), code]);

function publicCode(message) {
  if (typeof message !== 'string' || !message) return null;
  if (Object.prototype.hasOwnProperty.call(STATIC, message)) return STATIC[message];
  const found = COMPILED.find(([pattern]) => pattern.test(message));
  return found ? found[1] : null;
}

function withPublicErrors(context) {
  const contractError = (code, message) => (context.errors && typeof context.errors.contract === 'function'
    ? context.errors.contract(code, message)
    : Object.assign(new Error(message || code), { code, isPluginContractError: true }));
  return {
    ...context,
    routes: {
      ...context.routes,
      register(definition) {
        if (!definition || definition.contract) return context.routes.register(definition);
        const handler = definition.handler;
        return context.routes.register({
          ...definition,
          contract: { version: '1.0', response: PASSTHROUGH, errors: ERRORS },
          handler: async (request) => {
            try {
              return await handler(request);
            } catch (error) {
              if (error && error.isPluginContractError) throw error;
              const code = error instanceof Error ? publicCode(error.message) : null;
              if (code) throw contractError(code, error.message);
              throw error;
            }
          },
        });
      },
    },
  };
}

module.exports = { withPublicErrors, publicCode };
