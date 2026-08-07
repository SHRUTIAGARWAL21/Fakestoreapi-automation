/**
 * Known-deviation register.
 *
 * The FakeStore sandbox is a simulation: it does not persist writes, does not
 * validate cart payloads, and never enforces authorisation. A suite that
 * asserted the *ideal* REST contract would be permanently red and therefore
 * ignored; a suite that only asserted observed behaviour would silently bless
 * the defects.
 *
 * So tests do both. They assert what the API actually does today - which keeps
 * the run green and deterministic - and attach a registry entry describing what
 * a correct implementation should do. The reporter collects those entries into
 * a defect register published with every run.
 *
 * The safety property that makes this honest: the assertion is on the *actual*
 * behaviour, so the day the API is fixed the test fails loudly and the entry
 * must be consciously retired. Nothing rots quietly.
 */
import type { TestInfo } from '@playwright/test';

export type DeviationSeverity = 'high' | 'medium' | 'low';

export interface Deviation {
  readonly id: string;
  readonly title: string;
  /** What a correct implementation should do. */
  readonly expected: string;
  /** What this API actually does, and what the tests therefore assert. */
  readonly actual: string;
  readonly severity: DeviationSeverity;
  readonly impact: string;
}

export const DEVIATIONS = {
  MISSING_RESOURCE_RETURNS_200_NULL: {
    id: 'FSA-001',
    title: 'Missing cart returns 200 with a null body instead of 404',
    expected: 'GET /carts/{unknownNumericId} responds 404 with an error envelope.',
    actual: 'Responds 200 with the literal body `null`.',
    severity: 'high',
    impact:
      'Clients that branch on status code treat a missing cart as a successful fetch and then ' +
      'dereference null. Forces every consumer to add a defensive null check.',
  },
  WRITES_ARE_NOT_PERSISTED: {
    id: 'FSA-002',
    title: 'Create/update/delete are simulated, never persisted',
    expected: 'A created cart is retrievable by its returned id; a deleted cart is then absent.',
    actual:
      'POST always returns the same synthetic id and no state changes. DELETE returns the cart ' +
      'body and the cart remains retrievable afterwards.',
    severity: 'high',
    impact:
      'No end-to-end lifecycle can be verified against this environment. Round-trip assertions ' +
      'must be scoped to the response echo rather than to persisted state.',
  },
  NO_PAYLOAD_VALIDATION: {
    id: 'FSA-003',
    title: 'Cart payloads are accepted without validation',
    expected:
      'POST/PUT /carts reject unknown productIds, non-positive quantities, wrong field types ' +
      'and missing required fields with 400/422.',
    actual: 'Responds 201/200 and echoes the invalid payload back unchanged.',
    severity: 'high',
    impact:
      'Invalid data can enter the system unchallenged. Consumers cannot rely on server-side ' +
      'validation and must duplicate every rule client-side.',
  },
  AUTH_NOT_ENFORCED: {
    id: 'FSA-004',
    title: 'Cart endpoints do not enforce authentication or authorisation',
    expected:
      'Mutating cart endpoints require a valid bearer token and reject missing, malformed or ' +
      'expired tokens with 401.',
    actual: 'All cart endpoints succeed with no token, a malformed token or an expired token.',
    severity: 'high',
    impact:
      'Any caller can read or mutate any cart. The login endpoint issues tokens that no other ' +
      'endpoint verifies, so the auth flow provides no protection.',
  },
  AUTH_ERRORS_ARE_NOT_JSON: {
    id: 'FSA-005',
    title: 'Auth failures return text/html instead of a JSON error envelope',
    expected: 'POST /auth/login errors respond application/json with a structured error body.',
    actual: 'Responds text/html with a bare sentence, e.g. "username or password is incorrect".',
    severity: 'medium',
    impact:
      'Clients parsing JSON unconditionally throw on the error path, and the inconsistency with ' +
      "the cart endpoints' error envelope prevents a single shared error handler.",
  },
  ISSUED_TOKENS_HAVE_NO_EXPIRY: {
    id: 'FSA-006',
    title: 'Issued JWTs carry no expiry claim',
    expected: 'Tokens include an `exp` claim so sessions eventually end.',
    actual: 'The payload contains only `sub`, `user` and `iat`.',
    severity: 'medium',
    impact: 'A leaked token is valid forever. Expiry handling cannot be tested end to end.',
  },
  INVALID_QUERY_PARAMS_IGNORED: {
    id: 'FSA-007',
    title: 'Malformed collection query parameters are silently ignored',
    expected: '`?limit=abc` or `?sort=bogus` responds 400 explaining the invalid parameter.',
    actual: 'Responds 200 with the unfiltered default collection.',
    severity: 'low',
    impact:
      'A typo in a client query silently returns the wrong page of data instead of surfacing an ' +
      'error, which is hard to notice in production.',
  },
  NEGATIVE_LIMIT_RETURNS_ROWS: {
    id: 'FSA-008',
    title: '`?limit=-1` returns a single row rather than an error',
    expected: 'A negative limit responds 400.',
    actual: 'Responds 200 with exactly one element.',
    severity: 'low',
    impact: 'Off-by-one client bugs that compute a negative limit return data instead of failing.',
  },
} as const satisfies Record<string, Deviation>;

export type DeviationKey = keyof typeof DEVIATIONS;

/** Annotation type the reporter looks for when building the defect register. */
export const DEVIATION_ANNOTATION = 'api-deviation';

/**
 * Records that the current test asserts a known defect rather than the ideal
 * contract. The annotation is visible in the HTML report and collected by the
 * defect-register reporter.
 */
export function recordDeviation(testInfo: TestInfo, key: DeviationKey): Deviation {
  const deviation = DEVIATIONS[key];

  testInfo.annotations.push({
    type: DEVIATION_ANNOTATION,
    description: JSON.stringify(deviation),
  });

  return deviation;
}
