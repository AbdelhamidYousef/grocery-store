import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { createMailTransport, MAILPIT_URL } from '../../lib/mailer.ts';

// The one test that talks to a real SMTP server: Mailpit from docker-compose (SMTP 1026, HTTP
// API 8026). It proves the nodemailer wiring end to end, which a fake transport cannot. Skipped
// (not failed) when Mailpit is not running, so the suite works on a bare checkout.
const API = 'http://127.0.0.1:8026/api/v1';
const reachable = await fetch(`${API}/info`, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!reachable)('Mailpit (real SMTP)', () => {
  it('delivers a message through the nodemailer transport', async () => {
    const transport = createMailTransport(
      { nodeEnv: 'development', from: 'Grocery <orders@grocery.test>', smtpUrl: MAILPIT_URL },
      pino({ level: 'silent' }),
    );
    const subject = `Mailpit wiring test ${Date.now()}`;
    await transport.send({
      to: 'mailpit-wiring@grocery.test',
      subject,
      text: 'plain body',
      html: '<p>html body</p>',
      messageId: `<wiring-${Date.now()}@grocery.local>`,
    });
    const res = await fetch(`${API}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
    const body = (await res.json()) as {
      messages: { Subject: string; To: { Address: string }[] }[];
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.To[0]?.Address).toBe('mailpit-wiring@grocery.test');
  });
});
