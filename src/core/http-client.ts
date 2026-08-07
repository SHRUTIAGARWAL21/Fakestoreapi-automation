/**
 * The single choke point for every HTTP call the suite makes.
 *
 * Responsibilities, in order: build the request, time it, retry transient
 * failures, log it (redacted), and hand back an immutable `ApiResponse`.
 * Because every request funnels through here, cross-cutting concerns are added
 * once rather than per test.
 */
import type { APIRequestContext, APIResponse } from '@playwright/test';

import { HttpHeader, HttpStatus, MediaType } from '@/config/constants';
import { config } from '@/config/environments';
import { ApiResponse, type RequestSnapshot } from './api-response';
import { TransportError } from './errors';
import { Logger, redactHeaders, redactText, type LogRecord } from './logger';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface RequestSpec {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly headers?: Record<string, string>;
  /** Serialised as JSON. Mutually exclusive with `rawBody`. */
  readonly json?: unknown;
  /** Sent verbatim - the only way to exercise malformed payloads. */
  readonly rawBody?: string;
  readonly token?: string;
  readonly timeoutMs?: number;
  /** Overrides the client-level retry count (0 disables retries). */
  readonly retries?: number;
}

/** Responses worth retrying: the origin is behind a CDN that occasionally blips. */
const RETRYABLE_STATUSES: readonly number[] = [
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
  502,
  503,
  504,
];

/** A fully redacted record of one HTTP exchange, safe to persist or attach. */
export interface ExchangeRecord {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly durationMs: number;
  readonly attempts: number;
  readonly requestHeaders: Record<string, string>;
  readonly requestBody?: string;
  readonly responseHeaders: Record<string, string>;
  readonly responseBody: string;
}

export interface HttpClientOptions {
  readonly baseUrl?: string;
  readonly defaultHeaders?: Record<string, string>;
  /** Sink for log records. Subject to LOG_LEVEL filtering. */
  readonly onLog?: (record: LogRecord) => void;
  /**
   * Called for every exchange regardless of LOG_LEVEL.
   *
   * Console verbosity and failure-artifact capture are different concerns:
   * a quiet CI run (LOG_LEVEL=warn) must still produce a full transcript to
   * attach when a test fails.
   */
  readonly onExchange?: (record: ExchangeRecord) => void;
}

export class HttpClient {
  private readonly logger: Logger;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly onExchange?: (record: ExchangeRecord) => void;

