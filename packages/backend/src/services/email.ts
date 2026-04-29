import { Resend } from "resend";
import { config } from "../config";

const APP_NAME = config.app.name;
const APP_BASE_URL = config.app.baseUrl;
const EMAIL_FROM = config.email.from || `${APP_NAME} <noreply@taxi.local>`;

const resend = config.email.resendApiKey
  ? new Resend(config.email.resendApiKey)
  : null;

if (!resend) {
  console.warn(
    "[Email] RESEND_API_KEY not set — emails will be logged to console only",
  );
}

// Resend SDK returns { data, error } instead of throwing — this wrapper
// surfaces API errors so callers see them rather than silently succeeding.
async function sendViaResend(
  params: Parameters<Resend["emails"]["send"]>[0],
): Promise<void> {
  const { error } = await resend!.emails.send(params);
  if (error) {
    throw new Error(`[Email] Resend error (${error.name}): ${error.message}`);
  }
}

// ── Design tokens (matched to frontend theme.css) ─────────────────────────────
const t = {
  bg: "#f9f9f9",
  surface: "#ffffff",
  dark: "#131313",
  mid: "#3a3a3a",
  muted: "#7d8082",
  border: "#e5e5e5",
  borderLight: "#d3d3d3",
  green: "#98fe00",
  forest: "#233802",
  error: "#d14b4b",
  fontBody:
    "'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontMono: "'Roboto Mono', 'Courier New', Courier, monospace",
};

function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
</head>
<body style="margin:0;padding:0;background:${t.bg};font-family:${t.fontBody};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
    style="background:${t.bg};padding:40px 20px 60px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
          style="max-width:480px;width:100%;">

          <!-- Brand header -->
          <tr>
            <td style="padding-bottom:24px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:${t.dark};border-radius:4px;width:32px;height:32px;text-align:center;vertical-align:middle;">
                    <span style="font-family:${t.fontMono};font-size:11px;font-weight:700;color:${t.green};letter-spacing:0.02em;line-height:32px;">TC</span>
                  </td>
                  <td style="padding-left:10px;vertical-align:middle;">
                    <span style="font-family:${t.fontBody};font-size:17px;font-weight:700;color:${t.dark};letter-spacing:-0.03em;">${APP_NAME}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:${t.surface};border:1px solid ${t.border};border-radius:4px;box-shadow:0 14px 40px rgba(19,19,19,0.06);padding:32px;">
              ${body}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-family:${t.fontMono};font-size:11px;color:${t.muted};text-transform:uppercase;letter-spacing:0.08em;">${APP_NAME} &mdash; ${APP_BASE_URL}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 6px;font-family:${t.fontMono};font-size:11px;font-weight:400;color:${t.muted};text-transform:uppercase;letter-spacing:0.08em;">/ ${text}</p>`;
}

function codeBox(content: string, small = false): string {
  const size = small ? "11px" : "12px";
  return `<div style="font-family:${t.fontMono};font-size:${size};word-break:break-all;background:${t.bg};padding:12px 14px;border-radius:4px;border:1px solid ${t.border};color:${t.mid};line-height:1.6;">${content}</div>`;
}

function primaryButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;">
    <tr>
      <td style="border-radius:4px;overflow:hidden;">
        <a href="${href}"
          style="display:table;width:100%;background:${t.dark};text-decoration:none;border-radius:4px;">
          <span style="display:table-cell;padding:14px 20px;font-family:${t.fontBody};font-size:16px;font-weight:500;color:#ffffff;letter-spacing:-0.01em;vertical-align:middle;">${label}</span>
          <span style="display:table-cell;width:44px;background:${t.green};text-align:center;vertical-align:middle;border-radius:0 4px 4px 0;">
            <span style="font-size:16px;color:${t.dark};">↗</span>
          </span>
        </a>
      </td>
    </tr>
  </table>`;
}

function divider(): string {
  return `<div style="border-top:1px solid ${t.border};margin:24px 0;"></div>`;
}

