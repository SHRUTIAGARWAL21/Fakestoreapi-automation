/**
 * Business-rule assertions for the Cart domain.
 *
 * These encode what a cart *means* - a positive integer id, line items that
 * reference real products, quantities that make commercial sense - rather than
 * what its JSON happens to look like. Schema validation and business validation
 * are complementary: a payload can be schema-valid and still nonsense.
 */
import { SeedData } from '@/config/constants';
import type { Cart, CartLineItem, CartPayload, CartWriteResult } from '@/api/types/cart';
import { expect } from './matchers';

/** Asserts the invariants every stored cart must satisfy. */
export function assertValidCart(cart: Cart): void {
  expect(cart.id, 'cart id must be a positive integer').toBeGreaterThan(0);
  expect(Number.isInteger(cart.id), `cart id must be an integer, got ${cart.id}`).toBe(true);

  expect(cart.userId, 'cart must belong to a user').toBeGreaterThan(0);

  expect(
    Number.isNaN(Date.parse(cart.date)),
    `cart.date must be a parseable date, got "${cart.date}"`,
  ).toBe(false);

  expect(Array.isArray(cart.products), 'cart.products must be an array').toBe(true);
  cart.products.forEach(assertValidLineItem);
}

/** Asserts a single line item is commercially sane. */
export function assertValidLineItem(item: CartLineItem): void {
  expect(
    Number.isInteger(item.productId) && item.productId > 0,
    `productId must be a positive integer, got ${JSON.stringify(item.productId)}`,
  ).toBe(true);

  expect(
    Number.isInteger(item.quantity) && item.quantity > 0,
    `quantity must be a positive integer, got ${JSON.stringify(item.quantity)}`,
  ).toBe(true);
}

/** Asserts every referenced product id falls inside the seeded catalogue. */
export function assertProductsAreInCatalogue(cart: Cart): void {
  for (const item of cart.products) {
    expect(
      item.productId,
      `cart ${cart.id} references productId ${item.productId}, outside the seeded catalogue ` +
        `(${SeedData.MIN_PRODUCT_ID}-${SeedData.MAX_PRODUCT_ID})`,
    ).toBeLessThanOrEqual(SeedData.MAX_PRODUCT_ID);
    expect(item.productId).toBeGreaterThanOrEqual(SeedData.MIN_PRODUCT_ID);
  }
}

/**
 * Asserts a write endpoint echoed the payload faithfully.
 *
 * This is the strongest round-trip check available on an API that does not
 * persist writes: the response must reflect exactly what was sent.
 */
export function assertEchoesPayload(result: CartWriteResult, payload: CartPayload): void {
  expect(result.userId, 'response must echo the userId that was sent').toBe(payload.userId);
  expect(result.date, 'response must echo the date that was sent').toBe(payload.date);
  expect(result.products, 'response must echo the products that were sent').toEqual(
    payload.products,
  );
}

/** Asserts a collection is sorted by id in the requested direction. */
export function assertSortedById(carts: Cart[], direction: 'asc' | 'desc'): void {
  const ids = carts.map((cart) => cart.id);
  const expected = [...ids].sort((a, b) => (direction === 'asc' ? a - b : b - a));

  expect(ids, `carts must be sorted by id ${direction}, received [${ids.join(', ')}]`).toEqual(
    expected,
  );
}

/** Asserts every cart in the collection belongs to the given user. */
export function assertAllBelongToUser(carts: Cart[], userId: number): void {
  const foreign = carts.filter((cart) => cart.userId !== userId);

  expect(
    foreign.map((cart) => `cart ${cart.id} -> user ${cart.userId}`),
    `every cart returned for user ${userId} must belong to that user`,
  ).toEqual([]);
}

/** Asserts every cart in a collection is unique by id. */
export function assertUniqueIds(carts: Cart[]): void {
  const ids = carts.map((cart) => cart.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  expect(
    duplicates,
    `collection must not repeat cart ids, found [${duplicates.join(', ')}]`,
  ).toEqual([]);
}
