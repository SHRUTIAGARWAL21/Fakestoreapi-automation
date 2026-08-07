/**
 * Shared constants. Anything a test might otherwise spell as a magic value
 * belongs here so that renames are a single edit and greps are meaningful.
 */

export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

export const HttpHeader = {
  ACCEPT: 'accept',
  AUTHORIZATION: 'authorization',
  CONTENT_TYPE: 'content-type',
  ACCESS_CONTROL_ALLOW_ORIGIN: 'access-control-allow-origin',
} as const;

export const MediaType = {
  JSON: 'application/json',
  TEXT: 'text/plain',
  HTML: 'text/html',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
} as const;

/** Header values that must never reach a log file or a report attachment. */
export const SENSITIVE_HEADERS: readonly string[] = ['authorization', 'cookie', 'set-cookie'];

/** Body fields that must never reach a log file or a report attachment. */
export const SENSITIVE_FIELDS: readonly string[] = ['password', 'token', 'accessToken', 'secret'];

export const REDACTED = '***REDACTED***';

/**
 * Seed data guaranteed to exist in the sandbox dataset.
 * Sourced from https://fakestoreapi.com/docs and verified by the smoke suite.
 */
export const SeedData = {
  /** Carts 1-7 are pre-seeded. */
  CART_IDS: [1, 2, 3, 4, 5, 6, 7] as const,
  FIRST_CART_ID: 1,
  TOTAL_CARTS: 7,
  /** Products 1-20 are pre-seeded. */
  PRODUCT_IDS: Array.from({ length: 20 }, (_, i) => i + 1),
  MIN_PRODUCT_ID: 1,
  MAX_PRODUCT_ID: 20,
  /** A user id that owns at least one cart. */
  USER_WITH_CARTS: 2,
  USER_WITHOUT_CARTS: 9999,
} as const;

/** Ids that are syntactically valid but reference nothing. */
export const NON_EXISTENT_CART_ID = 999_999;

/**
 * Ids the API cannot parse as a number and rejects with 400.
 * Verified against the live API - note that `%20` is NOT rejected (it is
 * treated as a missing id and returns 200/null), so it is covered separately.
 */
export const MALFORMED_CART_IDS = ['abc', 'null', 'undefined', '1.5.2', '1abc'] as const;

/** URL-encoded whitespace: parsed as a missing id rather than rejected. */
export const WHITESPACE_CART_ID = '%20';

/** Structurally valid JWT that expired in 2001 - used for token-handling tests. */
export const EXPIRED_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOjEsInVzZXIiOiJqb2huZCIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ.' +
  '4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ';

/** A token that is not a JWT at all. */
export const MALFORMED_JWT = 'this-is-not-a-json-web-token';

export const Tag = {
  SMOKE: '@smoke',
  POSITIVE: '@positive',
  NEGATIVE: '@negative',
  CONTRACT: '@contract',
  SCHEMA: '@schema',
  DATA_DRIVEN: '@data-driven',
  AUTH: '@auth',
  /** Marks a test that asserts a documented API defect rather than ideal behaviour. */
  DEVIATION: '@deviation',
} as const;
