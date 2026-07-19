// Manual trigger for the weekly financial report — for testing / on-demand.
//
//   GET|POST /.netlify/functions/report-run?token=YOUR_TOKEN
//
// Runs the same report as the Friday schedule, immediately (no 7 AM ET gate).
// Gated by a shared token so it can't be triggered by strangers. Set
// REPORT_TRIGGER_TOKEN in Netlify to any random string; pass it as ?token=.
// If REPORT_TRIGGER_TOKEN is unset, the manual trigger is disabled.

const { generateAndSend } = require('./_lib/weeklyReport');

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json' };
  const json = (statusCode, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '{}' };

  const expected = process.env.REPORT_TRIGGER_TOKEN;
  if (!expected) {
    return json(403, { error: 'Manual trigger is disabled — set REPORT_TRIGGER_TOKEN in Netlify to enable it.' });
  }
  const provided = (event.queryStringParameters && event.queryStringParameters.token) || '';
  if (provided !== expected) {
    return json(403, { error: 'Invalid or missing token' });
  }

  try {
    const res = await generateAndSend();
    return json(200, res);
  } catch (e) {
    console.error('[report-run] failed:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Report failed: ' + ((e && e.message) || 'unknown') });
  }
};
