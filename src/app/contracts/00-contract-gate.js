// Recurring contracts — the feature gate.
//
// This is the file that decides whether contracts exist at all for the company
// and person currently signed in. It is kept separate and tiny so the answer to
// "who can see this?" is one short file rather than a condition spread across
// the router, the nav and the boot code.
//
// Two independent questions, deliberately not merged:
//
//   ctCompanyUsesContracts() — does THIS COMPANY do recurring work?
//     Companies carry a type: project (the default and today's behavior),
//     maintenance (repeat visits and recurring billing) or management (billing
//     only — a retainer). A project company never sees any of this, which is
//     why every existing company is unaffected: absent type means project.
//
//   ctEnabled() — and may THIS USER see it?
//     Contracts turn into invoices, so database.rules.json gates the contracts
//     node to manager/owner, matching payrates. The client has to agree with
//     that: attaching the sync listener as a worker would earn a
//     permission-denied from Firebase on every load.

const CT_COMPANY_TYPES = ['project', 'maintenance', 'management'];

function ctCompanyUsesContracts(co) {
  const rec = co || (typeof ACTIVE_CO !== 'undefined' ? ACTIVE_CO : null);
  const type = rec && rec.type;
  return type === 'maintenance' || type === 'management';
}

function ctEnabled() {
  if (!ctCompanyUsesContracts()) return false;
  // Fail closed if the permission helper is somehow missing rather than
  // exposing contract amounts by default.
  return typeof canSeeFinancials === 'function' ? canSeeFinancials() : false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CT_COMPANY_TYPES, ctCompanyUsesContracts, ctEnabled };
}
