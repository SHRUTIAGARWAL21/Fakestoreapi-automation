/**
 * Structural fingerprinting for contract tests.
 *
 * A "shape" is the type skeleton of a response with all values discarded.
 * Comparing shapes - rather than payloads - is what makes a contract test
 * stable against data churn (a new cart appearing, a price changing) while
 * still catching the things that break consumers: removed fields, renamed
 * fields and incompatible type changes.
 *
 * Array items are merged into a single shape, so a 20-element response yields
 * a compact fingerprint that also records which fields are only sometimes
 * present.
 */

export type Shape =
  | { readonly kind: 'primitive'; readonly types: readonly string[] }
  | { readonly kind: 'array'; readonly items: Shape | null }
  | { readonly kind: 'object'; readonly properties: Readonly<Record<string, ShapeProperty>> };

export interface ShapeProperty {
  readonly shape: Shape;
  /** False when at least one observed sibling object omitted the field. */
  readonly required: boolean;
}

function primitiveType(value: unknown): string {
  if (value === null) return 'null';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** Derives the shape of an arbitrary JSON value. */
export function deriveShape(value: unknown): Shape {
  if (Array.isArray(value)) {
    const items = value.reduce<Shape | null>(
      (merged, item) =>
        merged === null ? deriveShape(item) : mergeShapes(merged, deriveShape(item)),
      null,
    );
    return { kind: 'array', items };
  }

  if (value !== null && typeof value === 'object') {
    const properties: Record<string, ShapeProperty> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = { shape: deriveShape(nested), required: true };
    }
    return { kind: 'object', properties: sortKeys(properties) };
  }

  return { kind: 'primitive', types: [primitiveType(value)] };
}

/** Merges two shapes observed at the same position into their union. */
export function mergeShapes(left: Shape, right: Shape): Shape {
  if (left.kind === 'object' && right.kind === 'object') {
    return { kind: 'object', properties: mergeProperties(left.properties, right.properties) };
  }

  if (left.kind === 'array' && right.kind === 'array') {
    return { kind: 'array', items: mergeItems(left.items, right.items) };
  }

  if (left.kind === 'primitive' && right.kind === 'primitive') {
    return { kind: 'primitive', types: unique([...left.types, ...right.types]) };
  }

  // Mixed kinds (e.g. an object where a string was seen before) collapse to a
  // primitive union so the diff reports one clear incompatible type change.
  return { kind: 'primitive', types: unique([describeKind(left), describeKind(right)]) };
}

function mergeProperties(
  left: Readonly<Record<string, ShapeProperty>>,
  right: Readonly<Record<string, ShapeProperty>>,
): Record<string, ShapeProperty> {
  const merged: Record<string, ShapeProperty> = {};

  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const a = left[key];
    const b = right[key];

    // A key seen in only one of the two observations is optional by definition.
    merged[key] =
      a && b
        ? { shape: mergeShapes(a.shape, b.shape), required: a.required && b.required }
        : { shape: (a ?? b)!.shape, required: false };
  }
  return sortKeys(merged);
}

function mergeItems(left: Shape | null, right: Shape | null): Shape | null {
  if (left && right) return mergeShapes(left, right);
  return left ?? right;
}

function describeKind(shape: Shape): string {
  if (shape.kind === 'array') return 'array';
  if (shape.kind === 'object') return 'object';
  return shape.types.join('|');
}

/** A short, stable, human-readable rendering of a shape node's type. */
export function renderType(shape: Shape): string {
  switch (shape.kind) {
    case 'primitive':
      return shape.types.join('|');
    case 'array':
      return shape.items === null ? 'array<unknown>' : `array<${renderType(shape.items)}>`;
    case 'object':
      return 'object';
  }
}

export type ContractChangeKind = 'removed' | 'added' | 'type-changed' | 'became-optional';

export interface ContractChange {
  readonly kind: ContractChangeKind;
  readonly path: string;
  readonly expected?: string;
  readonly actual?: string;
  /** Breaking changes can silently break a consumer; additive ones cannot. */
  readonly breaking: boolean;
}

/** Diffs a recorded shape (`expected`) against a freshly observed one. */
export function diffShapes(expected: Shape, actual: Shape, path = '$'): ContractChange[] {
  if (expected.kind !== actual.kind) {
    return [
      {
        kind: 'type-changed',
        path,
        expected: renderType(expected),
        actual: renderType(actual),
        breaking: true,
      },
    ];
  }

  if (expected.kind === 'primitive' && actual.kind === 'primitive') {
    return diffPrimitive(expected, actual, path);
  }

  if (expected.kind === 'array' && actual.kind === 'array') {
    // An empty array in either snapshot carries no type information.
    if (expected.items === null || actual.items === null) return [];
    return diffShapes(expected.items, actual.items, `${path}[*]`);
  }

  if (expected.kind === 'object' && actual.kind === 'object') {
    return diffObject(expected.properties, actual.properties, path);
  }

  return [];
}

function diffPrimitive(
  expected: Extract<Shape, { kind: 'primitive' }>,
  actual: Extract<Shape, { kind: 'primitive' }>,
  path: string,
): ContractChange[] {
  // Widening integer -> number is compatible; anything else is not.
  const lost = expected.types.filter(
    (type) =>
      !actual.types.includes(type) && !(type === 'integer' && actual.types.includes('number')),
  );
  if (lost.length === 0) return [];

  return [
    {
      kind: 'type-changed',
      path,
      expected: expected.types.join('|'),
      actual: actual.types.join('|'),
      breaking: true,
    },
  ];
}

function diffObject(
  expected: Readonly<Record<string, ShapeProperty>>,
  actual: Readonly<Record<string, ShapeProperty>>,
  path: string,
): ContractChange[] {
  const changes: ContractChange[] = [];
  const keys = unique([...Object.keys(expected), ...Object.keys(actual)]);

  for (const key of keys) {
    const before = expected[key];
    const after = actual[key];
    const childPath = `${path}.${key}`;

    if (before && !after) {
      changes.push({
        kind: 'removed',
        path: childPath,
        expected: renderType(before.shape),
        breaking: true,
      });
      continue;
    }

    if (!before && after) {
      changes.push({
        kind: 'added',
        path: childPath,
        actual: renderType(after.shape),
        breaking: false,
      });
      continue;
    }

    if (!before || !after) continue;

    if (before.required && !after.required) {
      changes.push({
        kind: 'became-optional',
        path: childPath,
        expected: 'always present',
        actual: 'sometimes absent',
        breaking: true,
      });
    }
    changes.push(...diffShapes(before.shape, after.shape, childPath));
  }

  return changes;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
