// Managed entities — the feature gate.
//
// A management company's customers are not people who buy work; they are the
// businesses it runs. That is the thing that makes management genuinely
// different from maintenance, and until now nothing in the app said so — a
// management company got the maintenance build verbatim, day route and crew
// checklists included, because ctEnabled() covers both.
//
// This gate is narrower on purpose. Entities exist for management companies
// only, so a maintenance company keeps exactly what it has.
//
// Mirrors 00-contract-gate.js in shape: two independent questions, kept apart.
//
//   meCompanyManages() — is THIS COMPANY a management company?
//   meEnabled()        — and may THIS USER see it?
//
// An entity carries a fee, so it is financial data and follows the same
// manager/owner rule the contracts node uses. The client has to agree with
// database.rules.json or the sync listener earns a permission-denied on load.

function meCompanyManages(co) {
  const rec = co || (typeof ACTIVE_CO !== 'undefined' ? ACTIVE_CO : null);
  return !!(rec && rec.type === 'management');
}

function meEnabled() {
  if (!meCompanyManages()) return false;
  // Fails closed if the permission helper is missing rather than exposing fee
  // arrangements by default.
  return typeof canSeeFinancials === 'function' ? canSeeFinancials() : false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { meCompanyManages, meEnabled };
}
