/**
 * Schema registry.
 *
 * Every schema in the active contract version is listed here exactly once.
 * The validator preloads this list into Ajv, which is what makes `$ref`
 * composition work and guarantees a schema is compiled a single time per
 * process regardless of how many tests use it.
 */
import { authTokenSchema, jwtClaimsSchema } from './v1/auth.schema';
import {
  cartLineItemSchema,
  cartListSchema,
  cartSchema,
  cartWriteResultSchema,
  strictCartWriteResultSchema,
} from './v1/cart.schema';
import { apiErrorSchema } from './v1/error.schema';
import { productSchema } from './v1/product.schema';

/** A JSON Schema document with a stable identity. */
export interface IdentifiedSchema {
  readonly $id: string;
  readonly [keyword: string]: unknown;
}

export const ALL_SCHEMAS: readonly IdentifiedSchema[] = [
  cartLineItemSchema,
  cartSchema,
  cartListSchema,
  cartWriteResultSchema,
  strictCartWriteResultSchema,
  authTokenSchema,
  jwtClaimsSchema,
  apiErrorSchema,
  productSchema,
];

export { SCHEMA_VERSION, CartSchemaIds } from './v1/cart.schema';
export {
  cartLineItemSchema,
  cartListSchema,
  cartSchema,
  cartWriteResultSchema,
  strictCartWriteResultSchema,
};
export { authTokenSchema, jwtClaimsSchema };
export { apiErrorSchema };
export { productSchema };
