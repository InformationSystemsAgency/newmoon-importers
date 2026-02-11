/**
 * Starter importer for Directus "articles".
 *
 * This script:
 * 1) reads schema from Directus
 * 2) creates articles in "articles"
 * 3) creates translations in "articles_translations"
 * 4) optionally links categories through "articles_categories"
 * 5) writes created IDs to imports/articles.imported.{timestamp}.json
 *
 * Run from project root:
 *   node example-articles/import.articles.js
 */

import {
  createDirectus,
  rest,
  staticToken,
  createItem,
  updateItem,
  readItems,
  schemaSnapshot,
} from '@directus/sdk';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { getShortTimestamp } from '../utils/timestamp.js';
import { loremIpsum } from '../utils/lorem.ipsum.js';

/**
 * Put your source rows here (or replace with file parsing later).
 * Required per article:
 * - content_type: UUID from "content_types"
 * - translations: at least one { languages_code, title }
 * Optional per article:
 * - layout: "basic" or "advanced" (case-insensitive)
 * - published_date: ISO datetime string (recommended)
 * - date_created: accepted as alias and mapped to published_date
 * - featured_image_path: local file path to upload (recommended)
 * - attachment_paths: array of local file paths for file_attachments (advanced layout)
 * - attachments: advanced attachment objects:
 *   [{ path, file_name?, make_downloadable?, hide_file_icon?, hide_file_size?, sort?, translations? }]
 * - info_cards: advanced info card objects:
 *   [{ type?, sort?, translations: [{ languages_code, content }] }]
 * - featured_image_attachment_id: id from "file_attachments" (resolved to file UUID)
 * - featured_image_file_id: direct file UUID from "directus_files"
 *
 * Optional per translation:
 * - featured_image_path: local file path (overrides article-level path)
 * - featured_image_attachment_id: id from "file_attachments" (overrides article-level)
 * - featured_image_file_id: direct file UUID (overrides article-level)
 * - featured_image: direct file UUID (overrides all)
 */
