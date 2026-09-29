// Phase 39 spike results store. Throwaway: deleted in the phase cleanup plan.
//
// The only sanctioned writer of 39-spike-results.json. Every write is serialized,
// checked for key material (bare key prefix or a known needle) and only then written
// atomically (temp file + rename). A refused write leaves the target byte-identical.
// Budget accounting sums estCostMicroUsd over every recorded call sample.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { findSecretLeaks } from '../../spacetimedb/src/helpers/measurement.ts';
import { collectCallSamples, type ResultsDoc } from '../../spacetimedb/src/helpers/measurement_results';
import { BUDGET_MICRO_USD, RESULTS_PATH } from './config.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

type Json = unknown;

function splitPath(dotPath: string): string[] {
  const parts = dotPath.split('.').filter((p) => p.length > 0);
  if (parts.length === 0) throw new Error('results store: empty path');
  for (const p of parts) {
    if (p === '__proto__' || p === 'constructor' || p === 'prototype') {
      throw new Error('results store: forbidden path segment');
    }
  }
  return parts;
}

export class ResultsStore {
  readonly path: string;
  readonly needles: string[];

  constructor(
    filePath: string = RESULTS_PATH,
    needles: (string | undefined)[] = [process.env.LEAK_NEEDLE],
  ) {
    this.path = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
    this.needles = needles.filter((n): n is string => typeof n === 'string' && n.length > 0);
  }

  /** Current document; { schemaVersion: 1 } when the file does not exist. */
  read(): ResultsDoc {
    if (!fs.existsSync(this.path)) return { schemaVersion: 1 };
    return JSON.parse(fs.readFileSync(this.path, 'utf8')) as ResultsDoc;
  }

  get(dotPath: string): Json {
    let cur: any = this.read();
    for (const p of splitPath(dotPath)) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = cur[p];
    }
    return cur;
  }

  set(dotPath: string, value: Json): void {
    const doc: any = this.read();
    const parts = splitPath(dotPath);
    let cur = doc;
    for (const p of parts.slice(0, -1)) {
      if (cur[p] === null || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    this.write(doc);
  }

  append(dotPath: string, items: Json[]): void {
    const doc: any = this.read();
    const parts = splitPath(dotPath);
    let cur = doc;
    for (const p of parts.slice(0, -1)) {
      if (cur[p] === null || typeof cur[p] !== 'object') cur[p] = {};
      cur = cur[p];
    }
    const last = parts[parts.length - 1];
    if (!Array.isArray(cur[last])) cur[last] = [];
    cur[last].push(...items);
    this.write(doc);
  }

  /** Sum of estCostMicroUsd over every recorded call sample. */
  estimatedSpendMicroUsd(): number {
    let total = 0;
    for (const s of collectCallSamples(this.read())) {
      if (typeof s.estCostMicroUsd === 'number' && Number.isFinite(s.estCostMicroUsd)) total += s.estCostMicroUsd;
    }
    return total;
  }

  assertBudget(nextReserveMicroUsd: number): void {
    if (this.estimatedSpendMicroUsd() + nextReserveMicroUsd > BUDGET_MICRO_USD) {
      throw new Error('harness budget exceeded');
    }
  }

  private write(doc: unknown): void {
    const text = JSON.stringify(doc, null, 2) + '\n';
    const leaks = findSecretLeaks(text, { strictPrefix: true, needles: this.needles });
    if (leaks.total > 0) {
      // Counts only; never echo the offending content.
      throw new Error('results store: refusing to write, secret material detected (' + leaks.total + ' hit(s))');
    }
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, this.path);
  }
}
