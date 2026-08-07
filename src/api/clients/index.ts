/**
 * Client aggregate - one object a test can destructure to reach any resource.
 * Adding an endpoint family means adding one client and one line here.
 */
import type { HttpClient } from '@/core/http-client';
import { AuthClient } from './auth.client';
import { CartClient } from './cart.client';
import { ProductClient } from './product.client';

export interface ApiClients {
  readonly carts: CartClient;
  readonly auth: AuthClient;
  readonly products: ProductClient;
}

export function createApiClients(http: HttpClient): ApiClients {
  return {
    carts: new CartClient(http),
    auth: new AuthClient(http),
    products: new ProductClient(http),
  };
}

export { AuthClient, CartClient, ProductClient };
export { decodeJwtClaims, isJwtShaped } from './auth.client';
export type { RequestOverrides } from './cart.client';
