/**
 * Datasets for parameterised tests.
 *
 * Each entry is a self-describing case: a name used as the test title, the
 * inputs, and the expectation. Adding coverage means appending one object -
 * never copying a test body.
 */
import { HttpStatus, MALFORMED_CART_IDS, NON_EXISTENT_CART_ID, SeedData } from '@/config/constants';
import type { CartLineItem } from '@/api/types/cart';
import type { DeviationKey } from '@/support/deviations';

export interface ProductDataset {
  readonly name: string;
  readonly productId: number;
  readonly quantity: number;
  readonly userId: number;
}

/**
 * Product ids exercised by the data-driven cart-creation suite.
 * Spans the catalogue boundaries and a mid-range id; extend freely.
 */
export const PRODUCT_DATASETS: readonly ProductDataset[] = [
  { name: 'first product in the catalogue', productId: 1, quantity: 1, userId: 1 },
  { name: 'mid-catalogue product, bulk quantity', productId: 7, quantity: 25, userId: 2 },
  { name: 'mid-catalogue product, single unit', productId: 12, quantity: 3, userId: 3 },
  { name: 'last product in the catalogue', productId: 20, quantity: 10, userId: 4 },
  {
    name: 'maximum realistic quantity',
    productId: 5,
    quantity: 999,
    userId: SeedData.USER_WITH_CARTS,
  },
];

export interface MultiProductDataset {
  readonly name: string;
  readonly products: readonly CartLineItem[];
}

export const MULTI_PRODUCT_DATASETS: readonly MultiProductDataset[] = [
  {
    name: 'two distinct products',
    products: [
      { productId: 1, quantity: 2 },
      { productId: 2, quantity: 5 },
    ],
  },
  {
    name: 'three products with mixed quantities',
    products: [
      { productId: 3, quantity: 1 },
      { productId: 8, quantity: 12 },
      { productId: 15, quantity: 4 },
    ],
  },
  {
    name: 'five products in one cart',
    products: [
      { productId: 1, quantity: 1 },
      { productId: 4, quantity: 2 },
      { productId: 9, quantity: 3 },
      { productId: 14, quantity: 4 },
      { productId: 19, quantity: 5 },
    ],
  },
];

/** Cart ids that the API cannot parse, and the error it returns for them. */
export interface MalformedIdDataset {
  readonly name: string;
  readonly id: string;
  readonly expectedStatus: number;
}

export const MALFORMED_ID_DATASETS: readonly MalformedIdDataset[] = MALFORMED_CART_IDS.map(
  (id) => ({
    name: `"${id}"`,
    id,
    expectedStatus: HttpStatus.BAD_REQUEST,
  }),
);

/**
 * Payloads a correct API should reject.
 *
 * `expectedStatus` is what this API actually returns; `deviation` names the
 * register entry explaining what it should have returned instead. When the API
 * starts validating, these assertions fail and the entries get retired.
 */
export interface InvalidPayloadDataset {
  readonly name: string;
  readonly payload: Record<string, unknown> | undefined;
  readonly expectedStatus: number;
  /** Register entry explaining what the API should have returned instead. */
  readonly deviation: DeviationKey;
}

const validBase = { userId: 1, date: '2024-01-15' };

export const INVALID_PAYLOAD_DATASETS: readonly InvalidPayloadDataset[] = [
  {
    name: 'empty object',
    payload: {},
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'missing products field',
    payload: { ...validBase },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'missing userId field',
    payload: { date: '2024-01-15', products: [{ productId: 1, quantity: 1 }] },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'non-existent productId',
    payload: { ...validBase, products: [{ productId: NON_EXISTENT_CART_ID, quantity: 1 }] },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'zero quantity',
    payload: { ...validBase, products: [{ productId: 1, quantity: 0 }] },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'negative quantity',
    payload: { ...validBase, products: [{ productId: 1, quantity: -5 }] },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'quantity as a string',
    payload: { ...validBase, products: [{ productId: 1, quantity: 'two' }] },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'products as a string instead of an array',
    payload: { ...validBase, products: 'not-an-array' },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'userId as a string',
    payload: { userId: 'one', date: '2024-01-15', products: [{ productId: 1, quantity: 1 }] },
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
  {
    name: 'no body at all',
    payload: undefined,
    expectedStatus: HttpStatus.CREATED,
    deviation: 'NO_PAYLOAD_VALIDATION',
  },
];

/** Bodies that are not valid JSON documents. */
export interface MalformedBodyDataset {
  readonly name: string;
  readonly rawBody: string;
}

export const MALFORMED_BODY_DATASETS: readonly MalformedBodyDataset[] = [
  { name: 'truncated JSON object', rawBody: '{"userId": 1, "products": [' },
  { name: 'trailing comma', rawBody: '{"userId": 1, "date": "2024-01-15",}' },
  { name: 'unquoted keys', rawBody: '{userId: 1}' },
  { name: 'plain text instead of JSON', rawBody: 'this is not json at all' },
];
