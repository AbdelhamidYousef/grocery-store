import { createTransport } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { Logger } from 'pino';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Stable per outbox row, so a re-send after a crash carries the same Message-ID. */
  messageId: string;
}

// The only thing the outbox needs from "email": hand over a message, resolve when the server
// accepted it, reject if not. Tests plug a recording fake in here; nothing else knows about SMTP.
export interface MailTransport {
  /** False when no transport is configured: the outbox then skips instead of failing forever. */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export interface MailConfig {
  nodeEnv: 'development' | 'test' | 'production';
  from: string;
  smtpUrl?: string | undefined;
  resendApiKey?: string | undefined;
}

// Same defaults for every SMTP flavour: a hung mail server must not hold a database transaction
// (the outbox sends while it holds the rows) for longer than these.
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 };

export const MAILPIT_URL = 'smtp://127.0.0.1:1025';

// Picks the transport from the environment:
//   RESEND_API_KEY -> Resend's SMTP endpoint (user "resend", password = the key): the production
//                     path on the free tier, and still plain SMTP so there is ONE code path;
//   SMTP_URL       -> whatever server that names;
//   development    -> Mailpit on localhost, so `pnpm dev` shows emails at localhost:8025;
//   otherwise      -> disabled (production without any mail config): the API boots, and the outbox
//                     logs and skips instead of crashing a checkout over an unconfigured inbox.
export function createMailTransport(config: MailConfig, log: Logger): MailTransport {
  const make = (options: string | SMTPTransport.Options): MailTransport => {
    // `url` is the options form of "smtp://host:port"; a bare string cannot take the timeouts.
    const transporter = createTransport({
      ...(typeof options === 'string' ? { url: options } : options),
      ...TIMEOUTS,
    });
    return {
      enabled: true,
      send: async (m) => {
        await transporter.sendMail({
          from: config.from,
          to: m.to,
          subject: m.subject,
          text: m.text,
          html: m.html,
          messageId: m.messageId,
        });
      },
    };
  };

  if (config.resendApiKey) {
    return make({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: config.resendApiKey },
    });
  }
  if (config.smtpUrl) return make(config.smtpUrl);
  if (config.nodeEnv === 'development') return make(MAILPIT_URL);

  log.warn('no mail transport configured (RESEND_API_KEY / SMTP_URL): emails will be skipped');
  return {
    enabled: false,
    send: () => Promise.reject(new Error('mail transport not configured')),
  };
}

// A transport that records messages instead of sending them (tests, and a safe default for apps
// built without mail).
export class MemoryTransport implements MailTransport {
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  private failures = 0;

  /** The next `times` sends reject, like an SMTP server that is down. */
  failNext(times = 1): void {
    this.failures += times;
  }

  send(message: MailMessage): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('SMTP down'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}
