import nodemailer from 'nodemailer';

let transporter = null;
let usingEthereal = false;

async function getTransport() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    console.log(`[mail] Using SMTP ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}`);
  } else {
    // Zero-config dev fallback: Ethereal test account. Emails are not delivered
    // to the real inbox, but the SMTP round-trip works and a preview URL is logged.
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    usingEthereal = true;
    console.log(`[mail] No SMTP_* env set — using Ethereal test account: ${testAccount.user}`);
  }
  return transporter;
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

function confirmationHtml(email, position) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You're on the RENiKA waitlist</title>
</head>
<body style="margin:0;padding:0;background:#071A20;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#071A20;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr>
          <td style="padding:36px 32px;background:#0F2A33;border:1px solid #1E4450;border-radius:20px;font-family:'Bricolage Grotesque',system-ui,-apple-system,'Segoe UI',sans-serif;">
            <div style="font-size:34px;font-weight:800;letter-spacing:0.06em;color:#E4EFEC;">RENI<span style="color:#F26B7A;">K</span>A</div>
            <p style="font-size:15px;color:#8FB0B0;margin:8px 0 28px;">Where renal evidence meets practice.</p>
            <p style="font-size:17px;color:#E4EFEC;line-height:1.6;margin:0 0 20px;">
              You're in. Your email <strong style="color:#E4EFEC;">${esc(email)}</strong> is on the waitlist for early access to RENiKA.
            </p>
            <div style="background:#0C2A33;border:1px solid #1E4450;border-radius:14px;padding:20px 24px;margin-bottom:20px;">
              <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#8FB0B0;margin-bottom:4px;">Your position</div>
              <div style="font-size:44px;font-weight:800;color:#F26B7A;line-height:1;">#${position}</div>
            </div>
            <p style="font-size:14px;color:#8FB0B0;line-height:1.6;margin:0;">
              We'll email you as soon as your invite is ready. No spam — just the launch.
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:20px;font-family:system-ui,sans-serif;font-size:12px;color:#4E6E70;">
            © 2026 RENiKA · Clinical decision support for nephrologists
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendConfirmation({ email, position }) {
  const t = await getTransport();
  const from = process.env.MAIL_FROM || 'RENiKA <hello@renika.health>';

  const info = await t.sendMail({
    from,
    to: email,
    subject: `You're on the RENiKA waitlist — #${position}`,
    text:
      `You're on the RENiKA waitlist.\n\n` +
      `Your email ${email} is confirmed for early access. Your position is #${position}.\n\n` +
      `We'll email you as soon as your invite is ready. No spam — just the launch.\n\n` +
      `RENiKA — Where renal evidence meets practice.`,
    html: confirmationHtml(email, position),
  });

  if (usingEthereal) {
    console.log(`[mail] Confirmation for ${email} — preview: ${nodemailer.getTestMessageUrl(info)}`);
  } else {
    console.log(`[mail] Confirmation sent to ${email} (id: ${info.messageId})`);
  }
  return info;
}
