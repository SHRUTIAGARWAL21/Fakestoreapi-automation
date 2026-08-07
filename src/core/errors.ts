/**
 * Framework error types.
 *
 * A transport failure and an assertion failure are different problems with
 * different owners; naming them separately keeps triage fast.
 */
import type { RequestSnapshot } from './api-response';

/** The request never produced a response (DNS, TLS, timeout, socket reset). */
export class TransportError extends Error {
  constructor(
    readonly request: Pick<RequestSnapshot, 'method' | 'url'>,
    readonly attempts: number,
    override readonly cause: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    super(
      `${request.method} ${request.url} failed after ${attempts} attempt(s): ${reason}\n` +
        `Hint: check network access to the API host, or raise REQUEST_TIMEOUT_MS / HTTP_RETRIES.`,
    );
    this.name = 'TransportError';
  }
}

/** A contract snapshot is missing and the run is not in update mode. */
export class MissingContractError extends Error {
  constructor(name: string, path: string) {
    super(
      `No contract snapshot recorded for "${name}" (expected at ${path}).\n` +
        `Create it intentionally with: npm run contract:update`,
    );
    this.name = 'MissingContractError';
  }
}
