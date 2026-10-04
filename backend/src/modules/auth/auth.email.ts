import { config } from '../../config/env.js';
import type { Mail } from '../../common/mailer/index.js';

/**
 * Email clients strip stylesheets, so these have to be inline literals.
 * They mirror the brand palette in the frontend theme but cannot read it.
 */
const PALETTE = {
  navy: '#0B1E3A',
  orange: '#F97316',
  ink: '#1B2430',
  muted: '#5A6B7C',
  surface: '#F4F7FA',
} as const;

export function buildPasswordResetEmail({
  to,
  name,
  link,
  expiresIn,
}: {
  to: string;
  name: string;
  link: string;
  expiresIn: string;
}): Mail {
  const subject = `Reset your ${config.app.name} password`;

  const text = [
    `Hi ${name},`,
    '',
    `Someone asked to reset the password for your ${config.app.name} account.`,
    `Open this link to choose a new one. It expires in ${expiresIn}.`,
    '',
    link,
    '',
    'If this was not you, ignore this email and nothing changes.',
  ].join('\n');

  const html = `
<div style="margin:0;padding:32px 16px;background:${PALETTE.surface};font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:14px;overflow:hidden;">
    <div style="background:${PALETTE.navy};padding:24px 28px;">
      <p style="margin:0;color:#FFFFFF;font-size:17px;font-weight:700;letter-spacing:4px;">AGENTVERSE</p>
      <p style="margin:6px 0 0;color:#9FB3C8;font-size:12px;">Build Your AI Workforce</p>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 16px;color:${PALETTE.ink};font-size:16px;">Hi ${name},</p>
      <p style="margin:0 0 24px;color:${PALETTE.muted};font-size:14px;line-height:22px;">
        Someone asked to reset the password for your ${config.app.name} account.
        Choose a new one below. This link expires in ${expiresIn}.
      </p>
      <a href="${link}" style="display:inline-block;background:${PALETTE.orange};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">
        Reset password
      </a>
      <p style="margin:24px 0 0;color:${PALETTE.muted};font-size:12px;line-height:20px;">
        If the button does not work, paste this into your browser:<br />
        <span style="color:${PALETTE.orange};word-break:break-all;">${link}</span>
      </p>
      <p style="margin:20px 0 0;color:${PALETTE.muted};font-size:12px;line-height:20px;">
        If this was not you, ignore this email and nothing changes.
      </p>
    </div>
  </div>
</div>`.trim();

  return { to, subject, text, html };
}
