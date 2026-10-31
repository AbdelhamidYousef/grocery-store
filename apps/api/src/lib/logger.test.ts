import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from './logger.ts';

describe('createLogger', () => {
  it('redacts cookies and credentials before anything is written', () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const log = createLogger({ level: 'info', destination });
    log.info({ req: { headers: { cookie: 'sid=secret', authorization: 'Bearer abc' } } }, 'hi');
    expect(lines.join('')).not.toContain('secret');
    expect(lines.join('')).not.toContain('Bearer abc');
    expect(lines.join('')).toContain('[Redacted]');
  });

  it('builds a plain JSON logger and a pretty one without a destination', () => {
    expect(createLogger({ level: 'silent' }).level).toBe('silent');
    expect(createLogger({ level: 'silent', pretty: true }).level).toBe('silent');
  });
});
