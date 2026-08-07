/**
 * Data-driven cart coverage.
 *
 * One test body, many datasets. Adding a product, a quantity boundary or a
 * whole new permutation is an edit to `cart.datasets.ts` - never a copy-paste
 * of a test. The dataset name becomes the test title, so a failure names the
 * exact case without opening the file.
 */
import { HttpStatus, SeedData, Tag } from '@/config/constants';
import { aCart } from '@/data/builders/cart-payload.builder';
import { MULTI_PRODUCT_DATASETS, PRODUCT_DATASETS } from '@/data/datasets/cart.datasets';
import { strictCartWriteResultSchema } from '@/schemas';
import { assertEchoesPayload, assertResponseEnvelope, expect } from '@/assertions';
import { test } from '@tests/fixtures/api.fixture';

test.describe('Cart creation across products', { tag: [Tag.DATA_DRIVEN, Tag.POSITIVE] }, () => {
  for (const dataset of PRODUCT_DATASETS) {
    test(`creates a cart for the ${dataset.name} (product ${dataset.productId} x${dataset.quantity})`, async ({
      api,
    }) => {
      // Arrange
      const payload = aCart()
        .forUser(dataset.userId)
        .withProduct(dataset.productId, dataset.quantity)
        .build();

      // Act
      const response = await api.carts.create(payload);

      // Assert
      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: strictCartWriteResultSchema,
      });
      assertEchoesPayload(response.body, payload);
      expect(response.body.products, 'the line item must survive the round trip').toEqual([
        { productId: dataset.productId, quantity: dataset.quantity },
      ]);
    });
  }
});

test.describe('Cart updates across products', { tag: [Tag.DATA_DRIVEN, Tag.POSITIVE] }, () => {
  for (const dataset of PRODUCT_DATASETS) {
    test(`updates a cart to hold the ${dataset.name}`, async ({ api }) => {
      const payload = aCart()
        .forUser(dataset.userId)
        .withProduct(dataset.productId, dataset.quantity)
        .build();

      const response = await api.carts.update(SeedData.FIRST_CART_ID, payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.OK,
        schema: strictCartWriteResultSchema,
      });
      expect(response.body.id).toBe(SeedData.FIRST_CART_ID);
      assertEchoesPayload(response.body, payload);
    });
  }
});

test.describe('Referenced products resolve', { tag: [Tag.DATA_DRIVEN] }, () => {
  for (const dataset of PRODUCT_DATASETS) {
    test(`product ${dataset.productId} exists in the catalogue`, async ({ api }) => {
      // Guards the datasets themselves: a cart test asserting on product 20 is
      // meaningless if the catalogue no longer contains product 20.
      const response = await api.products.getById(dataset.productId);

      assertResponseEnvelope(response, { status: HttpStatus.OK });
      expect(
        response.body,
        `dataset references product ${dataset.productId}, which the catalogue no longer serves`,
      ).not.toBeNull();
      expect(response.body!.id).toBe(dataset.productId);
    });
  }
});

test.describe('Multi-product carts', { tag: [Tag.DATA_DRIVEN, Tag.POSITIVE] }, () => {
  for (const dataset of MULTI_PRODUCT_DATASETS) {
    test(`round-trips ${dataset.name}`, async ({ api }) => {
      const payload = aCart()
        .withProducts([...dataset.products])
        .build();

      const response = await api.carts.create(payload);

      assertResponseEnvelope(response, {
        status: HttpStatus.CREATED,
        schema: strictCartWriteResultSchema,
      });
      assertEchoesPayload(response.body, payload);
    });
  }
});
