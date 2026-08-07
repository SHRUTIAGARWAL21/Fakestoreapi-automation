/**
 * JSON Schemas for the Cart resource, contract version v1.
 *
 * Schemas are namespaced by version (`schemas/v1`) so a breaking API release
 * can land beside the previous contract instead of overwriting it.
 *
 * Composition is by `$ref` rather than by object nesting: every schema is
 * registered exactly once in the registry, so `cart-line-item` has a single
 * definition shared by reads, writes and the list schema.
 *
 * `additionalProperties: false` is deliberate - a silently added field is a
 * structural change the suite should surface, not swallow.
 */

export const SCHEMA_VERSION = 'v1';

export const schemaId = (name: string): string =>
  `https://fakestoreapi.test/schemas/${SCHEMA_VERSION}/${name}.json`;

export const CartSchemaIds = {
  lineItem: schemaId('cart-line-item'),
  cart: schemaId('cart'),
  cartList: schemaId('cart-list'),
  writeResult: schemaId('cart-write-result'),
  strictWriteResult: schemaId('cart-write-result-strict'),
} as const;

const DRAFT = 'http://json-schema.org/draft-07/schema#';

export const cartLineItemSchema = {
  $id: CartSchemaIds.lineItem,
  $schema: DRAFT,
  title: 'CartLineItem',
  type: 'object',
  required: ['productId', 'quantity'],
  additionalProperties: false,
  properties: {
    productId: { type: 'integer', minimum: 1 },
    quantity: { type: 'integer', minimum: 1 },
  },
} as const;

/** A cart as persisted and returned by the read endpoints. */
export const cartSchema = {
  $id: CartSchemaIds.cart,
  $schema: DRAFT,
  title: 'Cart',
  type: 'object',
  required: ['id', 'userId', 'date', 'products'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    userId: { type: 'integer', minimum: 1 },
    // Reads return a full ISO-8601 timestamp.
    date: { type: 'string', format: 'date-time' },
    products: { type: 'array', items: { $ref: CartSchemaIds.lineItem } },
    // Mongo version key: present on reads, absent on write echoes.
    __v: { type: 'integer' },
  },
} as const;

export const cartListSchema = {
  $id: CartSchemaIds.cartList,
  $schema: DRAFT,
  title: 'CartList',
  type: 'array',
  items: { $ref: CartSchemaIds.cart },
} as const;

/**
 * The echo returned by POST/PUT. Only `id` is guaranteed: the API reflects
 * whatever it was sent, so field-level correctness is asserted by the business
 * assertions rather than by this schema.
 */
export const cartWriteResultSchema = {
  $id: CartSchemaIds.writeResult,
  $schema: DRAFT,
  title: 'CartWriteResult',
  type: 'object',
  required: ['id'],
  additionalProperties: true,
  properties: {
    id: { type: 'integer', minimum: 1 },
  },
} as const;

/** The echo expected when the request payload was itself well-formed. */
export const strictCartWriteResultSchema = {
  $id: CartSchemaIds.strictWriteResult,
  $schema: DRAFT,
  title: 'StrictCartWriteResult',
  type: 'object',
  required: ['id', 'userId', 'date', 'products'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    userId: { type: 'integer', minimum: 1 },
    // Writes echo the date exactly as sent, so the format is not constrained here.
    date: { type: 'string', minLength: 1 },
    products: { type: 'array', minItems: 1, items: { $ref: CartSchemaIds.lineItem } },
  },
} as const;
