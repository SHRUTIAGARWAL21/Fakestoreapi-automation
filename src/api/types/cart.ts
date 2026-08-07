/** Domain types for the Cart resource. */

export interface CartLineItem {
  productId: number;
  quantity: number;
}

/** A cart as returned by the read endpoints (includes the Mongo version key). */
export interface Cart {
  id: number;
  userId: number;
  date: string;
  products: CartLineItem[];
  __v?: number;
}

/** The payload accepted by POST /carts and PUT /carts/:id. */
export interface CartPayload {
  userId: number;
  date: string;
  products: CartLineItem[];
}

/**
 * The write endpoints echo the payload back with an id and, unlike the read
 * endpoints, omit `__v`. Fields are optional because the API happily accepts
 * (and echoes) a partial or empty payload - see the deviation register.
 */
export interface CartWriteResult {
  id: number;
  userId?: unknown;
  date?: unknown;
  products?: unknown;
}

/** The error envelope the API returns for unparseable path parameters. */
export interface ApiErrorEnvelope {
  status: string;
  message: string;
}
