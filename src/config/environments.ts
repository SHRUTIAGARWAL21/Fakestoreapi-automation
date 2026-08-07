/**
 * Environment catalogue + the resolved runtime configuration.
 *
 * Adding a new environment is a one-entry change to `ENVIRONMENTS`; nothing
 * else in the framework needs to know an environment exists.
 */
import { bool, int, isCI, oneOf, str } from './env';

export const ENVIRONMENT_NAMES = ['local', 'staging', 'production'] as const;
export type EnvironmentName = (typeof ENVIRONMENT_NAMES)[number];

export interface EnvironmentDefinition {
  readonly name: EnvironmentName;
  readonly baseUrl: string;
  /** Documented, non-secret demo credentials shipped with the sandbox API. */
  readonly credentials: { readonly username: string; readonly password: string };
}

const ENVIRONMENTS: Record<EnvironmentName, EnvironmentDefinition> = {
  local: {
    name: 'local',
    baseUrl: 'http://localhost:3000',
    credentials: { username: 'mor_2314', password: '83r5^_' },
  },
  staging: {
    name: 'staging',
    baseUrl: 'https://fakestoreapi.com',
    credentials: { username: 'mor_2314', password: '83r5^_' },
  },
  production: {
    name: 'production',
    baseUrl: 'https://fakestoreapi.com',
    credentials: { username: 'mor_2314', password: '83r5^_' },
  },
};

export const LOG_LEVELS = ['silent', 'error', 'warn', 'info', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface RuntimeConfig {
  readonly environment: EnvironmentName;
  readonly baseUrl: string;
  readonly credentials: { readonly username: string; readonly password: string };
  readonly timeouts: {
    readonly request: number;
    readonly test: number;
    /** Default soft SLA for response-time assertions. */
    readonly responseSla: number;
  };
  readonly retries: { readonly count: number; readonly backoffMs: number };
  readonly logging: { readonly level: LogLevel; readonly attachAll: boolean };
  readonly contracts: { readonly update: boolean; readonly strict: boolean };
  readonly isCI: boolean;
}

function resolve(): RuntimeConfig {
  const environment = oneOf('TEST_ENV', ENVIRONMENT_NAMES, 'production');
  const definition = ENVIRONMENTS[environment];

  return {
    environment,
    baseUrl: str('BASE_URL', definition.baseUrl).replace(/\/+$/, ''),
    credentials: {
      username: str('AUTH_USERNAME', definition.credentials.username),
      password: str('AUTH_PASSWORD', definition.credentials.password),
    },
    timeouts: {
      request: int('REQUEST_TIMEOUT_MS', 30_000),
      test: int('TEST_TIMEOUT_MS', 60_000),
      /**
       * A guard against pathological slowness, not a latency benchmark.
       * Measured p99 is ~800ms, but this API is a shared sandbox behind a CDN
       * and occasionally has slow spells. A tight budget here would make
       * functional results depend on network weather; see the README.
       */
      responseSla: int('RESPONSE_SLA_MS', 10_000),
    },
    retries: {
      count: int('HTTP_RETRIES', 2),
      backoffMs: int('HTTP_RETRY_BACKOFF_MS', 400),
    },
    logging: {
      level: oneOf('LOG_LEVEL', LOG_LEVELS, isCI ? 'warn' : 'info'),
      attachAll: bool('ATTACH_ALL_LOGS', false),
    },
    contracts: {
      update: bool('UPDATE_CONTRACTS', false),
      strict: bool('CONTRACT_STRICT', false),
    },
    isCI,
  };
}

/** Frozen, process-wide runtime configuration. */
export const config: RuntimeConfig = Object.freeze(resolve());
