'use strict';

// The platform error contract for every route of this plugin: { status, message, detail }.
// Handlers throw plain Errors with a readable message (kept for the existing tests and callers); the
// wrapper below gives each a code and status from its wording, so screens show the real reason instead
// of a server error. Errors already carrying a code (fail()) pass through unchanged.

const ERRORS = {
  INVALID_VALUE: { status: 400, message: 'A value is not valid', detail: true },
  FORBIDDEN: { status: 403, message: 'You may not do this', detail: true },
  NOT_FOUND: { status: 404, message: 'Not found', detail: true },
  CONFLICT: { status: 409, message: 'This cannot be done now', detail: true },
  TOO_LARGE: { status: 413, message: 'The file is too large', detail: true },
};
const CONTRACT = { version: '1.0', response: { parse: (value) => value }, errors: ERRORS };

const fail = (code, message) => Object.assign(new Error(message || ERRORS[code].message), { code, isPluginContractError: true });

function classify(message) {
  const text = String(message || '');
  if (/not found/i.test(text)) return 'NOT_FOUND';
  if (/^Only the exam creator|outside your assigned|does not belong|not available through the roster|not available through the core directory/i.test(text)) return 'FORBIDDEN';
  if (/Cannot transition|^Only (draft|a submitted|an in-progress)|already been submitted|awaiting manual grading|Maximum attempts|not currently active|has not started|has ended|not available$|unavailable before|already taken|must contain at least one question/i.test(text)) return 'CONFLICT';
  if (/too large|exceeds/i.test(text)) return 'TOO_LARGE';
  return 'INVALID_VALUE';
}

function contractError(error) {
  if (!error || error.isPluginContractError || !(error instanceof Error)) return error;
  // database and runtime failures stay server errors; only this plugin's own validation messages are mapped
  // (a TypeError or a driver error is a bug or an outage, not a validation message)
  if (error.constructor !== Error || (error.code && !ERRORS[error.code])) return error;
  return Object.assign(error, { code: classify(error.message), isPluginContractError: true });
}

/** The plugin context, with every registered route answering in the error contract. */
function withContract(context) {
  return {
    ...context,
    routes: {
      ...context.routes,
      register(definition) {
        const handler = definition.handler;
        return context.routes.register({
          contract: CONTRACT,
          ...definition,
          handler: async (request) => {
            try { return await handler(request); } catch (error) { throw contractError(error); }
          },
        });
      },
    },
  };
}

module.exports = { ERRORS, CONTRACT, fail, classify, withContract };
