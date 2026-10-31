import { pino } from 'pino';

export interface LoggerOptions {
  level: string;
  /** Human-readable output for local development; JSON everywhere else. */
  pretty?: boolean;
  /** Test hook: where to write instead of stdout. */
  destination?: pino.DestinationStream;
}

// Cookies carry the session id and the Authorization header carries credentials: neither may ever
// reach a log aggregator, so they are replaced with "[Redacted]" before serialisation.
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

export function createLogger({ level, pretty = false, destination }: LoggerOptions): pino.Logger {
  const options: pino.LoggerOptions = { level, redact: REDACT_PATHS };
  if (destination) return pino(options, destination);
  // JSON in production because machines read it; pino-pretty only as a dev transport so it is
  // never loaded (or needed) in production.
  if (pretty) return pino({ ...options, transport: { target: 'pino-pretty' } });
  return pino(options);
}
