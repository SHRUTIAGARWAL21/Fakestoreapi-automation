/**
 * Typed, validated access to the process environment.
 *
 * This is the ONLY module permitted to read `process.env` (enforced by an
 * ESLint rule). Everything else consumes the resolved `config` object, so a
 * missing or malformed variable fails once, loudly, at startup - never halfway
 * through a test run.
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv();

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`Invalid test configuration: ${message}`);
    this.name = 'ConfigurationError';
  }
}

function raw(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

export function str(name: string, fallback: string): string {
  return raw(name) ?? fallback;
}

export function int(name: string, fallback: number): number {
  const value = raw(name);
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ConfigurationError(`${name} must be a non-negative integer, received "${value}".`);
  }
  return parsed;
}

export function bool(name: string, fallback: boolean): boolean {
  const value = raw(name)?.toLowerCase();
  if (value === undefined) return fallback;
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;

  throw new ConfigurationError(`${name} must be a boolean-like value, received "${value}".`);
}

export function oneOf<const T extends readonly string[]>(
  name: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = raw(name);
  if (value === undefined) return fallback;
  if (!allowed.includes(value)) {
    throw new ConfigurationError(`${name} must be one of [${allowed.join(', ')}], got "${value}".`);
  }
  return value as T[number];
}

/** True when running inside a CI runner - used to pick stricter defaults. */
export const isCI = bool('CI', false);
