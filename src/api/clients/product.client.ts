/**
 * Product endpoints.
 *
 * Not under test in their own right - the cart suite uses them to verify that
 * the product ids its datasets reference actually resolve.
 */
import { Routes } from '@/api/routes';
import type { Product } from '@/api/types/product';
import type { ApiResponse } from '@/core/api-response';
import { BaseClient } from './base.client';
import type { RequestOverrides } from './cart.client';

export class ProductClient extends BaseClient {
  /** GET /products/:id */
  getById(
    id: string | number,
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<Product | null>> {
    return this.http.get<Product | null>(Routes.products.byId(id), overrides);
  }
}
