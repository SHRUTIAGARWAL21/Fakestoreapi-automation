/**
 * POST /auth/login
 *
 * Covers the happy path, the two distinct failure modes the API implements
 * (wrong credentials vs. absent credentials), and the shape of the token it
 * issues.
 */
import { HttpStatus, MediaType, Tag } from '@/config/constants';
import { decodeJwtClaims, isJwtShaped } from '@/api/clients';
import {
  INVALID_CREDENTIALS_DATASETS,
  MISSING_CREDENTIALS_DATASETS,
} from '@/data/datasets/auth.datasets';
import { authTokenSchema, jwtClaimsSchema } from '@/schemas';
import { assertResponseEnvelope, expect } from '@/assertions';
import { recordDeviation } from '@/support/deviations';
import { config, test } from '@tests/fixtures/api.fixture';

test.describe('POST /auth/login', () => {
  test.describe('valid credentials', { tag: [Tag.AUTH, Tag.POSITIVE, Tag.SMOKE] }, () => {
    test('issues a JWT for a known user', async ({ api }) => {
      // Arrange - credentials come from configuration, never hardcoded.
      const credentials = config.credentials;

      // Act
      const response = await api.auth.login(credentials);

      // Assert
      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: authTokenSchema,
      });
      expect(isJwtShaped(response.body.token), 'the token must be a three-segment JWT').toBe(true);
    });

    test('embeds the authenticated user in the token claims', async ({ api }) => {
      const response = await api.auth.login(config.credentials);
      expect(response).toHaveStatus(HttpStatus.CREATED);

      const claims = decodeJwtClaims(response.body.token);

      expect(claims).toMatchJsonSchema(jwtClaimsSchema);
      expect(claims.user, 'the token must identify the user that logged in').toBe(
        config.credentials.username,
      );
      expect(claims.sub, 'the subject claim must be a real user id').toBeGreaterThan(0);
    });

    test('issues a token whose issued-at is current', async ({ api }) => {
      const beforeLogin = Math.floor(Date.now() / 1000);

      const response = await api.auth.login(config.credentials);
      expect(response).toHaveStatus(HttpStatus.CREATED);

      const claims = decodeJwtClaims(response.body.token);
      // Allow a minute of clock skew between the runner and the API host.
      const skewSeconds = 60;

      expect(
        claims.iat,
        `token iat ${claims.iat} is not close to the request time ${beforeLogin}`,
      ).toBeGreaterThanOrEqual(beforeLogin - skewSeconds);
      expect(claims.iat).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + skewSeconds);
    });

    test('does not echo the password back to the caller', async ({ api }) => {
      const response = await api.auth.login(config.credentials);

      expect(response).toHaveStatus(HttpStatus.CREATED);
      expect(
        response.rawBody.includes(config.credentials.password),
        'the response body must never contain the submitted password',
      ).toBe(false);
    });
  });

  test.describe('invalid credentials', { tag: [Tag.AUTH, Tag.NEGATIVE] }, () => {
    for (const dataset of INVALID_CREDENTIALS_DATASETS) {
      test(`rejects ${dataset.name}`, async ({ api }) => {
        const response = await api.auth.login(dataset.credentials);

        assertResponseEnvelope(response, {
          status: dataset.expectedStatus,
          contentType: null,
          expectJsonBody: false,
        });
        expect(
          response.rawBody.toLowerCase(),
          'the error must explain why authentication failed',
        ).toContain(dataset.expectedMessage);
      });
    }

    test('does not disclose whether the username exists', async ({ api }) => {
      // User enumeration check: a wrong password and an unknown user must be
      // indistinguishable to an attacker.
      const wrongPassword = await api.auth.login({
        username: config.credentials.username,
        password: 'wrong-password-entirely',
      });
      const unknownUser = await api.auth.login({
        username: 'user_that_does_not_exist',
        password: 'wrong-password-entirely',
      });

      expect(unknownUser.status, 'both failure modes must share a status code').toBe(
        wrongPassword.status,
      );
      expect(unknownUser.rawBody.trim(), 'both failure modes must share a message').toBe(
        wrongPassword.rawBody.trim(),
      );
    });
  });

  test.describe('missing credentials', { tag: [Tag.AUTH, Tag.NEGATIVE] }, () => {
    for (const dataset of MISSING_CREDENTIALS_DATASETS) {
      test(`rejects ${dataset.name}`, async ({ api }) => {
        const response = await api.auth.login(dataset.credentials);

        assertResponseEnvelope(response, {
          status: dataset.expectedStatus,
          contentType: null,
          expectJsonBody: false,
        });
        expect(response.rawBody.toLowerCase()).toContain(dataset.expectedMessage);
      });
    }

    test('rejects a malformed JSON body', async ({ api }) => {
      const response = await api.auth.loginRaw('{"username": "someone", ');

      assertResponseEnvelope(response, {
        status: HttpStatus.BAD_REQUEST,
        contentType: null,
        expectJsonBody: false,
      });
    });
  });

  test.describe('documented gaps', { tag: [Tag.AUTH, Tag.NEGATIVE, Tag.DEVIATION] }, () => {
    test('returns auth errors as text/html rather than JSON', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_ERRORS_ARE_NOT_JSON');

      const response = await api.auth.login({ username: 'nobody', password: 'nothing' });

      expect(response).toHaveStatus(HttpStatus.UNAUTHORIZED);
      expect(response).toHaveContentType(MediaType.HTML);
      expect(
        response.hasJsonBody,
        `${deviation.id}: the error body is unparseable by a JSON client`,
      ).toBe(false);
    });

    test('issues tokens with no expiry claim', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'ISSUED_TOKENS_HAVE_NO_EXPIRY');

      const response = await api.auth.login(config.credentials);
      expect(response).toHaveStatus(HttpStatus.CREATED);

      const claims = decodeJwtClaims(response.body.token);

      expect(
        claims.exp,
        `${deviation.id}: the issued token never expires, so a leak is permanent`,
      ).toBeUndefined();
    });
  });
});
