/**
 * Transform: **`{ rows }`** → **`load`** input (`en`/`hy` → `title`).
 */

/**
 * @param {{ rows: Record<string, string>[] }} batch
 * @param {object} _ctx
 * @returns {Array<{ title: Record<string, string> }>}
 */
export function transform(batch, _ctx) {
  const rows = batch?.rows;
  if (!Array.isArray(rows)) {
    throw new Error('transform: expected batch.rows to be an array');
  }
  return rows.map((row) => ({
    title: {
      en: String(row.en ?? row.title_en ?? '').trim(),
      hy: String(row.hy ?? row.title_hy ?? '').trim(),
    },
  }));
}
