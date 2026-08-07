/**
 * GET /carts, GET /carts/:id, GET /carts/user/:userId
 *
 * Read endpoints operate on seeded data, so these tests are fully deterministic
 * and safe to run in parallel.
 */
import {
  HttpStatus,
  NON_EXISTENT_CART_ID,
  SeedData,
  Tag,
  WHITESPACE_CART_ID,
} from '@/config/constants';
import { MALFORMED_ID_DATASETS } from '@/data/datasets/cart.datasets';
import { apiErrorSchema, cartListSchema, cartSchema } from '@/schemas';
import {
  assertAllBelongToUser,
  assertProductsAreInCatalogue,
  assertResponseEnvelope,
  assertSortedById,
  assertUniqueIds,
  assertValidCart,
  expect,
} from '@/assertions';
import { recordDeviation } from '@/support/deviations';
import { test } from '@tests/fixtures/api.fixture';

test.describe('GET /carts (collection)', { tag: [Tag.POSITIVE] }, () => {
  test('returns every seeded cart with valid business data', async ({ api }) => {
    const response = await api.carts.getAll();

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });

    const carts = response.body;
    expect(carts.length, 'the seeded dataset must be present').toBeGreaterThanOrEqual(
      SeedData.TOTAL_CARTS,
    );
    assertUniqueIds(carts);
    carts.forEach(assertValidCart);
    carts.forEach(assertProductsAreInCatalogue);
  });

  test('honours the limit parameter', async ({ api }) => {
    const limit = 3;

    const response = await api.carts.getAll({ limit });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    expect(response.body, `?limit=${limit} must return exactly ${limit} carts`).toHaveLength(limit);
  });

  test('sorts descending by id when asked', async ({ api }) => {
    const response = await api.carts.getAll({ sort: 'desc' });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    assertSortedById(response.body, 'desc');
  });

  test('sorts ascending by default', async ({ api }) => {
    const response = await api.carts.getAll();

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    assertSortedById(response.body, 'asc');
  });

  test('filters to the requested date range', async ({ api }) => {
    const startdate = '2019-12-10';
    const enddate = '2020-10-10';

    const response = await api.carts.getAll({ startdate, enddate });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });

    const outOfRange = response.body.filter((cart) => {
      const timestamp = Date.parse(cart.date);
      return timestamp < Date.parse(startdate) || timestamp > Date.parse(`${enddate}T23:59:59Z`);
    });
    expect(
      outOfRange.map((cart) => `cart ${cart.id} dated ${cart.date}`),
      `every cart must fall within ${startdate}..${enddate}`,
    ).toEqual([]);
  });

  test('combines limit and sort', async ({ api }) => {
    const response = await api.carts.getAll({ limit: 2, sort: 'desc' });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    expect(response.body).toHaveLength(2);
    assertSortedById(response.body, 'desc');
  });
});

test.describe('GET /carts (collection) - invalid parameters', { tag: [Tag.NEGATIVE] }, () => {
  test('ignores a non-numeric limit instead of rejecting it', async ({ api }, testInfo) => {
    const deviation = recordDeviation(testInfo, 'INVALID_QUERY_PARAMS_IGNORED');

    const response = await api.carts.getAll({ limit: 'abc' });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    expect(
      response.body.length,
      `${deviation.id}: ?limit=abc silently returned the full collection`,
    ).toBeGreaterThanOrEqual(SeedData.TOTAL_CARTS);
  });

  test('ignores an unrecognised sort direction', async ({ api }, testInfo) => {
    const deviation = recordDeviation(testInfo, 'INVALID_QUERY_PARAMS_IGNORED');

    const response = await api.carts.getAll({ sort: 'sideways' });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    assertSortedById(response.body, 'asc');
    expect(
      response.body.length,
      `${deviation.id}: an invalid sort fell back to the default`,
    ).toBeGreaterThan(0);
  });

  test('returns a single row for a negative limit', async ({ api }, testInfo) => {
    const deviation = recordDeviation(testInfo, 'NEGATIVE_LIMIT_RETURNS_ROWS');

    const response = await api.carts.getAll({ limit: -1 });

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    expect(response.body, `${deviation.id}: ?limit=-1 returned data rather than 400`).toHaveLength(
      1,
    );
  });
});

