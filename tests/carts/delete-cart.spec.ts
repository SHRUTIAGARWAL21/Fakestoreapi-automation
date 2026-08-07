/**
 * DELETE /carts/:id
 *
 * Deletion is simulated: the API returns the cart it "deleted" and the cart
 * remains retrievable afterwards. These tests assert the observed contract and
 * register both the non-persistence and the missing-resource defects.
 */
import { HttpStatus, NON_EXISTENT_CART_ID, SeedData, Tag } from '@/config/constants';
import { MALFORMED_ID_DATASETS } from '@/data/datasets/cart.datasets';
import { apiErrorSchema, cartSchema } from '@/schemas';
import { assertResponseEnvelope, assertValidCart, expect } from '@/assertions';
import { recordDeviation } from '@/support/deviations';
import { test } from '@tests/fixtures/api.fixture';

test.describe('DELETE /carts/:id', () => {
  test('returns the deleted cart', { tag: [Tag.POSITIVE] }, async ({ api }) => {
    // Arrange - read first so the delete response can be compared against it.
    const cartId = SeedData.FIRST_CART_ID;
    const before = await api.carts.getById(cartId);
    expect(before).toHaveStatus(HttpStatus.OK);

    // Act
    const response = await api.carts.remove(cartId);

    // Assert
    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });

    const deleted = response.body!;
    assertValidCart(deleted);
    expect(deleted.id, 'the response must describe the cart that was deleted').toBe(cartId);
    expect(deleted, 'the deleted cart must match its pre-delete state').toEqual(before.body);
  });

  test.describe('invalid ids', { tag: [Tag.NEGATIVE] }, () => {
    for (const dataset of MALFORMED_ID_DATASETS) {
      test(`rejects the unparseable id ${dataset.name}`, async ({ api }) => {
        const response = await api.carts.remove(dataset.id);

        assertResponseEnvelope(response, {
          status: HttpStatus.BAD_REQUEST,
          schema: apiErrorSchema,
        });
        expect(response.bodyOrUndefined).toMatchObject({ status: 'error' });
      });
    }

    test(
      'returns 200 with a null body for a non-existent id',
      { tag: [Tag.DEVIATION] },
      async ({ api }, testInfo) => {
        const deviation = recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');

        const response = await api.carts.remove(NON_EXISTENT_CART_ID);

        assertResponseEnvelope(response, { status: HttpStatus.OK });
        expect(
          response.body,
          `${deviation.id}: deleting a missing cart reported success`,
        ).toBeNull();
      },
    );

    test(
      'returns 200 with a null body for id 0',
      { tag: [Tag.DEVIATION] },
      async ({ api }, testInfo) => {
        recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');

        const response = await api.carts.remove(0);

        assertResponseEnvelope(response, { status: HttpStatus.OK });
        expect(response.body).toBeNull();
      },
    );
  });

  test.describe('documented gaps', { tag: [Tag.NEGATIVE, Tag.DEVIATION] }, () => {
    test('is not idempotent in effect - a second delete succeeds identically', async ({
      api,
    }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'WRITES_ARE_NOT_PERSISTED');
      const cartId = SeedData.CART_IDS[1];

      const first = await api.carts.remove(cartId);
      const second = await api.carts.remove(cartId);

      assertResponseEnvelope(first, { status: HttpStatus.OK, schema: cartSchema });
      assertResponseEnvelope(second, { status: HttpStatus.OK, schema: cartSchema });
      expect(
        second.body,
        `${deviation.id}: the cart survived deletion, so the repeat returned the same body`,
      ).toEqual(first.body);
    });

    test('leaves the cart retrievable after deletion', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'WRITES_ARE_NOT_PERSISTED');
      const cartId = SeedData.CART_IDS[2];

      await api.carts.remove(cartId);
      const afterDelete = await api.carts.getById(cartId);

      assertResponseEnvelope(afterDelete, { status: HttpStatus.OK, schema: cartSchema });
      expect(
        afterDelete.body,
        `${deviation.id}: expected 404 after deletion, cart is still served`,
      ).not.toBeNull();
    });

    test('deletes without any credentials', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'AUTH_NOT_ENFORCED');

      // No Authorization header is sent at all.
      const response = await api.carts.remove(SeedData.CART_IDS[3]);

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });
      expect(response.status, `${deviation.id}: an unauthenticated delete succeeded`).not.toBe(
        HttpStatus.UNAUTHORIZED,
      );
    });
  });
});
