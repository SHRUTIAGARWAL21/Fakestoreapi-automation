/**
 * POST /carts
 *
 * The API does not persist writes, so the strongest available round-trip
 * assertion is that the response echoes the payload faithfully. Persistence is
 * covered - and its absence documented - in lifecycle.spec.ts.
 */
import { HttpStatus, MediaType, SeedData, Tag } from '@/config/constants';
import { aCart } from '@/data/builders/cart-payload.builder';
import {
  INVALID_PAYLOAD_DATASETS,
  MALFORMED_BODY_DATASETS,
  MULTI_PRODUCT_DATASETS,
} from '@/data/datasets/cart.datasets';
import { cartWriteResultSchema, strictCartWriteResultSchema } from '@/schemas';
import { assertEchoesPayload, assertResponseEnvelope, expect } from '@/assertions';
import { recordDeviation } from '@/support/deviations';
import { test } from '@tests/fixtures/api.fixture';

test.describe('POST /carts', () => {
  test.describe('valid payloads', { tag: [Tag.POSITIVE] }, () => {
    test('creates a cart from a minimal valid payload', async ({ api }) => {
      // Arrange
      const payload = aCart().forUser(SeedData.USER_WITH_CARTS).withProduct(1, 2).build();

      // Act
      const response = await api.carts.create(payload);

      // Assert
      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: strictCartWriteResultSchema,
      });
      assertEchoesPayload(response.body, payload);
      expect(response.body.id, 'a created cart must be assigned an id').toBeGreaterThan(0);
    });

    for (const dataset of MULTI_PRODUCT_DATASETS) {
      test(`creates a cart containing ${dataset.name}`, async ({ api }) => {
        const payload = aCart()
          .withProducts([...dataset.products])
          .build();

        const response = await api.carts.create(payload);

        assertResponseEnvelope(response, {
          status: HttpStatus.CREATED,
          schema: strictCartWriteResultSchema,
        });
        assertEchoesPayload(response.body, payload);
        expect(
          response.body.products as unknown[],
          'every submitted line item must be returned',
        ).toHaveLength(dataset.products.length);
      });
    }

    test('accepts a cart with the same product listed twice', async ({ api }) => {
      // A duplicate line item is a legitimate client behaviour (add-to-cart
      // twice without merging) and must not be silently collapsed.
      const payload = aCart().withProduct(3, 1).addProduct(3, 4).build();

      const response = await api.carts.create(payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: cartWriteResultSchema,
      });
      assertEchoesPayload(response.body, payload);
    });

    test('accepts an explicitly empty product list', async ({ api }) => {
      const payload = aCart().withoutProducts().build();

      const response = await api.carts.create(payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: cartWriteResultSchema,
      });
      expect(response.body.products, 'an empty cart must round-trip as an empty array').toEqual([]);
    });
  });

  test.describe('invalid payloads', { tag: [Tag.NEGATIVE, Tag.DEVIATION] }, () => {
    for (const dataset of INVALID_PAYLOAD_DATASETS) {
      test(`accepts ${dataset.name} without validation`, async ({ api }, testInfo) => {
        // Arrange - document the gap between the ideal contract and reality.
        const deviation = recordDeviation(testInfo, dataset.deviation);

        // Act
        const response = await api.carts.create(dataset.payload);

        // Assert - on the observed behaviour, so this test turns red the day
        // the API starts validating and the deviation can be retired.
        assertResponseEnvelope(response, {
          status: dataset.expectedStatus,
          schema: cartWriteResultSchema,
        });
        expect(
          response.body.id,
          `${deviation.id}: an id was issued for an invalid payload`,
        ).toBeGreaterThan(0);
      });
    }

    for (const dataset of MALFORMED_BODY_DATASETS) {
      test(`rejects ${dataset.name}`, async ({ api }) => {
        // Malformed JSON is one of the few cases the API does reject, because
        // the body parser fails before any handler runs.
        const response = await api.carts.createRaw(dataset.rawBody);

        assertResponseEnvelope(response, {
          status: HttpStatus.BAD_REQUEST,
          contentType: null,
          expectJsonBody: false,
        });
      });
    }

    test('ignores a mismatched Content-Type and drops the body', async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'NO_PAYLOAD_VALIDATION');
      const payload = aCart().build();

      const response = await api.carts.create(payload, {
        headers: { 'content-type': MediaType.TEXT },
      });

      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: cartWriteResultSchema,
      });
      expect(
        response.body.userId,
        `${deviation.id}: a text/plain body is silently discarded rather than rejected with 415`,
      ).toBeUndefined();
    });
  });
});
