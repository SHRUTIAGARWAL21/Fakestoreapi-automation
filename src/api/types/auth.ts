/** Domain types for authentication. */

export interface Credentials {
  username: string;
  password: string;
}

export interface AuthTokenResponse {
  token: string;
}

/** Claims the sandbox API embeds in the issued JWT. */
export interface JwtClaims {
  sub: number;
  user: string;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. Absent on tokens issued by this API. */
  exp?: number;
}
