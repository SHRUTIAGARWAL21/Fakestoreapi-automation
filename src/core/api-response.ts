/**
 * Immutable envelope around a single HTTP exchange.
 *
 * Deliberately never throws: a test asserting on a 400 with an HTML body is a
 * first-class case, not an error. Parsing is lazy and failure-tolerant, and the
 * originating request is carried along so assertion messages can be specific
 * about what was actually sent.
 */
import { HttpHeader } from '@/config/constants';

export interface RequestSnapshot {
  readonly method: string;
  readonly url: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body?: unknown;
  readonly attempts: number;
}

export interface ApiResponseInit {
  readonly request: RequestSnapshot;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly rawBody: string;
  readonly durationMs: number;
}

export class ApiResponse<T = unknown> {
  readonly request: RequestSnapshot;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  readonly rawBody: string;
  readonly durationMs: number;

  private parsed?: { ok: true; value: unknown } | { ok: false; error: string };

  constructor(init: ApiResponseInit) {
    this.request = init.request;
    this.status = init.status;
    this.statusText = init.statusText;
    this.headers = init.headers;
    this.rawBody = init.rawBody;
    this.durationMs = init.durationMs;
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }

  get contentType(): string {
    return this.header(HttpHeader.CONTENT_TYPE) ?? '';
  }

  /** Case-insensitive header lookup. */
  header(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  get isJson(): boolean {
    return this.contentType.toLowerCase().includes('application/json');
  }

  /** True when the body parses as JSON, regardless of the advertised type. */
  get hasJsonBody(): boolean {
    return this.parse().ok;
  }

  /**
   * The parsed body. Throws a descriptive error when the body is not JSON -
   * callers that must tolerate non-JSON should check `hasJsonBody` first or
   * use `rawBody`.
   */
  get body(): T {
    const result = this.parse();
    if (!result.ok) {
      throw new Error(
        `Expected a JSON body from ${this.request.method} ${this.request.path} ` +
          `(status ${this.status}, content-type "${this.contentType}") but parsing failed: ` +
          `${result.error}\nRaw body: ${truncate(this.rawBody, 500)}`,
      );
    }
    return result.value as T;
  }

  /** The parsed body, or `undefined` when the body is absent or not JSON. */
  get bodyOrUndefined(): T | undefined {
    const result = this.parse();
    return result.ok ? (result.value as T) : undefined;
  }

  /** A compact, log-safe description used in assertion failure messages. */
  describe(): string {
    return (
      `${this.request.method} ${this.request.url} -> ${this.status} ${this.statusText} ` +
      `in ${this.durationMs}ms\n` +
      `  content-type: ${this.contentType || '(none)'}\n` +
      `  body: ${truncate(this.rawBody, 500) || '(empty)'}`
    );
  }

  private parse(): { ok: true; value: unknown } | { ok: false; error: string } {
    if (this.parsed) return this.parsed;

    if (this.rawBody.trim() === '') {
      this.parsed = { ok: false, error: 'body is empty' };
      return this.parsed;
    }

    try {
      this.parsed = { ok: true, value: JSON.parse(this.rawBody) };
    } catch (error) {
      this.parsed = { ok: false, error: (error as Error).message };
    }
    return this.parsed;
  }
}

export function truncate(text: string, max: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max)}... (truncated)`;
}