const EXAMPLE_ARTICLES = [
  {
    content_type: '5ec59920-94ac-4eb0-9d12-c029f7679766',
    status: 'Archived', // Published or Draft or Archived
    date_created: '2026-02-11T12:00:00.000Z',
    translations: [
      { languages_code: 'en', title: 'My Article basic layout', short_description: loremIpsum('en') },
      { languages_code: 'hy', title: 'Իմ Հոդվածը basic layout', short_description: loremIpsum('hy') },
    ],
    featured_image_path: 'attachments/1-800x600.png',
    categories: ['67cf9c00-747a-4ce7-a448-c97193943813', '49ee915c-efe7-4ff3-a47e-0b60df2779d7'],
    layout: 'basic',
  },
  {
    content_type: '5ec59920-94ac-4eb0-9d12-c029f7679766',
    status: 'Published', // Published or Draft or Archived
    date_created: '2026-02-11T12:00:00.000Z',
    translations: [
      { languages_code: 'en', title: 'My Article (advanced layout)', short_description: loremIpsum('en') },
      { languages_code: 'hy', title: 'Իմ Հոդվածը (advanced layout)', short_description: loremIpsum('hy') },
    ],
    categories: ['67cf9c00-747a-4ce7-a448-c97193943813', '49ee915c-efe7-4ff3-a47e-0b60df2779d7'],
    layout: 'advanced',
    attachment_paths: ['attachments/1-800x600.png', 'attachments/3-800x600.png'],
    info_cards: [
      {
        // Optional: set "type" if your project requires a specific info_card_types id.
        // type: 1,
        translations: [
          { languages_code: 'en', content: `<p>${loremIpsum('en')}</p>` },
          { languages_code: 'hy', content: `<p>${loremIpsum('hy')}</p>` },
        ],
      },
    ],
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const directusUrl = process.env.DIRECTUS_URL;
const directusToken = process.env.DIRECTUS_IMPORTER_TOKEN;

if (!directusUrl) {
  console.error('DIRECTUS_URL must be set in environment.');
  process.exit(1);
}
if (!directusToken) {
  console.error('DIRECTUS_IMPORTER_TOKEN must be set in environment.');
  process.exit(1);
}

const client = createDirectus(directusUrl)
  .with(staticToken(directusToken))
  .with(rest());

const ARTICLES_COLLECTION = 'articles';
const ARTICLES_TRANSLATIONS_COLLECTION = 'articles_translations';
const ARTICLES_CATEGORIES_COLLECTION = 'articles_categories';
const FILE_ATTACHMENTS_COLLECTION = 'file_attachments';
const FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION = 'file_attachments_translations';
const INFO_CARDS_COLLECTION = 'info_cards';
const INFO_CARDS_TRANSLATIONS_COLLECTION = 'info_cards_translations';

function unique(arr) {
  return [...new Set(arr)];
}

function getWritableFields(fields, collection, excluded = []) {
  return fields
    .filter((f) => f.collection === collection)
    .filter((f) => f.type !== 'alias')
    .filter((f) => !f.meta?.readonly)
    .map((f) => f.field)
    .filter((name) => !excluded.includes(name));
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function normalizeLayout(layout, allowedLayouts) {
  if (layout === undefined || layout === null || layout === '') return undefined;
  const value = String(layout).trim().toLowerCase();
  const matched = allowedLayouts.find((x) => x.toLowerCase() === value);
  if (matched) return matched;
  throw new Error(`Invalid layout "${layout}". Allowed values: ${allowedLayouts.join(', ')}`);
}

function getMimeTypeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };
  return map[ext] ?? null;
}

function isAdvancedLayout(layout) {
  return String(layout ?? '').toLowerCase() === 'advanced';
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveLocalPath(rawPath) {
  if (!rawPath) return null;
  if (path.isAbsolute(rawPath)) return rawPath;

  const fromCwd = path.resolve(process.cwd(), rawPath);
  if (await pathExists(fromCwd)) return fromCwd;

  const fromScriptDir = path.resolve(__dirname, rawPath);
  if (await pathExists(fromScriptDir)) return fromScriptDir;

  return fromCwd;
}

async function readSchema() {
  const snapshot = await client.request(schemaSnapshot());
  const collections = snapshot?.collections ?? [];
  const fields = snapshot?.fields ?? [];

  const hasArticles = collections.some((c) => c.collection === ARTICLES_COLLECTION);
  const hasTranslations = collections.some((c) => c.collection === ARTICLES_TRANSLATIONS_COLLECTION);
  const hasJunction = collections.some((c) => c.collection === ARTICLES_CATEGORIES_COLLECTION);
  const hasFileAttachments = collections.some((c) => c.collection === FILE_ATTACHMENTS_COLLECTION);
  const hasFileAttachmentTranslations = collections.some(
    (c) => c.collection === FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION
  );
  const hasInfoCards = collections.some((c) => c.collection === INFO_CARDS_COLLECTION);
  const hasInfoCardTranslations = collections.some(
    (c) => c.collection === INFO_CARDS_TRANSLATIONS_COLLECTION
  );

  if (!hasArticles || !hasTranslations) {
    throw new Error(
      `Missing required collections. Need "${ARTICLES_COLLECTION}" and "${ARTICLES_TRANSLATIONS_COLLECTION}".`
    );
  }

  const articleFields = getWritableFields(fields, ARTICLES_COLLECTION, ['id', 'date_created']);
  const translationFields = getWritableFields(fields, ARTICLES_TRANSLATIONS_COLLECTION, ['id']);
  const junctionFields = hasJunction
    ? getWritableFields(fields, ARTICLES_CATEGORIES_COLLECTION, ['id'])
    : [];
  const fileAttachmentFields = hasFileAttachments
    ? getWritableFields(fields, FILE_ATTACHMENTS_COLLECTION, ['id'])
    : [];
  const fileAttachmentTranslationFields = hasFileAttachmentTranslations
    ? getWritableFields(fields, FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION, ['id'])
    : [];
  const infoCardFields = hasInfoCards
    ? getWritableFields(fields, INFO_CARDS_COLLECTION, ['id'])
    : [];
  const infoCardTranslationFields = hasInfoCardTranslations
    ? getWritableFields(fields, INFO_CARDS_TRANSLATIONS_COLLECTION, ['id'])
    : [];
  const layoutField = fields.find((f) => f.collection === ARTICLES_COLLECTION && f.field === 'layout');
  const allowedLayouts = (layoutField?.meta?.options?.choices ?? [])
    .map((choice) => choice?.value)
    .filter(Boolean);

  return {
    articleFields,
    translationFields,
    junctionFields,
    fileAttachmentFields,
    fileAttachmentTranslationFields,
    infoCardFields,
    infoCardTranslationFields,
    hasJunction,
    hasFileAttachments,
    hasFileAttachmentTranslations,
    hasInfoCards,
    hasInfoCardTranslations,
    allowedLayouts,
  };
}

async function ensureContentTypesExist(rows) {
  const ids = unique(rows.map((r) => r.content_type).filter(Boolean));
  if (ids.length === 0) return;

  const found = await client.request(
    readItems('content_types', {
      filter: { id: { _in: ids } },
      fields: ['id'],
      limit: -1,
    })
  );

  const foundIds = new Set(found.map((x) => x.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Unknown content_type ids: ${missing.join(', ')}`);
  }
}

function collectFeaturedImagePaths(rows) {
  const paths = [];
  for (const row of rows) {
    if (row.featured_image_path) paths.push(row.featured_image_path);
    for (const tr of row.translations ?? []) {
      if (tr.featured_image_path) paths.push(tr.featured_image_path);
    }
  }
  return unique(paths);
}

function collectAdvancedAttachmentPaths(rows) {
  const paths = [];
  for (const row of rows) {
    const layout = String(row.layout ?? 'basic').toLowerCase();
    if (layout !== 'advanced') continue;

    for (const p of row.attachment_paths ?? []) {
      if (p) paths.push(p);
    }
    for (const item of row.attachments ?? []) {
      if (item?.path) paths.push(item.path);
    }
  }
  return unique(paths);
}

async function uploadLocalFileToDirectus(rawPath) {
  const absolutePath = await resolveLocalPath(rawPath);
  const fileBuffer = await fs.readFile(absolutePath);
  const mimeType = getMimeTypeFromPath(absolutePath);

  if (!mimeType) {
    throw new Error(
      `Unsupported image extension for featured_image_path: ${absolutePath}. ` +
      'Use one of: .png, .jpg, .jpeg, .webp, .gif, .svg, .avif'
    );
  }

  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: mimeType }), path.basename(absolutePath));

  const response = await fetch(`${directusUrl}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${directusToken}`,
    },
    body: form,
  });

  const responseText = await response.text();
  let json = null;
  try {
    json = responseText ? JSON.parse(responseText) : null;
  } catch {
    json = { raw: responseText };
  }
  if (!response.ok) {
    throw new Error(
      `Failed to upload "${rawPath}" (${absolutePath}): ${response.status} ${JSON.stringify(json)}`
    );
  }

  const fileId = json?.data?.id;
  if (!fileId) {
    throw new Error(`Upload response missing file id for "${rawPath}" (${absolutePath}).`);
  }

  return { absolutePath, fileId };
}

async function buildLocalPathFileMap(rows) {
  const rawPaths = unique([
    ...collectFeaturedImagePaths(rows),
    ...collectAdvancedAttachmentPaths(rows),
  ]);
  if (rawPaths.length === 0) return new Map();

  const resolvedEntries = [];
  for (const rawPath of rawPaths) {
    const absolutePath = await resolveLocalPath(rawPath);
    if (!(await pathExists(absolutePath))) {
      throw new Error(`Featured image file not found: ${rawPath} (resolved: ${absolutePath})`);
    }
    resolvedEntries.push({ rawPath, absolutePath });
  }

  const uniqueAbsolutePaths = unique(resolvedEntries.map((e) => e.absolutePath));
  const absoluteToFileId = new Map();

  for (const absolutePath of uniqueAbsolutePaths) {
    const { fileId } = await uploadLocalFileToDirectus(absolutePath);
    absoluteToFileId.set(absolutePath, fileId);
  }

  const rawPathToFileId = new Map();
  for (const entry of resolvedEntries) {
    rawPathToFileId.set(entry.rawPath, absoluteToFileId.get(entry.absolutePath));
  }

  return rawPathToFileId;
}

function buildAttachmentSpecsForRow(row) {
  if (Array.isArray(row.attachments) && row.attachments.length > 0) {
    return row.attachments
      .filter((a) => a?.path)
      .map((a, index) => ({ ...a, sort: a.sort ?? index + 1 }));
  }

  const rawPaths = [];
  for (const p of row.attachment_paths ?? []) {
    if (p) rawPaths.push(p);
  }
  if (rawPaths.length === 0 && row.featured_image_path) {
    // Fallback: if no explicit attachment path provided, reuse featured image path.
    rawPaths.push(row.featured_image_path);
  }

  return unique(rawPaths).map((p, index) => ({ path: p, sort: index + 1 }));
}

async function createAdvancedFileAttachments(row, articleId, schema, localPathToFileMap) {
  if (!schema.hasFileAttachments) return [];
  if (!isAdvancedLayout(row.layout ?? 'basic')) return [];

  const specs = buildAttachmentSpecsForRow(row);
  const created = [];

  for (const spec of specs) {
    const fileId = localPathToFileMap.get(spec.path);
    if (!fileId) {
      throw new Error(`No uploaded file id found for attachment path: ${spec.path}`);
    }

    const baseName = path.basename(spec.path);
    const payload = pick(
      {
        article: articleId,
        file: fileId,
        sort: spec.sort,
        make_downloadable: spec.make_downloadable ?? true,
        hide_file_icon: spec.hide_file_icon ?? false,
        hide_file_size: spec.hide_file_size ?? false,
      },
      schema.fileAttachmentFields
    );

    const createdAttachment = await client.request(createItem(FILE_ATTACHMENTS_COLLECTION, payload));
    const attachmentId = createdAttachment?.id ?? createdAttachment?.data?.id;
    if (!attachmentId) {
      throw new Error(`Failed to create file attachment for path: ${spec.path}`);
    }

    if (schema.hasFileAttachmentTranslations) {
      const trRows = Array.isArray(spec.translations) && spec.translations.length > 0
        ? spec.translations
        : (row.translations ?? []).map((tr) => ({
            languages_code: tr.languages_code,
            file_name: spec.file_name ?? baseName,
          }));

      for (const tr of trRows) {
        if (!tr?.languages_code) continue;
        const trPayload = pick(
          {
            file_attachments_id: attachmentId,
            languages_code: tr.languages_code,
            file_name: tr.file_name ?? spec.file_name ?? baseName,
          },
          schema.fileAttachmentTranslationFields
        );
        await client.request(createItem(FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION, trPayload));
      }
    }

    created.push({ id: attachmentId, file: fileId, path: spec.path });
  }

  return created;
}

async function createAdvancedInfoCards(row, articleId, schema) {
  if (!schema.hasInfoCards || !schema.hasInfoCardTranslations) return [];
  if (!isAdvancedLayout(row.layout ?? 'basic')) return [];

  const cards = Array.isArray(row.info_cards) ? row.info_cards : [];
  const created = [];

  for (const [index, card] of cards.entries()) {
    const cardPayload = pick(
      {
        article: articleId,
        type: card.type,
        sort: card.sort ?? index + 1,
      },
      schema.infoCardFields
    );

    const createdCard = await client.request(createItem(INFO_CARDS_COLLECTION, cardPayload));
    const infoCardId = createdCard?.id ?? createdCard?.data?.id;
    if (infoCardId == null) {
      throw new Error('Failed to create info card.');
    }

    const trRows = Array.isArray(card.translations) ? card.translations : [];
    if (trRows.length === 0) {
      throw new Error(`Info card at index ${index} must include translations.`);
    }

    for (const tr of trRows) {
      if (!tr?.languages_code || !tr?.content) {
        throw new Error(`Info card translation must include languages_code and content (index ${index}).`);
      }
      const trPayload = pick(
        {
          info_cards_id: infoCardId,
          languages_code: tr.languages_code,
          content: tr.content,
        },
        schema.infoCardTranslationFields
      );
      await client.request(createItem(INFO_CARDS_TRANSLATIONS_COLLECTION, trPayload));
    }

    created.push({ id: infoCardId, translations: trRows.length });
  }

  return created;
}

function collectAttachmentIds(rows) {
  const ids = [];
  for (const row of rows) {
    if (row.featured_image_attachment_id) ids.push(row.featured_image_attachment_id);
    for (const tr of row.translations ?? []) {
      if (tr.featured_image_attachment_id) ids.push(tr.featured_image_attachment_id);
    }
  }
  return unique(ids);
}

async function buildAttachmentFileMap(rows) {
  const attachmentIds = collectAttachmentIds(rows);
  if (attachmentIds.length === 0) return new Map();

  const records = await client.request(
    readItems(FILE_ATTACHMENTS_COLLECTION, {
      filter: { id: { _in: attachmentIds } },
      fields: ['id', 'file'],
      limit: -1,
    })
  );

  const map = new Map();
  for (const rec of records) {
    if (rec?.id && rec?.file) map.set(rec.id, rec.file);
  }

  const missing = attachmentIds.filter((id) => !map.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Could not resolve featured image from file_attachments for id(s): ${missing.join(', ')}`
    );
  }

  return map;
}

function resolveFeaturedImageFileId(row, tr, attachmentToFileMap, localPathToFileMap) {
  if (tr.featured_image) return tr.featured_image;
  if (tr.featured_image_file_id) return tr.featured_image_file_id;
  if (tr.featured_image_path) return localPathToFileMap.get(tr.featured_image_path);
  if (tr.featured_image_attachment_id) return attachmentToFileMap.get(tr.featured_image_attachment_id);
  if (row.featured_image_file_id) return row.featured_image_file_id;
  if (row.featured_image_path) return localPathToFileMap.get(row.featured_image_path);
  if (row.featured_image_attachment_id) return attachmentToFileMap.get(row.featured_image_attachment_id);
  return undefined;
}

async function main() {
  console.log('Reading schema...');
  const schema = await readSchema();

  console.log(`Collection: ${ARTICLES_COLLECTION}`);
  console.log(`Writable fields: ${schema.articleFields.join(', ') || '(none)'}`);
  if (schema.allowedLayouts.length > 0) {
    console.log(`Allowed layouts: ${schema.allowedLayouts.join(', ')}`);
  }
  console.log(`Translations: ${ARTICLES_TRANSLATIONS_COLLECTION}`);
  console.log(`Writable translation fields: ${schema.translationFields.join(', ') || '(none)'}`);
  if (schema.hasJunction) {
    console.log(`Junction: ${ARTICLES_CATEGORIES_COLLECTION}`);
    console.log(`Writable junction fields: ${schema.junctionFields.join(', ') || '(none)'}`);
  } else {
    console.log(`Junction not found: ${ARTICLES_CATEGORIES_COLLECTION} (category links will be skipped)`);
  }
  if (schema.hasFileAttachments) {
    console.log(`Advanced attachments: ${FILE_ATTACHMENTS_COLLECTION}`);
  }
  if (schema.hasInfoCards) {
    console.log(`Advanced info cards: ${INFO_CARDS_COLLECTION}`);
  }
  console.log('');

  if (EXAMPLE_ARTICLES.length === 0) {
    console.log('No source rows configured yet.');
    console.log('Edit EXAMPLE_ARTICLES in example-articles/import.articles.js and rerun.');
    process.exit(0);
  }

  await ensureContentTypesExist(EXAMPLE_ARTICLES);
  const attachmentToFileMap = await buildAttachmentFileMap(EXAMPLE_ARTICLES);
  const localPathToFileMap = await buildLocalPathFileMap(EXAMPLE_ARTICLES);
  if (localPathToFileMap.size > 0) {
    console.log(`Uploaded ${localPathToFileMap.size} local featured image file(s).`);
  }

  const imported = [];
  for (const row of EXAMPLE_ARTICLES) {
    if (!row.content_type) {
      throw new Error('Each article row must include "content_type".');
    }
    if (!Array.isArray(row.translations) || row.translations.length === 0) {
      throw new Error('Each article row must include non-empty "translations".');
    }

    const articlePayload = pick(
      {
        ...row,
        // Directus "date_created" is system-managed. Use published_date for imported timeline.
        published_date: row.published_date ?? row.date_created ?? undefined,
        layout: normalizeLayout(row.layout, schema.allowedLayouts),
        status: row.status ?? 'published',
      },
      schema.articleFields
    );

    const article = await client.request(createItem(ARTICLES_COLLECTION, articlePayload));
    const articleId = article?.id ?? article?.data?.id;
    if (!articleId) throw new Error('Failed to get article id from create response.');

    // Directus auto-fills date_created on create; override it in a second step when provided.
    if (row.date_created) {
      await client.request(
        updateItem(ARTICLES_COLLECTION, articleId, {
          date_created: row.date_created,
        })
      );
    }

    const writtenTranslations = [];
    for (const tr of row.translations) {
      if (!tr.languages_code || !tr.title) {
        throw new Error('Each translation must include "languages_code" and "title".');
      }

      const trPayload = pick(
        {
          ...tr,
          featured_image: resolveFeaturedImageFileId(row, tr, attachmentToFileMap, localPathToFileMap),
          articles_id: articleId,
        },
        schema.translationFields
      );
      await client.request(createItem(ARTICLES_TRANSLATIONS_COLLECTION, trPayload));
      writtenTranslations.push({ languages_code: tr.languages_code, title: tr.title });
    }

    const categoryIds = Array.isArray(row.categories) ? row.categories.filter(Boolean) : [];
    if (schema.hasJunction && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        const junctionPayload = pick(
          {
            articles_id: articleId,
            categories_id: categoryId,
          },
          schema.junctionFields
        );
        await client.request(createItem(ARTICLES_CATEGORIES_COLLECTION, junctionPayload));
      }
    }

    const attachmentRows = await createAdvancedFileAttachments(
      row,
      articleId,
      schema,
      localPathToFileMap
    );
    const infoCardRows = await createAdvancedInfoCards(row, articleId, schema);

    const label = writtenTranslations[0]?.title ?? articleId;
    console.log(`Created article: ${label} (${articleId})`);

    imported.push({
      id: articleId,
      content_type: row.content_type,
      date_created: row.date_created ?? null,
      published_date: row.published_date ?? row.date_created ?? null,
      layout: row.layout ?? 'basic',
      translations: writtenTranslations,
      categories: categoryIds,
      attachments: attachmentRows,
      info_cards: infoCardRows,
    });
  }

  const timestamp = getShortTimestamp();
  const outDir = path.resolve(__dirname, 'imports');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `articles.imported.${timestamp}.json`);
  await fs.writeFile(outPath, JSON.stringify(imported, null, 2), 'utf8');

  console.log('');
  console.log(`Done. Created ${imported.length} article(s).`);
  console.log(`Wrote import snapshot: ${path.basename(outPath)}`);
}

main().catch((error) => {
  console.error('Import failed:', error.message);
  if (error.errors) {
    for (const e of error.errors) {
      console.error(` - ${e.message}`);
    }
  }
  process.exit(1);
});
