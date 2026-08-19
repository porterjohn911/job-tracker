// Main handler attachment orchestrator
// Generated from src/app/10-handlers-boot.js.

// Each area is wrapped on its own. These run in a row on every render, so
// without containment a throw in the first left the other seven unwired — most
// of the app inert, with nothing on screen saying why. That is exactly the
// shape of the bug that let a maintenance company see the Entities tab.
function attachHandlers(){
  const _a=(fn,where)=>{ if(typeof fn!=='function')return; (typeof jtTry==='function')?jtTry(fn,where):fn(); };
  _a(attachShellHandlers,'attachShellHandlers');
  _a(attachListInvoiceReportMapHandlers,'attachListInvoiceReportMapHandlers');
  _a(attachCalendarDetailHandlers,'attachCalendarDetailHandlers');
  _a(attachJobAssetHandlers,'attachJobAssetHandlers');
  _a(attachFinancialTeamTimeHandlers,'attachFinancialTeamTimeHandlers');
  _a(attachCustomerHandlers,'attachCustomerHandlers');
  // Gated rather than called unconditionally: attaching the contracts sync
  // listener for a company that does not use them, or for a worker, would earn
  // a permission-denied from Firebase on every load.
  if(typeof ctEnabled==='function'&&ctEnabled())_a(attachContractHandlers,'attachContractHandlers');
  if(typeof meEnabled==='function'&&meEnabled())_a(attachEntityHandlers,'attachEntityHandlers');
}
