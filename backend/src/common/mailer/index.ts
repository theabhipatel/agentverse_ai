import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../config/env.js';
import { logger } from '../logger/index.js';

let transporter: Transporter | null = null;

/** Built once and reused, so the SMTP connection pool is not rebuilt per email. */
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    // Some relays accept mail without a login, so auth is only offered when set.
    ...(config.mail.user ? { auth: { user: config.mail.user, pass: config.mail.password } } : {}),
  });
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!config.mail.enabled) {
    throw new Error('Mail is not configured');
  }

  const info = await getTransporter().sendMail({ from: config.mail.from, ...mail });
  // The address is logged but never the body, which carries the reset link.
  logger.info({ to: mail.to, messageId: info.messageId }, 'Email sent');
}
