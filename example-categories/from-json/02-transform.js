/**
 * Transform: aliased JSON → **flat rows** for **`load`**: `{ title, parent_index }`
 * (`parent_index` = index of parent within the same batch, or `null` for roots).
 */

/**
 * @param {{ title: Record<string, string>, subcategories?: unknown[] }} node
 * @returns {Array<{ title: Record<string, string>, parent_index: number | null }>}
 */
function flattenCanonicalTree(node) {
  /** @type {Array<{ title: Record<string, string>, parent_index: number | null }>} */
  const rows = [];
  function walk(n, parentIdx) {
    const idx = rows.length;
    rows.push({
      title: n.title,
      parent_index: parentIdx,
    });
    for (const sub of n.subcategories ?? []) {
      walk(sub, idx);
    }
  }
  walk(node, null);
  return rows;
}

/**
 * @param {unknown} block
 * @returns {{ title: Record<string, string>, subcategories?: unknown[] }}
 */
function aliasedBlockToCanonical(block) {
  if (!block || typeof block !== 'object') {
    throw new Error('Aliased JSON transform: invalid block');
  }
  const st = block.section_title;
  if (!st || typeof st !== 'object') {
    throw new Error('Aliased JSON transform: section_title missing');
  }
  const title = {
    en: String(st.locale_en ?? '').trim(),
    hy: String(st.locale_hy ?? '').trim(),
  };
  const subs = Array.isArray(block.subsections) ? block.subsections : [];
  const subcategories = subs.map((sub, j) => aliasedSubNodeToCanonical(sub, j));
  const node = { title };
  if (subcategories.length > 0) node.subcategories = subcategories;
  return node;
}

/**
 * @param {unknown} sub
 * @param {number} j
 */
function aliasedSubNodeToCanonical(sub, j) {
  if (!sub || typeof sub !== 'object') {
    throw new Error(`Aliased JSON transform: invalid subsection at ${j}`);
  }
  if (sub.section_title != null && typeof sub.section_title === 'object') {
    return aliasedBlockToCanonical(sub);
  }
  return {
    title: {
      en: String(sub.locale_en ?? '').trim(),
      hy: String(sub.locale_hy ?? '').trim(),
    },
  };
}

/**
 * @param {unknown} section
 * @param {object} _ctx
 * @returns {Array<{ title: Record<string, string>, parent_index: number | null }>}
 */
export function aliasedSectionToCanonicalFlat(section, _ctx) {
  const tree = aliasedBlockToCanonical(section);
  return flattenCanonicalTree(tree);
}

/**
 * @param {{ sections: unknown[] }} batch
 * @param {object} _ctx
 * @returns {Array<{ title: Record<string, string>, parent_index: number | null }>}
 */
export function transform(batch, _ctx) {
  const sections = batch?.sections;
  if (!Array.isArray(sections)) {
    throw new Error('transform: expected batch.sections to be an array');
  }

  /** @type {Array<{ title: Record<string, string>, parent_index: number | null }>} */
  const all = [];
  for (let s = 0; s < sections.length; s++) {
    try {
      const tree = aliasedBlockToCanonical(sections[s]);
      const base = all.length;
      const local = flattenCanonicalTree(tree);
      for (const r of local) {
        all.push({
          title: r.title,
          parent_index: r.parent_index == null ? null : r.parent_index + base,
        });
      }
    } catch (e) {
      throw new Error(`Aliased JSON transform: section at index ${s}: ${e.message}`);
    }
  }
  return all;
}

/**
 * @param {unknown} raw
 * @returns {Array<{ title: Record<string, string>, parent_index: number | null }>}
 */
export function aliasedCatalogJsonToCanonical(raw) {
  const sections = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw.catalog_sections)
      ? raw.catalog_sections
      : null;

  if (!sections) {
    throw new Error(
      'Aliased JSON transform: expected a root array of sections, or { catalog_sections: [...] }',
    );
  }

  return transform({ sections }, {});
}
