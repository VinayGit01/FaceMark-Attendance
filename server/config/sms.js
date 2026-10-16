// Sends the OTP text message. Choose a provider with SMS_PROVIDER in .env:
//   console  -> prints the OTP in the server terminal (development)
//   webhook  -> POSTs to your workflow API (n8n / Make / Zapier / any HTTP endpoint) which sends the SMS
//   twilio   -> Twilio Programmable SMS (REST, no extra package)
async function sendSms(mobile, message, otp) {
  const provider = (process.env.SMS_PROVIDER || 'console').toLowerCase();

  if (provider === 'console') {
    console.log(`\n[SMS:console] to ${mobile}: ${message}\n`);
    return;
  }

  if (provider === 'webhook') {
    const url = process.env.WORKFLOW_WEBHOOK_URL;
    if (!url) throw new Error('WORKFLOW_WEBHOOK_URL is not set');
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.WORKFLOW_API_KEY) headers['x-api-key'] = process.env.WORKFLOW_API_KEY;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'password_reset_otp',
        app: 'FaceMark',
        mobile,
        otp,
        message,
        expiresInMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 5),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Workflow API responded ${res.status}`);
    return;
  }

  if (provider === 'twilio') {
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
    if (!sid || !token || !from) throw new Error('Twilio settings are incomplete');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: mobile, From: from, Body: message }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
    return;
  }

  throw new Error(`Unknown SMS_PROVIDER "${provider}"`);
}

module.exports = { sendSms };