export async function sendMagicLinkEmail(
  to: string,
  token: string,
  userName: string,
): Promise<void> {
  const loginUrl = `${APP_BASE_URL}/login?token=${encodeURIComponent(token)}`;

  if (!resend) {
    console.warn("[Email] Resend not configured — logging magic link instead");
    console.log(`[Magic Link] To: ${to} | URL: ${loginUrl}`);
    return;
  }

  const body = `
    ${sectionLabel("Sign in")}
    <h2 style="margin:4px 0 8px;font-family:${t.fontBody};font-size:28px;font-weight:700;color:${t.dark};letter-spacing:-0.03em;line-height:1.2;">
      Hi ${escapeHtml(userName)}
    </h2>
    <p style="margin:0 0 28px;font-family:${t.fontBody};font-size:15px;font-weight:500;color:${t.muted};line-height:1.6;">
      Click below to sign in to your account. This link expires in <strong style="color:${t.dark};">15 minutes</strong>.
    </p>

    ${primaryButton(loginUrl, "Sign in to " + APP_NAME)}

    ${divider()}

    ${sectionLabel("Copy link")}
    <p style="margin:0 0 8px;font-family:${t.fontBody};font-size:13px;color:${t.muted};">If the button doesn't work, copy this link into your browser:</p>
    ${codeBox(`<a href="${loginUrl}" style="color:#0066cc;text-decoration:underline;">${loginUrl}</a>`)}

    <div style="height:16px;"></div>

    ${sectionLabel("Or paste token")}
    <p style="margin:0 0 8px;font-family:${t.fontBody};font-size:13px;color:${t.muted};">Paste this into the <em>token</em> field on the sign-in page:</p>
    ${codeBox(escapeHtml(token))}

    <p style="margin:24px 0 0;font-family:${t.fontBody};font-size:13px;color:${t.muted};line-height:1.5;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;

  await sendViaResend({
    from: EMAIL_FROM,
    to,
    subject: `${APP_NAME} — Sign in to your account`,
    html: emailShell(body),
  });
}

export async function sendInvitationEmail(
  to: string,
  token: string,
  userName: string,
  role: "driver" | "admin",
): Promise<void> {
  const acceptUrl = `${APP_BASE_URL}/accept-invitation?token=${encodeURIComponent(token)}`;

  if (!resend) {
    console.warn("[Email] Resend not configured — logging invitation instead");
    console.log(`[Invitation] To: ${to} | URL: ${acceptUrl}`);
    return;
  }

  const roleLabel = role === "admin" ? "Admin" : "Driver";

  const body = `
    ${sectionLabel("You're invited")}
    <h2 style="margin:4px 0 8px;font-family:${t.fontBody};font-size:28px;font-weight:700;color:${t.dark};letter-spacing:-0.03em;line-height:1.2;">
      Hi ${escapeHtml(userName)}
    </h2>
    <p style="margin:0 0 28px;font-family:${t.fontBody};font-size:15px;font-weight:500;color:${t.muted};line-height:1.6;">
      You've been invited to join <strong style="color:${t.dark};">${APP_NAME}</strong> as a <strong style="color:${t.dark};">${roleLabel}</strong>. Click below to set your password and activate your account.
    </p>

    ${primaryButton(acceptUrl, "Accept invitation")}

    ${divider()}

    ${sectionLabel("Copy link")}
    <p style="margin:0 0 8px;font-family:${t.fontBody};font-size:13px;color:${t.muted};">If the button doesn't work, copy this link into your browser:</p>
    ${codeBox(`<a href="${acceptUrl}" style="color:#0066cc;text-decoration:underline;">${acceptUrl}</a>`)}

    <p style="margin:24px 0 0;font-family:${t.fontBody};font-size:13px;color:${t.muted};line-height:1.5;">
      This invitation expires in <strong style="color:${t.dark};">48 hours</strong>. If you didn't expect this, you can safely ignore it.
    </p>
  `;

  await sendViaResend({
    from: EMAIL_FROM,
    to,
    subject: `You've been invited to ${APP_NAME}`,
    html: emailShell(body),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  userName: string,
): Promise<void> {
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;

  if (!resend) {
    console.warn("[Email] Resend not configured — logging reset link instead");
    console.log(`[Password Reset] To: ${to} | URL: ${resetUrl}`);
    return;
  }

  const body = `
    ${sectionLabel("Password reset")}
    <h2 style="margin:4px 0 8px;font-family:${t.fontBody};font-size:28px;font-weight:700;color:${t.dark};letter-spacing:-0.03em;line-height:1.2;">
      Hi ${escapeHtml(userName)}
    </h2>
    <p style="margin:0 0 28px;font-family:${t.fontBody};font-size:15px;font-weight:500;color:${t.muted};line-height:1.6;">
      Click below to set a new password. This link expires in <strong style="color:${t.dark};">15 minutes</strong>.
    </p>

    ${primaryButton(resetUrl, "Reset password")}

    ${divider()}

    ${sectionLabel("Copy link")}
    <p style="margin:0 0 8px;font-family:${t.fontBody};font-size:13px;color:${t.muted};">If the button doesn't work, copy this link into your browser:</p>
    ${codeBox(`<a href="${resetUrl}" style="color:#0066cc;text-decoration:underline;">${resetUrl}</a>`)}

    <p style="margin:24px 0 0;font-family:${t.fontBody};font-size:13px;color:${t.muted};line-height:1.5;">
      If you didn't request a password reset, you can safely ignore this email — your password will not be changed.
    </p>
  `;

  await sendViaResend({
    from: EMAIL_FROM,
    to,
    subject: `${APP_NAME} — Reset your password`,
    html: emailShell(body),
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
