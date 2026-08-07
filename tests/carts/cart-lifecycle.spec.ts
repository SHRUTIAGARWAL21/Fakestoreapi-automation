/**
 * Cross-endpoint lifecycle: create -> read -> update -> delete.
 *
 * On a persisting API this suite would be the highest-value coverage in the
 * repo. Here it exists to *prove and quantify* the non-persistence defect
 * (FSA-002) rather than to assume it, and to document what the lifecycle
 * assertions should become once the API stores state.
 */
import { HttpStatus, SeedData, Tag } from '@/config/constants';
import { aCart } from '@/data/builders/cart-payload.builder';
import { cartSchema, strictCartWriteResultSchema } from '@/schemas';
import { assertResponseEnvelope, assertValidCart, expect } from '@/assertions';
import { cartMatchesPayload } from '@/support/cart-comparison';
import { recordDeviation } from '@/support/deviations';
import { test } from '@tests/fixtures/api.fixture';

test.describe('Cart lifecycle', { tag: [Tag.DEVIATION] }, () => {
  test('a created cart is not retrievable by its returned id', async ({ api }, testInfo) => {
    const deviation = recordDeviation(testInfo, 'WRITES_ARE_NOT_PERSISTED');

    // Arrange & Act - create, then immediately try to read it back.
    const payload = aCart().forUser(3).withProduct(9, 3).build();
    const created = await api.carts.create(payload);
    assertResponseEnvelope(created, {
      status: HttpStatus.CREATED,
      schema: strictCartWriteResultSchema,
    });

    const readBack = await api.carts.getById(created.body.id);

    // Assert - the read succeeds but returns a *different*, pre-seeded cart
    // (or null), never the one just created.
    assertResponseEnvelope(readBack, { status: HttpStatus.OK });

    const matchesWhatWeCreated = cartMatchesPayload(readBack.bodyOrUndefined, payload);

    expect(
      matchesWhatWeCreated,
      `${deviation.id}: the cart created at id ${created.body.id} was not persisted. ` +
        `Once the API stores writes, this assertion flips to expect(matchesWhatWeCreated).toBe(true).`,
    ).toBe(false);
  });

  test('consecutive creates are assigned the same id', async ({ api }, testInfo) => {
    const deviation = recordDeviation(testInfo, 'WRITES_ARE_NOT_PERSISTED');

    const first = await api.carts.create(aCart().withProduct(1, 1).build());
    const second = await api.carts.create(aCart().withProduct(2, 2).build());

    expect(first).toHaveStatus(HttpStatus.CREATED);
    expect(second).toHaveStatus(HttpStatus.CREATED);
    expect(
      second.body.id,
      `${deviation.id}: id allocation is synthetic - two creates returned the same id, so ids ` +
        `are not unique and cannot be used as references.`,
    ).toBe(first.body.id);
  });

  test('an update does not change what a subsequent read returns', async ({ api }, testInfo) => {
    const deviation = recordDeviation(testInfo, 'WRITES_ARE_NOT_PERSISTED');
    const cartId = SeedData.CART_IDS[4];

    // Arrange - capture the current state.
    const before = await api.carts.getById(cartId);
    assertResponseEnvelope(before, { status: HttpStatus.OK, schema: cartSchema });

    // Act - apply a clearly distinguishable update.
    const payload = aCart().forUser(99).onDate('2030-12-31').withProduct(17, 77).build();
    const updated = await api.carts.update(cartId, payload);
    assertResponseEnvelope(updated, {
      status: HttpStatus.OK,
      schema: strictCartWriteResultSchema,
    });

    // Assert - the read is unchanged, proving the write was discarded.
    const after = await api.carts.getById(cartId);
    assertResponseEnvelope(after, { status: HttpStatus.OK, schema: cartSchema });
    assertValidCart(after.body!);

    expect(
      after.body,
      `${deviation.id}: PUT reported success but the stored cart is unchanged. ` +
        `Once writes persist, this becomes expect(after.body).toMatchObject(payload).`,
    ).toEqual(before.body);
  });
});
