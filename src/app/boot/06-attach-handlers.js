// Main handler attachment orchestrator
// Generated from src/app/10-handlers-boot.js.

function attachHandlers(){
  attachShellHandlers();
  attachListInvoiceReportMapHandlers();
  attachCalendarDetailHandlers();
  attachJobAssetHandlers();
  attachFinancialTeamTimeHandlers();
  attachCustomerHandlers();
  // Gated rather than called unconditionally: attaching the contracts sync
  // listener for a company that does not use them, or for a worker, would earn
  // a permission-denied from Firebase on every load.
  if(typeof ctEnabled==='function'&&ctEnabled()&&typeof attachContractHandlers==='function')attachContractHandlers();
  if(typeof meEnabled==='function'&&meEnabled()&&typeof attachEntityHandlers==='function')attachEntityHandlers();
}
