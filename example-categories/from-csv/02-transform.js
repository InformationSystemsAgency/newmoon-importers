/**
 * Transform: **`{ rows }`** from extract → array **`load`** expects Directus-style **`translations`**.
 */

/**
 * @param {{ rows: Record<string, string>[] }} batch
 * @param {object} _ctx
 * @returns {Array<{ translations: Array<{ languages_code: string, title: string }> }>}
 */
export function transform(row, _ctx) {
  return {
    "translations": [
      { languages_code: 'hy', title: String(row.hy ?? row.title_hy ?? '').trim() },
      { languages_code: 'en', title: String(row.en ?? row.title_en ?? '').trim() },
    ]
  };
}
