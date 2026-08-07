/**
 * Pure comparison predicates for the Cart domain.
 *
 * Kept out of the test bodies so specs stay branch-free: a test states an
 * expectation about a named predicate rather than assembling boolean logic
 * inline, which keeps the intent readable and satisfies the
 * no-conditional-in-test rule.
 */
import type { Cart, CartPayload } from '@/api/types/cart';

/** True when a retrieved cart carries exactly the data the payload asked for. */
export function cartMatchesPayload(cart: Cart | null | undefined, payload: CartPayload): boolean {
  if (cart === null || cart === undefined) return false;

  return (
    cart.userId === payload.userId &&
    JSON.stringify(cart.products) === JSON.stringify(payload.products)
  );
}