test.describe('GET /carts/:id', () => {
  test('returns the requested cart', { tag: [Tag.POSITIVE] }, async ({ api }) => {
    const cartId = SeedData.FIRST_CART_ID;

    const response = await api.carts.getById(cartId);

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartSchema });

    const cart = response.body!;
    expect(cart.id, 'the returned cart must be the one requested').toBe(cartId);
    assertValidCart(cart);
    assertProductsAreInCatalogue(cart);
  });

  test(
    'returns consistent data across repeated reads',
    { tag: [Tag.POSITIVE] },
    async ({ api }) => {
      // Guards against caching or replica-lag inconsistencies.
      const [first, second] = await Promise.all([
        api.carts.getById(SeedData.FIRST_CART_ID),
        api.carts.getById(SeedData.FIRST_CART_ID),
      ]);

      expect(first).toHaveStatus(HttpStatus.OK);
      expect(second).toHaveStatus(HttpStatus.OK);
      expect(second.body, 'repeated reads of a static cart must be identical').toEqual(first.body);
    },
  );

  for (const dataset of MALFORMED_ID_DATASETS) {
    test(`rejects the unparseable id ${dataset.name}`, { tag: [Tag.NEGATIVE] }, async ({ api }) => {
      const response = await api.carts.getById(dataset.id);

      assertResponseEnvelope(response, {
        status: dataset.expectedStatus,
        schema: apiErrorSchema,
      });
      expect(response.bodyOrUndefined, 'the error envelope must explain the failure').toMatchObject(
        {
          status: 'error',
        },
      );
    });
  }

  test(
    'treats a url-encoded space as a missing id rather than rejecting it',
    { tag: [Tag.NEGATIVE, Tag.DEVIATION] },
    async ({ api }, testInfo) => {
      // Worth isolating: every other unparseable id yields 400, but `%20`
      // slips past the parser and is handled as "no id supplied".
      const deviation = recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');

      const response = await api.carts.getById(WHITESPACE_CART_ID);

      assertResponseEnvelope(response, { status: HttpStatus.OK });
      expect(
        response.body,
        `${deviation.id}: "%20" bypassed the id validation that rejects every other bad id`,
      ).toBeNull();
    },
  );

  test(
    'returns 200 with a null body for a non-existent id',
    { tag: [Tag.NEGATIVE, Tag.DEVIATION] },
    async ({ api }, testInfo) => {
      const deviation = recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');

      const response = await api.carts.getById(NON_EXISTENT_CART_ID);

      assertResponseEnvelope(response, { status: HttpStatus.OK });
      expect(response.body, `${deviation.id}: expected 404, got 200 with a null body`).toBeNull();
    },
  );

  test(
    'returns 200 with a null body for id 0',
    { tag: [Tag.NEGATIVE, Tag.DEVIATION] },
    async ({ api }, testInfo) => {
      recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');

      const response = await api.carts.getById(0);

      assertResponseEnvelope(response, { status: HttpStatus.OK });
      expect(response.body).toBeNull();
    },
  );

  test(
    'returns 200 with a null body for a negative id',
    { tag: [Tag.NEGATIVE, Tag.DEVIATION] },
    async ({ api }, testInfo) => {
      recordDeviation(testInfo, 'MISSING_RESOURCE_RETURNS_200_NULL');

      const response = await api.carts.getById(-1);

      assertResponseEnvelope(response, { status: HttpStatus.OK });
      expect(response.body).toBeNull();
    },
  );
});

test.describe('GET /carts/user/:userId', () => {
  test('returns only the carts owned by that user', { tag: [Tag.POSITIVE] }, async ({ api }) => {
    const userId = SeedData.USER_WITH_CARTS;

    const response = await api.carts.getByUser(userId);

    assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
    expect(response.body.length, `user ${userId} is seeded with at least one cart`).toBeGreaterThan(
      0,
    );
    assertAllBelongToUser(response.body, userId);
    response.body.forEach(assertValidCart);
  });

  test(
    'returns an empty collection for a user with no carts',
    { tag: [Tag.NEGATIVE] },
    async ({ api }) => {
      const response = await api.carts.getByUser(SeedData.USER_WITHOUT_CARTS);

      assertResponseEnvelope(response, { status: HttpStatus.OK, schema: cartListSchema });
      expect(response.body, 'an unknown user must yield an empty array, not an error').toEqual([]);
    },
  );
});
