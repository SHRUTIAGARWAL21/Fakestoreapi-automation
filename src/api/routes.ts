/**
 * Single source of truth for every path the suite touches.
 *
 * Tests never hand-write URLs. When the API versions its paths, this file is
 * the only edit - see the versioning note in the README.
 */

export const Routes = {
  auth: {
    login: () => '/auth/login',
  },
  carts: {
    root: () => '/carts',
    byId: (id: string | number) => `/carts/${id}`,
    byUser: (userId: string | number) => `/carts/user/${userId}`,
  },
  products: {
    byId: (id: string | number) => `/products/${id}`,
  },
} as const;

/** Query parameters the collection endpoints accept. */
export interface CollectionQuery {
  readonly limit?: number | string;
  readonly sort?: 'asc' | 'desc' | string;
  readonly startdate?: string;
  readonly enddate?: string;
}
