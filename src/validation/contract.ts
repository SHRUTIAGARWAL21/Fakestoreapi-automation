/**
 * Lightweight consumer-driven contract testing.
 *
 * Snapshots live in `contracts/__snapshots__` as sorted, pretty-printed JSON so
 * a change shows up as a readable git diff and gets reviewed like code.
 *
 * Workflow:
 *   npm run test:contract      assert the live API still matches the snapshot
 *   npm run contract:update    intentionally re-record after an approved change
 *
 * Additive changes are reported but pass by default (they cannot break an
 * existing consumer); `CONTRACT_STRICT=true` makes them fail too.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { config } from '@/config/environments';
import { MissingContractError } from '@/core/errors';
import { deriveShape, diffShapes, type ContractChange, type Shape } from './shape';

export const CONTRACTS_DIR = join(process.cwd(), 'contracts', '__snapshots__');

interface ContractSnapshot {
  readonly name: string;
  readonly version: string;
  readonly recordedAt: string;
  readonly endpoint: string;
  readonly shape: Shape;
}

export interface ContractResult {
  readonly name: string;
  readonly status: 'matched' | 'recorded' | 'changed';
  readonly changes: readonly ContractChange[];
  readonly breakingChanges: readonly ContractChange[];
  readonly additiveChanges: readonly ContractChange[];
}

export interface ContractOptions {
  /** Stable snapshot name, e.g. `cart-by-id`. Becomes the file name. */
  readonly name: string;
  /** Human-readable endpoint description stored alongside the shape. */
  readonly endpoint: string;
  readonly version?: string;
}

function snapshotPath(name: string): string {
  return join(CONTRACTS_DIR, `${name}.contract.json`);
}

/**
 * UTF-8 byte order mark. Snapshots are hand-editable, and Windows editors (and
 * PowerShell redirection) prepend one silently - which `JSON.parse` rejects.
 */
const BOM = /^\uFEFF/;

function readSnapshot(name: string): ContractSnapshot | undefined {
  const path = snapshotPath(name);
  if (!existsSync(path)) return undefined;

  try {
    const contents = readFileSync(path, 'utf8').replace(BOM, '');
    return JSON.parse(contents) as ContractSnapshot;
  } catch (error) {
    throw new Error(
      `Contract snapshot ${path} is corrupt: ${(error as Error).message}\n` +
        `Re-record it with: npm run contract:update`,
    );
  }
}

function writeSnapshot(snapshot: ContractSnapshot): void {
  const path = snapshotPath(snapshot.name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

/**
 * Compares a live payload against its recorded contract.
 *
 * Returns a result rather than throwing so the caller decides how a change is
 * surfaced - the custom matcher turns it into an assertion, the reporter turns
 * it into a summary.
 */
export function verifyContract(payload: unknown, options: ContractOptions): ContractResult {
  const { name, endpoint, version = 'v1' } = options;
  const shape = deriveShape(payload);
  const existing = readSnapshot(name);

  if (config.contracts.update || !existing) {
    if (!existing && !config.contracts.update) {
      throw new MissingContractError(name, snapshotPath(name));
    }

    writeSnapshot({
      name,
      version,
      recordedAt: new Date().toISOString(),
      endpoint,
      shape,
    });
    return { name, status: 'recorded', changes: [], breakingChanges: [], additiveChanges: [] };
  }

  const changes = diffShapes(existing.shape, shape);
  const breakingChanges = changes.filter((change) => change.breaking);
  const additiveChanges = changes.filter((change) => !change.breaking);

  const failed = breakingChanges.length > 0 || (config.contracts.strict && changes.length > 0);

  return {
    name,
    status: failed ? 'changed' : 'matched',
    changes,
    breakingChanges,
    additiveChanges,
  };
}

/** Renders a contract result as an actionable failure message. */
export function formatContractResult(result: ContractResult): string {
  if (result.changes.length === 0) return '';

  const render = (change: ContractChange): string => {
    const detail =
      change.kind === 'removed'
        ? `was ${change.expected}, no longer returned`
        : change.kind === 'added'
          ? `new field of type ${change.actual}`
          : `${change.expected} -> ${change.actual}`;
    return `  [${change.kind}] ${change.path}: ${detail}`;
  };

  const sections: string[] = [`Contract "${result.name}" no longer matches the recorded shape.`];

  if (result.breakingChanges.length > 0) {
    sections.push(
      `\nBREAKING (${result.breakingChanges.length}) - these will break existing consumers:`,
      ...result.breakingChanges.map(render),
    );
  }
  if (result.additiveChanges.length > 0) {
    sections.push(
      `\nADDITIVE (${result.additiveChanges.length}) - backwards compatible:`,
      ...result.additiveChanges.map(render),
    );
  }

  sections.push(
    '',
    'If this change is intentional and approved, re-record the contract with:',
    '  npm run contract:update',
  );

  return sections.join('\n');
}
