/**
 * Transport-level assertions applied to (almost) every response.
 *
 * Bundling them behind one call is what makes "never assert only the status
 * code" cheap enough that nobody skips it: one line covers status, content
 * type, response time, CORS exposure and JSON parseability.
 */
import { HttpHeader, MediaType } from '@/config/constants';
import { config } from '@/config/environments';
import type { ApiResponse } from '@/core/api-response';
import type { IdentifiedSchema } from '@/schemas';
import { expect } from './matchers';

export interface ResponseExpectation {
  readonly status: number;
  /** Defaults to application/json. Pass `null` to skip the check. */
  readonly contentType?: string | null;
  /** Defaults to RESPONSE_SLA_MS. */
  readonly withinMs?: number;
  /** When supplied, the body is validated against this schema. */
  readonly schema?: IdentifiedSchema | object;
  /** Defaults to true - set false for endpoints that legitimately return HTML. */
  readonly expectJsonBody?: boolean;
}

/**
 * Asserts the standard response envelope.
 *
 * Deliberately assertion-only: it returns nothing, so a test cannot accidentally
 * depend on it for data.
 */
export function assertResponseEnvelope(
  response: ApiResponse,
  expectation: ResponseExpectation,
): void {
  const {
    status,
    contentType = MediaType.JSON,
    withinMs = config.timeouts.responseSla,
    schema,
    expectJsonBody = contentType === MediaType.JSON,
  } = expectation;

  expect(response).toHaveStatus(status);

  if (contentType !== null) {
    expect(response).toHaveContentType(contentType);
  }

  expect(response).toRespondWithin(withinMs);

  // The API is browser-consumable; losing CORS would break every web client.
  expect(response).toHaveHeader(HttpHeader.ACCESS_CONTROL_ALLOW_ORIGIN, '*');

  if (expectJsonBody) {
    expect(response.hasJsonBody, `Expected a parseable JSON body.\n${response.describe()}`).toBe(
      true,
    );
  }

  if (schema) {
    expect(response).toMatchJsonSchema(schema);
  }
}
