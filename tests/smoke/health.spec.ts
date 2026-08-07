/**
 * Smoke suite - the fastest possible answer to "is the API worth testing right
 * now?". Run first in CI so an outage fails in seconds instead of minutes.
 */
import { HttpStatus, SeedData, Tag } from '@/config/constants';
import { cartListSchema, cartSchema } from '@/schemas';
import { assertResponseEnvelope, assertValidCart, expect } from '@/assertions';
import { test } from '@tests/fixtures/api.fixture';

test.describe('API health', { tag: [Tag.SMOKE] }, () => {
  test('the carts collection is reachable and well formed', async ({ api }) => {
    // Arrange - no setup: this is a read of seeded data.

    // Act
    const response = await api.carts.getAll();

    // Assert
    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    expect(response.body.length, 'the seeded catalogue must not be empty').toBeGreaterThan(0);
  });

  test('a seeded cart can be fetched by id', async ({ api }) => {
    const response = await api.carts.getById(SeedData.FIRST_CART_ID);

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });
    assertValidCart(response.body!);
    expect(response.body!.id).toBe(SeedData.FIRST_CART_ID);
  });

  test('credentials in the active environment are valid', async ({ authToken }) => {
    expect(authToken, 'the configured credentials must produce a token').toMatch(
      /^[\w-]+\.[\w-]+\.[\w-]+$/,
    );
  });
});
