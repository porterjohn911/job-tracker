// Weekly financial report — Netlify Scheduled Function.
//
// Netlify cron is UTC-only and can't track US daylight saving, so the schedule
// in netlify.toml fires at BOTH 11:00 and 12:00 UTC on Fridays and this handler
// only proceeds when it is actually 7 AM on the US East Coast:
//   - EDT (summer, UTC-4): 11:00 UTC = 7 AM ET  -> runs; 12:00 UTC = 8 AM -> skips
//   - EST (winter, UTC-5): 12:00 UTC = 7 AM ET  -> runs; 11:00 UTC = 6 AM -> skips
// Net effect: exactly one 7 AM ET send every Friday, year-round.
//
// The actual work lives in _lib/weeklyReport.js (shared with the manual
// trigger, report-run.js).

const { generateAndSend } = require('./_lib/weeklyReport');

// Current hour (0-23) in America/New_York, DST-aware.
function easternHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === 'hour').value, 10);
}

const TARGET_ET_HOUR = 7;

exports.handler = async () => {
  try {
    const hr = easternHour();
    if (hr !== TARGET_ET_HOUR) {
      console.log(`[weekly-report] skipping — it is ${hr}:00 ET, not ${TARGET_ET_HOUR}:00.`);
      return { statusCode: 200, body: `Skipped: ${hr}:00 ET (target ${TARGET_ET_HOUR}:00).` };
    }
    const res = await generateAndSend();
    return { statusCode: 200, body: res.sent ? 'Weekly report sent.' : ('Computed but not emailed: ' + res.reason) };
  } catch (e) {
    console.error('[weekly-report] failed:', e && e.stack ? e.stack : e);
    return { statusCode: 500, body: 'Weekly report failed: ' + ((e && e.message) || 'unknown') };
  }
};
