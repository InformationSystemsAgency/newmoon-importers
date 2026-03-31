/**
 * Transform: trees → nested **`{ translations, children? }`** per root (same idea as extract sections).
 *
 * **Input** (each section root):
 * - **`{ category: { translations }, subcategories? }`** or **`{ translations, subcategories? | children? }`**
 * - Aliased: **`{ section_title: { locale_en, locale_hy }, subsections? }`**
 */

/**
 * @typedef {object} CategoryNestedNode
 * @property {Array<{ languages_code: string, title: string }>} translations
 * @property {CategoryNestedNode[]} [children]
 */

/**
 * @param {unknown} t
 * @returns {{ languages_code: string, title: string }}
 */
function normTranslation(t) {
  if (!t || typeof t !== 'object') {
    throw new Error('Category transform: each translation must be an object');
  }
  return {
    languages_code: String(t.languages_code ?? '').trim(),
    title: String(t.title ?? '').trim(),
  };
}

/**
 * @param {Array<{ languages_code: string, title: string }>} translations
 */
function nonEmptyTranslations(translations) {
  return translations.filter((t) => t.languages_code && t.title);
}

/**
 * @param {unknown} sub
 * @param {number} i
 * @returns {{ translations: Array<{ languages_code: string, title: string }>, subs: unknown[] }}
 */
function aliasedSubToInternal(sub, i) {
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
    throw new Error(`Category transform: subsections[${i}] invalid`);
  }
  if (sub.section_title != null && typeof sub.section_title === 'object') {
    return normalizeNode(sub);
  }
  const translations = nonEmptyTranslations([
    normTranslation({ languages_code: 'en', title: sub.locale_en }),
    normTranslation({ languages_code: 'hy', title: sub.locale_hy }),
  ]);
  return { translations, subs: [] };
}

/**
 * @param {unknown} node
 * @returns {{ translations: Array<{ languages_code: string, title: string }>, subs: unknown[] }}
 */
function normalizeNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error('Category transform: expected an object node');
  }

  if (node.section_title != null && typeof node.section_title === 'object') {
    const st = node.section_title;
    const translations = nonEmptyTranslations([
      normTranslation({ languages_code: 'en', title: st.locale_en }),
      normTranslation({ languages_code: 'hy', title: st.locale_hy }),
    ]);
    const subs = Array.isArray(node.subsections)
      ? node.subsections.map((sub, j) => aliasedSubToInternal(sub, j))
      : [];
    return { translations, subs };
  }

  const raw = node.category?.translations ?? node.translations;
  if (!Array.isArray(raw)) {
    throw new Error(
      'Category transform: expected `category.translations`, top-level `translations`, or aliased `section_title`',
    );
  }
  const translations = nonEmptyTranslations(raw.map(normTranslation));
  const subRoots = Array.isArray(node.subcategories)
    ? node.subcategories
    : Array.isArray(node.children)
      ? node.children
      : [];
  const subs = subRoots.map((child, j) => {
    try {
      return normalizeNode(child);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Category transform: subcategories[${j}]: ${msg}`);
    }
  });
  return { translations, subs };
}

/**
 * @param {{ translations: Array<{ languages_code: string, title: string }>, subs: unknown[] }} internal
 * @returns {CategoryNestedNode}
 */
function internalToNested(internal) {
  if (internal.translations.length === 0) {
    throw new Error('Category transform: translations array must not be empty');
  }
  const children = internal.subs.map((sub) => internalToNested(sub));
  /** @type {CategoryNestedNode} */
  const out = { translations: internal.translations };
  if (children.length > 0) out.children = children;
  return out;
}

/**
 * @param {unknown} root
 * @returns {CategoryNestedNode}
 */
export function categoryRootToNested(root) {
  return internalToNested(normalizeNode(root));
}

/**
 * @param {{ sections: unknown[] }} batch
 * @param {object} _ctx
 * @returns {CategoryNestedNode[]}
 */
export function transform(batch, _ctx) {
  const sections = batch?.sections;
  if (!Array.isArray(sections)) {
    throw new Error('transform: expected batch.sections to be an array');
  }

  /** @type {CategoryNestedNode[]} */
  const out = [];
  for (let s = 0; s < sections.length; s++) {
    try {
      out.push(categoryRootToNested(sections[s]));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Category transform: sections[${s}]: ${msg}`);
    }
  }
  return out;
}

/**
 * @param {unknown} raw — root array of section trees, or **`{ catalog_sections: [...] }`**
 * @returns {CategoryNestedNode[]}
 */
export function catalogJsonToNestedTrees(raw) {
  const sections = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray(raw.catalog_sections)
      ? raw.catalog_sections
      : null;

  if (!sections) {
    throw new Error(
      'Category transform: expected a root array of category trees, or { catalog_sections: [...] }',
    );
  }

  return transform({ sections }, {});
}
