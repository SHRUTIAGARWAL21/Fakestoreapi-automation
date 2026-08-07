/**
 * Authorisation enforcement on the cart endpoints.
 *
 * The API issues tokens that nothing subsequently verifies. Rather than skip
 * this area - which would leave a serious gap invisible - the suite probes each
 * enforcement point explicitly and registers FSA-004 for every one that fails
 * to enforce. The result is a precise, reviewable statement of the exposure.
 *
 * When authorisation is implemented, every assertion here fails and gets
 * inverted to the commented expectation beside it.
 */
import { EXPIRED_JWT, HttpStatus, MALFORMED_JWT, SeedData, Tag } from '@/config/constants';
import { aCart } from '@/data/builders/cart-payload.builder';
import { cartSchema, cartWriteResultSchema } from '@/schemas';
import { assertResponseEnvelope, expect } from '@/assertions';
import { recordDeviation } from '@/support/deviations';
import { test } from '@tests/fixtures/api.fixture';

/** Status codes a properly secured endpoint would return for a bad token. */
const REJECTION_STATUSES = [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN] as const;

test.describe('Authorisation on cart endpoints', { tag: [Tag.AUTH, Tag.NEGATIVE] }, () => {
  test('a valid token is accepted', { tag: [Tag.POSITIVE] }, async ({ api, authToken }) => {
    // The one assertion here that is not a deviation: a legitimate token must
    // never be rejected.
    const response = await api.carts.getById(SeedData.FIRST_CART_ID, { token: authToken });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });
  });

  test.describe('documented gaps', { tag: [Tag.DEVIATION] }, () => {
    test('reads succeed with no token at all', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      const response = await api.carts.getById(SeedData.FIRST_CART_ID);

      // Should be: expect(response).toHaveStatusIn(REJECTION_STATUSES)
      expect(
        response.status,
        `${deviation.id}: an unauthenticated read of cart data succeeded`,
      ).toBe(HttpStatus.OK);
      expect(response).not.toHaveStatusIn(REJECTION_STATUSES);
    });

    test('reads succeed with a malformed token', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      const response = await api.carts.getById(SeedData.FIRST_CART_ID, { token: MALFORMED_JWT });

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });
      expect(
        response.status,
        `${deviation.id}: "${MALFORMED_JWT}" was accepted as a bearer token`,
      ).not.toBe(HttpStatus.UNAUTHORIZED);
    });

    test('reads succeed with an expired token', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      // A structurally valid JWT whose `exp` claim elapsed in 2001.
      const response = await api.carts.getById(SeedData.FIRST_CART_ID, { token: EXPIRED_JWT });

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });
      expect(
        response.status,
        `${deviation.id}: a token that expired in 2001 was accepted`,
      ).not.toBe(HttpStatus.UNAUTHORIZED);
    });

    test('creates succeed with no token', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      const response = await api.carts.create(aCart().build());

      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: cartWriteResultSchema,
      });
      expect(response.status, `${deviation.id}: an anonymous caller created a cart`).not.toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });

    test('updates succeed with an expired token', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      const response = await api.carts.update(SeedData.FIRST_CART_ID, aCart().build(), {
        token: EXPIRED_JWT,
      });

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartWriteResultSchema });
      expect(
        response.status,
        `${deviation.id}: an expired token was allowed to mutate a cart`,
      ).not.toBe(HttpStatus.UNAUTHORIZED);
    });

    test('deletes succeed with a malformed token', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      const response = await api.carts.remove(SeedData.CART_IDS[5], { token: MALFORMED_JWT });

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });
      expect(
        response.status,
        `${deviation.id}: a garbage token was allowed to delete a cart`,
      ).not.toBe(HttpStatus.UNAUTHORIZED);
    });

    test("one user's token can read another user's carts", async ({ api, authToken }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      // The configured user is not user 1; a correct API would scope this.
      const foreignUserId = 1;
      const response = await api.carts.getByUser(foreignUserId, {}, { token: authToken });

      assertResponseEnvelope(response, { status: HttpStatus.OK });
      expect(
        response.status,
        `${deviation.id}: horizontal privilege escalation - any token reads any user's carts`,
      ).toBe(HttpStatus.OK);
    });
  });
});
