/**
 * Fluent builder for cart payloads.
 *
 * Tests state only the field that matters to them and inherit a valid default
 * for everything else, so the intent of a test is visible in its diff from the
 * default. The `withRaw` escape hatch lets negative tests produce deliberately
 * invalid payloads without a second, parallel builder.
 */
import { SeedData } from '@/config/constants';
import type { CartLineItem, CartPayload } from '@/api/types/cart';

/** Fixed date keeps payloads deterministic and diffs readable. */
export const DEFAULT_CART_DATE = '2024-01-15';

export class CartPayloadBuilder {
  private userId: number = SeedData.USER_WITH_CARTS;
  private date: string = DEFAULT_CART_DATE;
  private products: CartLineItem[] = [{ productId: SeedData.MIN_PRODUCT_ID, quantity: 1 }];
  private overrides: Record<string, unknown> = {};

  static aCart(): CartPayloadBuilder {
    return new CartPayloadBuilder();
  }

  forUser(userId: number): this {
    this.userId = userId;
    return this;
  }

  onDate(date: string): this {
    this.date = date;
    return this;
  }

  /** Replaces the whole line-item list. */
  withProducts(products: CartLineItem[]): this {
    this.products = [...products];
    return this;
  }

  /** Replaces the list with a single line item. */
  withProduct(productId: number, quantity = 1): this {
    this.products = [{ productId, quantity }];
    return this;
  }

  addProduct(productId: number, quantity = 1): this {
    this.products = [...this.products, { productId, quantity }];
    return this;
  }

  withoutProducts(): this {
    this.products = [];
    return this;
  }

  /**
   * Sets or removes an arbitrary field, bypassing type checks.
   * Reserved for negative tests - pass `undefined` to delete a required field.
   */
  withRaw(field: string, value: unknown): this {
    this.overrides = { ...this.overrides, [field]: value };
    return this;
  }

  /** Builds a well-typed payload. Use for positive tests. */
  build(): CartPayload {
    return { userId: this.userId, date: this.date, products: [...this.products] };
  }

  /**
   * Builds the payload including any raw overrides, dropping fields set to
   * `undefined`. Use for negative tests.
   */
  buildRaw(): Record<string, unknown> {
    const payload: Record<string, unknown> = { ...this.build(), ...this.overrides };

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) delete payload[key];
    }
    return payload;
  }
}

export const aCart = CartPayloadBuilder.aCart;
