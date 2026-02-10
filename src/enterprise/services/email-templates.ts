/**
 * Email HTML templates for transactional emails.
 */

export function passwordResetTemplate(name: string, resetUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="padding:32px 40px;background:#1a1a2e;color:#ffffff;font-size:20px;font-weight:600">
          Password Reset
        </td></tr>
        <tr><td style="padding:32px 40px;color:#333333;font-size:15px;line-height:1.6">
          <p style="margin:0 0 16px">Hi ${escapeHtml(name)},</p>
          <p style="margin:0 0 16px">We received a request to reset your password. Click the button below to choose a new password.</p>
          <p style="margin:24px 0;text-align:center">
            <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">Reset Password</a>
          </p>
          <p style="margin:0 0 16px;color:#666666;font-size:13px">This link will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>
          <p style="margin:0 0 8px;color:#999999;font-size:12px;word-break:break-all">${escapeHtml(resetUrl)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function inviteTemplate(tenantName: string, inviteUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="padding:32px 40px;background:#1a1a2e;color:#ffffff;font-size:20px;font-weight:600">
          You're Invited
        </td></tr>
        <tr><td style="padding:32px 40px;color:#333333;font-size:15px;line-height:1.6">
          <p style="margin:0 0 16px">You have been invited to join <strong>${escapeHtml(tenantName)}</strong>.</p>
          <p style="margin:0 0 16px">Click the button below to create your account and get started.</p>
          <p style="margin:24px 0;text-align:center">
            <a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 32px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">Accept Invitation</a>
          </p>
          <p style="margin:0 0 8px;color:#999999;font-size:12px;word-break:break-all">${escapeHtml(inviteUrl)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
