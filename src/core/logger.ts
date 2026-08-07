/**
 * Structured, level-aware logger with automatic redaction of secrets.
 *
 * Emits one JSON object per line so CI log processors can ingest it directly,
 * while `LOG_LEVEL=silent` keeps a parallel run's stdout readable.
 */
import { REDACTED, SENSITIVE_FIELDS, SENSITIVE_HEADERS } from '@/config/constants';
import { config, type LogLevel } from '@/config/environments';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export type LogContext = Record<string, unknown>;

export interface LogRecord {
  readonly timestamp: string;
  readonly level: Exclude<LogLevel, 'silent'>;
  readonly scope: string;
  readonly message: string;
  readonly context?: LogContext;
}

/** Replaces the value of any sensitive header with a redaction marker. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) =>
      SENSITIVE_HEADERS.includes(key.toLowerCase()) ? [key, REDACTED] : [key, value],
    ),
  );
}

/**
 * Deep-redacts sensitive fields anywhere in a JSON-like value.
 * Cycles are impossible here (inputs are always parsed JSON) but depth is
 * capped anyway so a pathological payload can never hang the run.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) =>
      SENSITIVE_FIELDS.includes(key) ? [key, REDACTED] : [key, redactValue(nested, depth + 1)],
    ),
  );
}

/** Redacts secrets that appear inside an already-serialised body string. */
export function redactText(text: string): string {
  if (!text) return text;
  try {
    return JSON.stringify(redactValue(JSON.parse(text)));
  } catch {
    // Not JSON (the API returns text/html for some errors) - fall back to a
    // conservative pattern wipe so a leaked token never lands in a report.
    return text.replace(/(eyJ[\w-]+\.[\w-]+\.[\w-]+)/g, REDACTED);
  }
}

export class Logger {
  private readonly sink: (record: LogRecord) => void;

  constructor(
    private readonly scope: string,
    sink?: (record: LogRecord) => void,
  ) {
    this.sink = sink ?? ((record) => process.stdout.write(`${JSON.stringify(record)}\n`));
  }

  child(scope: string): Logger {
    return new Logger(`${this.scope}:${scope}`, this.sink);
  }

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context);
  }

  private write(level: Exclude<LogLevel, 'silent'>, message: string, context?: LogContext): void {
    if (LEVEL_WEIGHT[level] > LEVEL_WEIGHT[config.logging.level]) return;

    this.sink({
      timestamp: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...(context ? { context: redactValue(context) as LogContext } : {}),
    });
  }
}

export const logger = new Logger('fakestore');
