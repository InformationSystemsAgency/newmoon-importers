import fs from 'fs/promises';
import pathModule from 'path';
import { getShortTimestamp } from './timestamp.js';

/**
 * Writes `records` as a JSON array to `{prefix}.{timestamp}.json` under `dirPath`.
 * @param {string} dirPath - Output directory (created if missing)
 * @param {string} filePrefix - Filename prefix (e.g. `articles.imported`)
 * @param {object[]} records - Top-level JSON array payload
 * @returns {Promise<string>} Absolute path to the written file
 */
export async function writeImportLog(dirPath, filePrefix, records) {
    await fs.mkdir(dirPath, { recursive: true });
    const outPath = pathModule.join(dirPath, `${filePrefix}.${getShortTimestamp()}.json`);
    await fs.writeFile(outPath, JSON.stringify(records, null, 2), 'utf8');
    return outPath;
}