  constructor(
    private readonly context: APIRequestContext,
    options: HttpClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/+$/, '');
    this.defaultHeaders = {
      accept: MediaType.JSON,
      ...lowercaseKeys(options.defaultHeaders ?? {}),
    };
    this.onExchange = options.onExchange;
    this.logger = new Logger('http', options.onLog);
  }

  get<T = unknown>(path: string, spec: Omit<RequestSpec, 'method' | 'path'> = {}) {
    return this.send<T>({ ...spec, method: 'GET', path });
  }

  post<T = unknown>(path: string, spec: Omit<RequestSpec, 'method' | 'path'> = {}) {
    return this.send<T>({ ...spec, method: 'POST', path });
  }

  put<T = unknown>(path: string, spec: Omit<RequestSpec, 'method' | 'path'> = {}) {
    return this.send<T>({ ...spec, method: 'PUT', path });
  }

  delete<T = unknown>(path: string, spec: Omit<RequestSpec, 'method' | 'path'> = {}) {
    return this.send<T>({ ...spec, method: 'DELETE', path });
  }

  async send<T = unknown>(spec: RequestSpec): Promise<ApiResponse<T>> {
    const url = this.buildUrl(spec.path, spec.query);
    const headers = this.buildHeaders(spec);
    const body = this.buildBody(spec);
    const maxAttempts = (spec.retries ?? config.retries.count) + 1;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const raw = await this.dispatch(spec.method, url, headers, body, spec.timeoutMs);
        const response = await this.toApiResponse<T>(raw, {
          method: spec.method,
          url,
          path: spec.path,
          headers,
          body: spec.json ?? spec.rawBody,
          attempts: attempt,
          startedAt,
        });

        if (this.shouldRetry(response.status, attempt, maxAttempts)) {
          this.logger.warn('Retrying transient response', {
            method: spec.method,
            url,
            status: response.status,
            attempt,
            maxAttempts,
          });
          await delay(config.retries.backoffMs * attempt);
          continue;
        }

        this.logExchange(response);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) break;

        this.logger.warn('Retrying after transport failure', {
          method: spec.method,
          url,
          attempt,
          maxAttempts,
          reason: (error as Error).message,
        });
        await delay(config.retries.backoffMs * attempt);
      }
    }

    const failure = new TransportError({ method: spec.method, url }, maxAttempts, lastError);
    this.logger.error(failure.message, { method: spec.method, url });
    throw failure;
  }

  private async dispatch(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    timeoutMs?: number,
  ): Promise<APIResponse> {
    return this.context.fetch(url, {
      method,
      headers,
      timeout: timeoutMs ?? config.timeouts.request,
      // `failOnStatusCode` stays false: non-2xx responses are data, not errors.
      failOnStatusCode: false,
      ...(body === undefined ? {} : { data: body }),
    });
  }

  private async toApiResponse<T>(
    raw: APIResponse,
    meta: RequestSnapshot & { startedAt: number },
  ): Promise<ApiResponse<T>> {
    const rawBody = await raw.text();
    return new ApiResponse<T>({
      request: {
        method: meta.method,
        url: meta.url,
        path: meta.path,
        headers: meta.headers,
        body: meta.body,
        attempts: meta.attempts,
      },
      status: raw.status(),
      statusText: raw.statusText(),
      headers: lowercaseKeys(raw.headers()),
      rawBody,
      durationMs: Date.now() - meta.startedAt,
    });
  }

  private shouldRetry(status: number, attempt: number, maxAttempts: number): boolean {
    return RETRYABLE_STATUSES.includes(status) && attempt < maxAttempts;
  }

  private buildUrl(path: string, query?: RequestSpec['query']): string {
    const normalised = path.startsWith('/') ? path : `/${path}`;
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) params.append(key, String(value));
    }

    const search = params.toString();
    return `${this.baseUrl}${normalised}${search ? `?${search}` : ''}`;
  }

  private buildHeaders(spec: RequestSpec): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...lowercaseKeys(spec.headers ?? {}),
    };

    const sendsBody = spec.json !== undefined || spec.rawBody !== undefined;
    if (sendsBody && headers[HttpHeader.CONTENT_TYPE] === undefined) {
      headers[HttpHeader.CONTENT_TYPE] = MediaType.JSON;
    }
    if (spec.token !== undefined) {
      headers[HttpHeader.AUTHORIZATION] = `Bearer ${spec.token}`;
    }
    return headers;
  }

  private buildBody(spec: RequestSpec): string | undefined {
    if (spec.rawBody !== undefined) return spec.rawBody;
    if (spec.json !== undefined) return JSON.stringify(spec.json);
    return undefined;
  }

  private logExchange(response: ApiResponse): void {
    const record: ExchangeRecord = {
      method: response.request.method,
      url: response.request.url,
      status: response.status,
      durationMs: response.durationMs,
      attempts: response.request.attempts,
      requestHeaders: redactHeaders(response.request.headers),
      requestBody:
        response.request.body === undefined
          ? undefined
          : redactText(
              typeof response.request.body === 'string'
                ? response.request.body
                : JSON.stringify(response.request.body),
            ),
      responseHeaders: redactHeaders(response.headers),
      responseBody: redactText(response.rawBody).slice(0, 2000),
    };

    // Always captured, so a failure is diagnosable even on a quiet run...
    this.onExchange?.(record);

    // ...while console noise still respects LOG_LEVEL.
    this.logger[response.ok ? 'debug' : 'info']('HTTP exchange', { ...record });
  }
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
