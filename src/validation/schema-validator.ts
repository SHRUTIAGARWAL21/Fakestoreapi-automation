/**
 * Ajv wrapper producing human-readable validation reports.
 *
 * Ajv's raw error objects are precise but unpleasant to read at 2am, so every
 * failure is rendered as `path: problem (got <actual>)`. All schemas are
 * registered once at module load, which both enables `$ref` composition and
 * avoids recompiling a schema per test.
 */
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import { ALL_SCHEMAS, type IdentifiedSchema } from '@/schemas';

export interface SchemaViolation {
  /** JSON path to the offending value, e.g. `$.products[0].quantity`. */
  readonly path: string;
  readonly problem: string;
  readonly actual: unknown;
}

export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly schemaTitle: string;
  readonly violations: readonly SchemaViolation[];
}

const ajv = new Ajv({
  allErrors: true,
  strict: true,
  // The API returns integers where `strictTypes` would want explicit unions;
  // coercion stays off so a string "5" never silently passes as a number.
  coerceTypes: false,
  allowUnionTypes: true,
  verbose: true,
});
addFormats(ajv);

for (const schema of ALL_SCHEMAS) {
  ajv.addSchema(schema as object, schema.$id);
}

/** Resolves a validator, preferring the pre-registered instance. */
function resolveValidator(schema: IdentifiedSchema | object): ValidateFunction {
  const id = (schema as IdentifiedSchema).$id;

  if (typeof id === 'string') {
    const registered = ajv.getSchema(id);
    if (registered) return registered;
  }
  return ajv.compile(schema);
}

function toJsonPath(error: ErrorObject): string {
  const pointer = error.instancePath;
  if (pointer === '') return '$';

  return `$${pointer
    .split('/')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`))
    .join('')}`;
}

function describe(error: ErrorObject): SchemaViolation {
  const base = toJsonPath(error);

  switch (error.keyword) {
    case 'required':
      return {
        path: `${base}.${String(error.params.missingProperty)}`,
        problem: 'required field is missing',
        actual: undefined,
      };
    case 'additionalProperties':
      return {
        path: `${base}.${String(error.params.additionalProperty)}`,
        problem: 'unexpected field not present in the contract',
        actual: (error.data as Record<string, unknown> | undefined)?.[
          String(error.params.additionalProperty)
        ],
      };
    case 'type':
      return {
        path: base,
        problem: `expected type ${String(error.params.type)}, got ${typeName(error.data)}`,
        actual: error.data,
      };
    case 'enum':
      return {
        path: base,
        problem: `must be one of [${(error.params.allowedValues as unknown[]).join(', ')}]`,
        actual: error.data,
      };
    default:
      return { path: base, problem: error.message ?? error.keyword, actual: error.data };
  }
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function validateAgainstSchema(
  data: unknown,
  schema: IdentifiedSchema | object,
): SchemaValidationResult {
  const validate = resolveValidator(schema);
  const valid = validate(data) as boolean;
  const title = (schema as { title?: string; $id?: string }).title ?? 'schema';

  return {
    valid,
    schemaTitle: title,
    violations: valid ? [] : (validate.errors ?? []).map(describe),
  };
}

/** Renders a validation result as an indented, copy-pasteable failure block. */
export function formatViolations(result: SchemaValidationResult): string {
  if (result.valid) return '';

  const lines = result.violations.map(
    (violation) =>
      `  - ${violation.path}: ${violation.problem}` +
      (violation.actual === undefined ? '' : ` (got ${JSON.stringify(violation.actual)})`),
  );

  return `Schema "${result.schemaTitle}" reported ${result.violations.length} violation(s):\n${lines.join('\n')}`;
}
