/**
 * PUT /carts/:id
 *
 * The API treats PUT as a pure echo: it reflects the payload with the path id
 * applied, without persisting anything or validating the body. Tests assert the
 * echo contract and register the validation gap.
 */
import { HttpStatus, NON_EXISTENT_CART_ID, SeedData, Tag } from '@/config/constants';
import { aCart } from '@/data/builders/cart-payload.builder';
import { MALFORMED_BODY_DATASETS, MALFORMED_ID_DATASETS } from '@/data/datasets/cart.datasets';
import { apiErrorSchema, cartWriteResultSchema, strictCartWriteResultSchema } from '@/schemas';
import { assertEchoesPayload, assertResponseEnvelope, expect } from '@/assertions';
import { recordDeviation } from '@/support/deviations';
import { test } from '@tests/fixtures/api.fixture';

const TARGET_CART_ID = SeedData.FIRST_CART_ID;

test.describe('PUT /carts/:id', () => {
  test.describe('valid updates', { tag: [Tag.POSITIVE] }, () => {
    test('updates an existing cart and echoes the new state', async ({ api }) => {
      // Arrange
      const payload = aCart().forUser(4).onDate('2024-03-01').withProduct(6, 2).build();

      // Act
      const response = await api.carts.update(TARGET_CART_ID, payload);

      // Assert
      assertResponseEnvelope(response, {
        status: HttpStatus.OK,
        schema: strictCartWriteResultSchema,
      });
      expect(response.body.id, 'the path id must win over anything in the body').toBe(
        TARGET_CART_ID,
      );
      assertEchoesPayload(response.body, payload);
    });

    test('changes the quantity of an existing line item', async ({ api }) => {
      const newQuantity = 42;
      const payload = aCart().withProduct(1, newQuantity).build();

      const response = await api.carts.update(TARGET_CART_ID, payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.OK,
        schema: strictCartWriteResultSchema,
      });
      expect(response.body.products, 'the updated quantity must be reflected').toEqual([
        { productId: 1, quantity: newQuantity },
      ]);
    });

    test('replaces the entire product list', async ({ api }) => {
      // PUT is a full replacement, not a merge: the previous items must vanish.
      const payload = aCart()
        .withProducts([
          { productId: 11, quantity: 1 },
          { productId: 13, quantity: 9 },
        ])
        .build();

      const response = await api.carts.update(TARGET_CART_ID, payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.OK,
        schema: strictCartWriteResultSchema,
      });
      expect(response.body.products, 'PUT must replace rather than merge').toEqual(
        payload.products,
      );
    });

    test('empties a cart by sending an empty product list', async ({ api }) => {
      const payload = aCart().withoutProducts().build();

      const response = await api.carts.update(TARGET_CART_ID, payload);

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartWriteResultSchema });
      expect(response.body.products, 'clearing a cart must be expressible').toEqual([]);
    });

    test('reassigns a cart to a different user', async ({ api }) => {
      const newOwner = 8;
      const payload = aCart().forUser(newOwner).build();

      const response = await api.carts.update(TARGET_CART_ID, payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.OK,
        schema: strictCartWriteResultSchema,
      });
      expect(response.body.userId).toBe(newOwner);
    });
  });

  test.describe('invalid input', { tag: [Tag.NEGATIVE] }, () => {
    for (const dataset of MALFORMED_ID_DATASETS) {
      test(`rejects the unparseable id ${dataset.name}`, async ({ api }) => {
        const response = await api.carts.update(dataset.id, aCart().build());

        assertResponseEnvelope(response, {
          status: HttpStatus.BAD_REQUEST,
          schema: apiErrorSchema,
        });
      });
    }

    for (const dataset of MALFORMED_BODY_DATASETS) {
      test(`rejects ${dataset.name}`, async ({ api }) => {
        const response = await api.carts.updateRaw(TARGET_CART_ID, dataset.rawBody);

        assertResponseEnvelope(response, {
          status: HttpStatus.BAD_REQUEST,
          contentType: null,
          expectJsonBody: false,
        });
      });
    }
  });

  test.describe('documented gaps', { tag: [Tag.NEGATIVE, Tag.DEVIATION] }, () => {
    test('accepts an empty update instead of rejecting it', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'NO_PAYLOAD_VALIDATION');

      const response = await api.carts.update(TARGET_CART_ID, {});

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartWriteResultSchema });
      expect(
        response.body,
        `${deviation.id}: an empty update returned only the id rather than 400`,
      ).toEqual({ id: TARGET_CART_ID });
    });

    test('accepts an update with no body at all', async ({ api }, testInfo) => {
      recordDeviation(testInfo, 'NO_PAYLOAD_VALIDATION');

      const response = await api.carts.update(TARGET_CART_ID, undefined);

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartWriteResultSchema });
      expect(response.body.id).toBe(TARGET_CART_ID);
    });

    test('accepts fields of entirely the wrong type', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'NO_PAYLOAD_VALIDATION');
      const payload = aCart()
        .withRaw('userId', 'not-a-number')
        .withRaw('date', 12345)
        .withRaw('products', { nope: true })
        .buildRaw();

      const response = await api.carts.update(TARGET_CART_ID, payload);

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartWriteResultSchema });
      expect(
        response.body.userId,
        `${deviation.id}: a string userId was accepted and echoed back`,
      ).toBe('not-a-number');
      expect(response.body.date).toBe(12345);
    });

    test('accepts a negative quantity', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'NO_PAYLOAD_VALIDATION');
      const payload = aCart()
        .withRaw('products', [{ productId: 1, quantity: -10 }])
        .buildRaw();

      const response = await api.carts.update(TARGET_CART_ID, payload);

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartWriteResultSchema });
      expect(
        response.body.products,
        `${deviation.id}: a negative quantity was stored verbatim`,
      ).toEqual([{ productId: 1, quantity: -10 }]);
    });

    test('creates an echo for a non-existent cart rather than returning 404', async ({
      api,
    }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');
      const payload = aCart().build();

      const response = await api.carts.update(NON_EXISTENT_CART_ID, payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.OK,
        schema: strictCartWriteResultSchema,
      });
      expect(
        response.body.id,
        `${deviation.id}: PUT to an unknown id echoed that id instead of 404`,
      ).toBe(NON_EXISTENT_CART_ID);
    });
  });
});
