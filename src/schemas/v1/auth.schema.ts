/** JSON Schemas for authentication responses, contract version v1. */

export const authTokenSchema = {
  $id: 'https://fakestoreapi.test/schemas/v1/auth-token.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'AuthTokenResponse',
  type: 'object',
  required: ['token'],
  additionalProperties: false,
  properties: {
    // Three base64url segments - rejects both empty strings and opaque tokens.
    token: { type: 'string', pattern: '^[\\w-]+\\.[\\w-]+\\.[\\w-]+$' },
  },
} as const;

export const jwtClaimsSchema = {
  $id: 'https://fakestoreapi.test/schemas/v1/jwt-claims.json',
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'JwtClaims',
  type: 'object',
  required: ['sub', 'user', 'iat'],
  additionalProperties: true,
  properties: {
    sub: { type: 'integer', minimum: 1 },
    user: { type: 'string', minLength: 1 },
    iat: { type: 'integer', minimum: 0 },
    exp: { type: 'integer', minimum: 0 },
  },
} as const;
