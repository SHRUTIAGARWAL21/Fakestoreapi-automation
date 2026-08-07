/**
 * Cart endpoints.
 *
 * Every method accepts an escape hatch (`RequestOverrides`) so negative tests
 * can send malformed ids, raw bodies or odd headers without a parallel set of
 * "bad" clients.
 */
import { Routes, type CollectionQuery } from '@/api/routes';
import type { ApiResponse } from '@/core/api-response';
import type { RequestSpec } from '@/core/http-client';
import type { Cart, CartPayload, CartWriteResult } from '@/api/types/cart';
import { BaseClient } from './base.client';

export type RequestOverrides = Partial<Omit<RequestSpec, 'method' | 'path'>>;

export class CartClient extends BaseClient {
  /** GET /carts */
  getAll(
    query: CollectionQuery = {},
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<Cart[]>> {
    return this.http.get<Cart[]>(Routes.carts.root(), { query: { ...query }, ...overrides });
  }

  /** GET /carts/:id - `id` is intentionally loose so malformed ids are testable. */
  getById(
    id: string | number,
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<Cart | null>> {
    return this.http.get<Cart | null>(Routes.carts.byId(id), overrides);
  }

  /** GET /carts/user/:userId */
  getByUser(
    userId: string | number,
    query: CollectionQuery = {},
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<Cart[]>> {
    return this.http.get<Cart[]>(Routes.carts.byUser(userId), {
      query: { ...query },
      ...overrides,
    });
  }

  /** POST /carts */
  create(
    payload: CartPayload | Record<string, unknown> | undefined,
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<CartWriteResult>> {
    return this.http.post<CartWriteResult>(Routes.carts.root(), {
      ...(payload === undefined ? {} : { json: payload }),
      ...overrides,
    });
  }

  /** POST /carts with a body the framework will not serialise for you. */
  createRaw(rawBody: string, overrides: RequestOverrides = {}): Promise<ApiResponse<unknown>> {
    return this.http.post(Routes.carts.root(), { rawBody, ...overrides });
  }

  /** PUT /carts/:id */
  update(
    id: string | number,
    payload: CartPayload | Record<string, unknown> | undefined,
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<CartWriteResult>> {
    return this.http.put<CartWriteResult>(Routes.carts.byId(id), {
      ...(payload === undefined ? {} : { json: payload }),
      ...overrides,
    });
  }

  /** PUT /carts/:id with an unserialised body. */
  updateRaw(
    id: string | number,
    rawBody: string,
    overrides: RequestOverrides = {},
  ): Promise<ApiResponse<unknown>> {
    return this.http.put(Routes.carts.byId(id), { rawBody, ...overrides });
  }

  /** DELETE /carts/:id */
  remove(id: string | number, overrides: RequestOverrides = {}): Promise<ApiResponse<Cart | null>> {
    return this.http.delete<Cart | null>(Routes.carts.byId(id), overrides);
  }
}
