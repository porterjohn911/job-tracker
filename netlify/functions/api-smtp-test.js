// Agent/owner-facing SMTP connection test. Verifies that SMTP_USER / SMTP_PASS
// can actually authenticate against the mail server — WITHOUT sending any email
// (nodemailer's verify() opens the connection and logs in, nothing more).
//
//   GET /.netlify/functions/api-smtp-test
//   Authorization: Bearer sk_live_...   (scope invoices:send)
//
// Returns a clear diagnosis so "SMTP won't work" becomes an actionable message
// instead of a silent failure at send time. Exposed to agents as the MCP tool
// `test_email_connection`.

const { corsHeaders, jsonResponder, authenticateApiKey } = require('./_lib/apiKeyAuth');
const { smtpConfig, makeTransport, describeSmtpError } = require('./_lib/smtp');

exports.handler = async (event) => {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  const json = jsonResponder(origin);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders(origin), body: '{}' };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return json(405, { error: 'GET or POST only' });

  try {
    // Gate behind the same scope as real sending, so only keys trusted to email
    // can probe the mail credentials.
    const authed = await authenticateApiKey(event, 'invoices:send');
    if (authed.error) return json(authed.error.statusCode, { error: authed.error.message });

    const cfg = smtpConfig();
    if (!cfg) {
      return json(200, {
        ok: false,
        configured: false,
        error: 'Email is not set up: SMTP_USER and/or SMTP_PASS are missing in Netlify. '
          + 'Add them under Site configuration → Environment variables, then redeploy.',
      });
    }

    const transport = makeTransport();
    try {
      await transport.verify();
    } catch (e) {
      return json(200, {
        ok: false,
        configured: true,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user,
        error: describeSmtpError(e),
      });
    }

    return json(200, {
      ok: true,
      configured: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      message: 'SMTP authenticated successfully as ' + cfg.user + '. Email sending is ready.',
    });
  } catch (e) {
    console.error('[api-smtp-test] unhandled:', e && e.stack ? e.stack : e);
    return json(500, { error: 'Unexpected server error: ' + ((e && e.message) || 'unknown') });
  }
};
