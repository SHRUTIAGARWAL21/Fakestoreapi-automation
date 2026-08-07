/**
 * Contract tests.
 *
 * Schema validation asserts what we *require* of the API. Contract testing
 * asserts what the API *currently is*, so that any structural drift - a renamed
 * field, a dropped property, an int that becomes a string - surfaces on the
 * next run even in areas no explicit assertion covers.
 *
 * Snapshots live in `contracts/__snapshots__` and are reviewed like code.
 * Re-record intentional changes with `npm run contract:update`.
 *
 * These run serially in their own project so a parallel worker can never write
 * the same snapshot file concurrently.
 */
import { HttpStatus, SeedData, Tag } from '@/config/constants';
import { aCart } from '@/data/builders/cart-payload.builder';
import { assertResponseEnvelope, expect } from '@/assertions';
import { config, test } from '@tests/fixtures/api.fixture';

test.describe('API contracts', { tag: [Tag.CONTRACT] }, () => {
  test('GET /carts/:id matches the recorded contract', async ({ api }) => {
    const response = await api.carts.getById(SeedData.FIRST_CART_ID);

    assertResponseEnvelope(response, { status: HttpStatus.OK });
    expect(response).toMatchApiContract({
      name: 'cart-by-id',
      endpoint: 'GET /carts/:id',
    });
  });

  test('GET /carts matches the recorded contract', async ({ api }) => {
    // The whole collection is fingerprinted, so a field that disappears from a
    // single cart is still caught.
    const response = await api.carts.getAll();

    assertResponseEnvelope(response, { status: HttpStatus.OK });
    expect(response).toMatchApiContract({
      name: 'cart-collection',
      endpoint: 'GET /carts',
    });
  });

  test('GET /carts/user/:userId matches the recorded contract', async ({ api }) => {
    const response = await api.carts.getByUser(SeedData.USER_WITH_CARTS);

    assertResponseEnvelope(response, { status: HttpStatus.OK });
    expect(response).toMatchApiContract({
      name: 'cart-by-user',
      endpoint: 'GET /carts/user/:userId',
    });
  });

  test('POST /carts matches the recorded contract', async ({ api }) => {
    const response = await api.carts.create(aCart().withProduct(1, 2).build());

    assertResponseEnvelope(response, { status: HttpStatus.CREATED });
    expect(response).toMatchApiContract({
      name: 'cart-create',
      endpoint: 'POST /carts',
    });
  });

  test('PUT /carts/:id matches the recorded contract', async ({ api }) => {
    const response = await api.carts.update(
      SeedData.FIRST_CART_ID,
      aCart().withProduct(3, 4).build(),
    );

    assertResponseEnvelope(response, { status: HttpStatus.OK });
    expect(response).toMatchApiContract({
      name: 'cart-update',
      endpoint: 'PUT /carts/:id',
    });
  });

  test('DELETE /carts/:id matches the recorded contract', async ({ api }) => {
    const response = await api.carts.remove(SeedData.FIRST_CART_ID);

    assertResponseEnvelope(response, { status: HttpStatus.OK });
    expect(response).toMatchApiContract({
      name: 'cart-delete',
      endpoint: 'DELETE /carts/:id',
    });
  });

  test('POST /auth/login matches the recorded contract', async ({ api }) => {
    const response = await api.auth.login(config.credentials);

    assertResponseEnvelope(response, { status: HttpStatus.CREATED });
    expect(response).toMatchApiContract({
      name: 'auth-login',
      endpoint: 'POST /auth/login',
    });
  });

  test('the cart error envelope matches the recorded contract', async ({ api }) => {
    const response = await api.carts.getById('not-a-number');

    assertResponseEnvelope(response, { status: HttpStatus.BAD_REQUEST });
    expect(response).toMatchApiContract({
      name: 'cart-error-envelope',
      endpoint: 'GET /carts/:id (invalid id)',
    });
  });
});
