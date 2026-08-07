/**
 * Custom matchers.
 *
 * Every message answers the three questions you actually have when a build goes
 * red: what was asserted, what came back, and which request produced it. A bare
 * `expected 404, received 200` sends you hunting through logs; these do not.
 *
 * Playwright infers the matcher types from `expect.extend`, so tests get full
 * IntelliSense with no module augmentation.
 */
import { expect as baseExpect } from '@playwright/test';

import { MediaType } from '@/config/constants';
import { config } from '@/config/environments';
import { ApiResponse } from '@/core/api-response';
import { formatContractResult, verifyContract, type ContractOptions } from '@/validation/contract';
import { formatViolations, validateAgainstSchema } from '@/validation/schema-validator';
import type { IdentifiedSchema } from '@/schemas';

interface MatcherResult {
  pass: boolean;
  message: () => string;
  name?: string;
  expected?: unknown;
  actual?: unknown;
}

function assertIsApiResponse(received: unknown, matcher: string): asserts received is ApiResponse {
  if (!(received instanceof ApiResponse)) {
    throw new Error(
      `${matcher}() expects an ApiResponse (returned by any client method), ` +
        `but received ${received === null ? 'null' : typeof received}.`,
    );
  }
}

export const expect = baseExpect.extend({
  /** Asserts the HTTP status code, quoting the exchange on failure. */
  toHaveStatus(received: unknown, expected: number): MatcherResult {
    assertIsApiResponse(received, 'toHaveStatus');
    const pass = received.status === expected;

    return {
      name: 'toHaveStatus',
      pass,
      expected,
      actual: received.status,
      message: () =>
        pass
          ? `Expected status not to be ${expected}, but it was.\n${received.describe()}`
          : `Expected status ${expected} but received ${received.status}.\n${received.describe()}`,
    };
  },

  /** Asserts the status is any of the listed codes. */
  toHaveStatusIn(received: unknown, expected: readonly number[]): MatcherResult {
    assertIsApiResponse(received, 'toHaveStatusIn');
    const pass = expected.includes(received.status);

    return {
      name: 'toHaveStatusIn',
      pass,
      expected,
      actual: received.status,
      message: () =>
        pass
          ? `Expected status not to be one of [${expected.join(', ')}], but it was ${received.status}.`
          : `Expected status to be one of [${expected.join(', ')}] but received ` +
            `${received.status}.\n${received.describe()}`,
    };
  },

  /** Asserts the Content-Type header, ignoring charset and other parameters. */
  toHaveContentType(received: unknown, expected: string = MediaType.JSON): MatcherResult {
    assertIsApiResponse(received, 'toHaveContentType');
    const actual = received.contentType;
    const pass = actual.toLowerCase().includes(expected.toLowerCase());

    return {
      name: 'toHaveContentType',
      pass,
      expected,
      actual,
      message: () =>
        pass
          ? `Expected content-type not to include "${expected}", but it was "${actual}".`
          : `Expected content-type to include "${expected}" but received "${actual || '(none)'}".\n` +
            received.describe(),
    };
  },

  /** Asserts a header is present, optionally matching a value. */
  toHaveHeader(received: unknown, name: string, expected?: string | RegExp): MatcherResult {
    assertIsApiResponse(received, 'toHaveHeader');
    const actual = received.header(name);

    if (actual === undefined) {
      return {
        name: 'toHaveHeader',
        pass: false,
        expected: expected ?? '(present)',
        actual: undefined,
        message: () =>
          `Expected header "${name}" to be present. Headers received: ` +
          `[${Object.keys(received.headers).join(', ')}]\n${received.describe()}`,
      };
    }

    const pass =
      expected === undefined
        ? true
        : expected instanceof RegExp
          ? expected.test(actual)
          : actual.toLowerCase() === expected.toLowerCase();

    return {
      name: 'toHaveHeader',
      pass,
      expected,
      actual,
      message: () =>
        pass
          ? `Expected header "${name}" not to match ${String(expected)}, but it was "${actual}".`
          : `Expected header "${name}" to match ${String(expected)} but received "${actual}".\n` +
            received.describe(),
    };
  },

  /** Asserts the round trip finished inside the SLA. */
  toRespondWithin(
    received: unknown,
    thresholdMs: number = config.timeouts.responseSla,
  ): MatcherResult {
    assertIsApiResponse(received, 'toRespondWithin');
    const pass = received.durationMs <= thresholdMs;

    return {
      name: 'toRespondWithin',
      pass,
      expected: `<= ${thresholdMs}ms`,
      actual: `${received.durationMs}ms`,
      message: () =>
        pass
          ? `Expected the response to take longer than ${thresholdMs}ms, but it took ${received.durationMs}ms.`
          : `Response SLA breached: ${received.request.method} ${received.request.path} took ` +
            `${received.durationMs}ms, budget is ${thresholdMs}ms.\n` +
            `Tune the budget with RESPONSE_SLA_MS if this reflects the environment, not a regression.`,
    };
  },

  /** Validates a value - or an ApiResponse body - against a JSON Schema. */
  toMatchJsonSchema(received: unknown, schema: IdentifiedSchema | object): MatcherResult {
    const isResponse = received instanceof ApiResponse;

    if (isResponse && !received.hasJsonBody) {
      return {
        name: 'toMatchJsonSchema',
        pass: false,
        message: () => `Cannot validate a schema against a non-JSON body.\n${received.describe()}`,
      };
    }

    const data = isResponse ? received.body : received;
    const result = validateAgainstSchema(data, schema);
    const context = isResponse ? `\n${received.describe()}` : '';

    return {
      name: 'toMatchJsonSchema',
      pass: result.valid,
      expected: result.schemaTitle,
      actual: data,
      message: () =>
        result.valid
          ? `Expected the payload not to match schema "${result.schemaTitle}", but it did.`
          : `${formatViolations(result)}${context}`,
    };
  },

  /** Compares a payload against its recorded contract snapshot. */
  toMatchApiContract(received: unknown, options: ContractOptions): MatcherResult {
    const isResponse = received instanceof ApiResponse;
    const data = isResponse ? received.body : received;
    const result = verifyContract(data, options);
    const pass = result.status !== 'changed';

    return {
      name: 'toMatchApiContract',
      pass,
      expected: `contract "${options.name}"`,
      actual: result.status,
      message: () =>
        pass
          ? `Expected contract "${options.name}" to have changed, but it still matches.`
          : formatContractResult(result),
    };
  },
});
