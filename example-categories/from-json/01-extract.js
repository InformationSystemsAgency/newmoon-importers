/**
 * Extract: read `../data/categories.etl.aliased.json`, yield **`{ sections }`** per batch (≤ **`context.batchSize`** sections).
 */

import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const DATA_JSON_ALIASED = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/categories.etl.aliased.json',
);

/**
 * @param {object} context
 * @param {number} context.batchSize
 * @returns {AsyncIterable<{ sections: unknown[] }>}
 */
export function extract(context) {
  const sectionsPerYield = context.batchSize;
  if (!(Number.isFinite(sectionsPerYield) && sectionsPerYield > 0)) {
    throw new Error('extract: context.batchSize must be a positive number (from etlPipe)');
  }

  return streamSectionBatches(DATA_JSON_ALIASED, sectionsPerYield);
}

/**
 * @param {string} filePath
 * @param {number} sectionsPerYield
 */
async function* streamSectionBatches(filePath, sectionsPerYield) {
  const text = await fs.readFile(filePath, 'utf8');
  const raw = JSON.parse(text);
  const sections = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw.catalog_sections)
      ? raw.catalog_sections
      : null;

  if (!sections) {
    throw new Error(
      'Aliased JSON extract: expected a root array of sections, or { catalog_sections: [...] }',
    );
  }

  for (let i = 0; i < sections.length; i += sectionsPerYield) {
    yield { sections: sections.slice(i, i + sectionsPerYield) };
  }
}
