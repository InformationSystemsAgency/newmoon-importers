/**
 * Extract (stream pipeline): same streaming CSV read as `from-csv`, yields **`{ rows }`** per batch.
 */

import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { parse } from 'csv-parse';

const DATA_CSV = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/categories.etl.csv');

/**
 * @param {object} context
 * @param {number} context.batchSize
 * @returns {AsyncIterable<{ rows: Record<string, string>[] }>}
 */
export function extract(context) {
  const batchSize = context.batchSize;
  if (!(Number.isFinite(batchSize) && batchSize > 0)) {
    throw new Error('extract: context.batchSize must be a positive number (from etlPipe)');
  }

  return streamRowBatches(DATA_CSV, batchSize);
}

/**
 * @param {string} filePath
 * @param {number} batchSize
 */
async function* streamRowBatches(filePath, batchSize) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const parser = stream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );

  /** @type {Record<string, string>[]} */
  let buffer = [];

  for await (const row of parser) {
    buffer.push(row);
    if (buffer.length >= batchSize) {
      yield { rows: [...buffer] };
      buffer = [];
    }
  }

  if (buffer.length) {
    yield { rows: [...buffer] };
  }
}
