/** Authentication endpoints plus JWT inspection helpers. */
import { Routes } from '@/api/routes';
import type { AuthTokenResponse, Credentials, JwtClaims } from '@/api/types/auth';
import type { ApiResponse } from '@/core/api-response';
import { BaseClient } from './base.client';
import type { RequestOverrides } from './cart.client';

export class AuthClient extends BaseClient {
  /** POST /auth/login */
  login(
    credentials: Partial<Credentials> | undefined,
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<AuthTokenResponse>> {
    return this.http.post<AuthTokenResponse>(Routes.auth.login(), {
      ...(credentials === undefined ? {} : { json: credentials }),
      ...overrides,
    });
  }

  /** POST /auth/login with an unserialised body. */
  loginRaw(rawBody: string, overrides: RequestOverrides = {}): Promise<ApiResponse<unknown>> {
    return this.http.post(Routes.auth.login(), { rawBody, ...overrides });
  }

  /**
   * Logs in and returns the bearer token.
   * Throws with the full exchange attached when the API refuses - a failed
   * precondition should never surface as a confusing `undefined` downstream.
   */
  async loginAndGetToken(credentials: Credentials): Promise<string> {
    const response = await this.login(credentials);

    if (response.status !== 201 || !response.hasJsonBody) {
      throw new Error(
        `Login precondition failed for user "${credentials.username}".\n${response.describe()}`,
      );
    }

    const token = response.body.token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new Error(`Login returned no usable token.\n${response.describe()}`);
    }
    return token;
  }
}

/** True when the string is shaped like a JWT (three base64url segments). */
export function isJwtShaped(token: string): boolean {
  const segments = token.split('.');
  return (
    segments.length === 3 && segments.every((part) => /^[\w-]+$/.test(part) && part.length > 0)
  );
}

/**
 * Decodes the JWT payload without verifying the signature.
 * Verification is the API's job; the suite only asserts on claim content.
 */
export function decodeJwtClaims(token: string): JwtClaims {
  const payload = token.split('.')[1];
  if (payload === undefined) {
    throw new Error(`Token is not a JWT - expected 3 dot-separated segments, got "${token}".`);
  }

  const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = Buffer.from(normalised, 'base64').toString('utf8');

  try {
    return JSON.parse(decoded) as JwtClaims;
  } catch (error) {
    throw new Error(`JWT payload is not valid JSON: ${(error as Error).message}`);
  }
}
