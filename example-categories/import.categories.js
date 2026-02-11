/**
 * Import categories into Directus.
 *
 * Uses DIRECTUS_URL and DIRECTUS_IMPORTER_TOKEN from .env (see project root .env.example).
 * Schema (from Directus):
 *   - categories: id (uuid), parent_category (uuid, M2O self), slug, background_color, border_color, text_color
 *   - categories_translations: categories_id, languages_code, title
 *
 * Run from project root:
 *   node example-categories/import.categories.js
 */


/**
 * Example categories with subcategories.
 * Each item can have optional subcategories; parents are created first, then children with parent_category set.
 * - title: { en: '...', hy: '...' } for categories_translations
 * - subcategories: optional array of same shape (no nested subcategories in this example)
 */
const EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES = [
    {
      title: { en: 'News', hy: 'Նորություններ' },
      subcategories: [
        { title: { en: 'Press Releases', hy: 'Մամլո հաղորդագրություններ' } },
        { title: { en: 'Announcements', hy: 'Հայտարարություններ' } },
      ],
    },
    {
      title: { en: 'Events', hy: 'Իրադարձություններ' },
      subcategories: [
        { title: { en: 'Conferences', hy: 'Կոնֆերանսներ' } },
        { title: { en: 'Workshops', hy: 'Աշխատանքային հանդիպումներ' } },
      ],
    },
    {
      title: { en: 'Documents', hy: 'Փաստաթղթեր' },
      subcategories: [
        { title: { en: 'Reports', hy: 'Հաշվետվություններ' } },
        { title: { en: 'Policies', hy: 'Կանոնակարգեր' } },
      ],
    },
];

import { createDirectus, rest, staticToken, createItem, schemaSnapshot } from '@directus/sdk';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { getShortTimestamp } from '../utils/timestamp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const directusUrl = process.env.DIRECTUS_URL;
const directusToken = process.env.DIRECTUS_IMPORTER_TOKEN;

if (!directusUrl) {
  console.error('❌ DIRECTUS_URL must be set in the environment (e.g. in .env).');
  process.exit(1);
}
if (!directusToken) {
  console.error('❌ DIRECTUS_IMPORTER_TOKEN must be set in the environment (e.g. in .env).');
  process.exit(1);
}

const client = createDirectus(directusUrl)
  .with(staticToken(directusToken))
  .with(rest());

const CATEGORIES_COLLECTION = 'categories';
const CATEGORIES_TRANSLATIONS_COLLECTION = 'categories_translations';

/**
 * Fetch schema to confirm "categories" and "categories_translations" exist and get editable fields.
 */
async function getCategoriesSchema() {
  const snapshot = await client.request(schemaSnapshot());
  const collections = snapshot?.collections ?? [];
  const fields = snapshot?.fields ?? [];

  const categoriesColl = collections.find((c) => c.collection === CATEGORIES_COLLECTION);
  const translationsColl = collections.find((c) => c.collection === CATEGORIES_TRANSLATIONS_COLLECTION);

  if (!categoriesColl || !translationsColl) {
    const names = collections.map((c) => c.collection).filter(Boolean);
    console.warn(`⚠️  "${CATEGORIES_COLLECTION}" or "${CATEGORIES_TRANSLATIONS_COLLECTION}" not found.`);
    console.warn('   Available:', names.slice(0, 25).join(', '));
    return null;
  }

  const categoryFields = fields
    .filter((f) => f.collection === CATEGORIES_COLLECTION && f.type !== 'alias')
    .filter((f) => !f.meta?.readonly && !['id'].includes(f.field))
    .map((f) => f.field);

  const translationFields = fields
    .filter((f) => f.collection === CATEGORIES_TRANSLATIONS_COLLECTION && f.type !== 'alias')
    .filter((f) => !f.meta?.readonly && !['id'].includes(f.field))
    .map((f) => f.field);

  return {
    collection: CATEGORIES_COLLECTION,
    translationsCollection: CATEGORIES_TRANSLATIONS_COLLECTION,
    categoryFields,
    translationFields,
  };
}

async function main() {
  console.log('📡 Reading schema from Directus...\n');

  const schema = await getCategoriesSchema();
  if (!schema) {
    console.log('💡 Ensure the "categories" collection exists with "categories_translations" (title, languages_code).');
    process.exit(1);
  }

  console.log(`✅ Collection: ${schema.collection}`);
  console.log(`   Fields: ${schema.categoryFields.join(', ')}`);
  console.log(`   Translations: ${schema.translationsCollection} (${schema.translationFields.join(', ')})\n`);

  function buildPayload(item, parentId = null) {
    const payload = {};
    if (schema.categoryFields.includes('parent_category') && parentId != null) {
      payload.parent_category = parentId;
    }
    if (schema.categoryFields.includes('background_color') && item.background_color != null) {
      payload.background_color = item.background_color;
    }
    if (schema.categoryFields.includes('border_color') && item.border_color != null) {
      payload.border_color = item.border_color;
    }
    if (schema.categoryFields.includes('text_color') && item.text_color != null) {
      payload.text_color = item.text_color;
    }
    if (schema.categoryFields.includes('slug') && item.slug != null) {
      payload.slug = item.slug;
    }
    return payload;
  }

  async function createCategoryAndTranslations(item, parentId = null) {
    const titles = item.title && typeof item.title === 'object' ? item.title : { en: String(item.title ?? '') };
    const payload = buildPayload(item, parentId);

    const category = await client.request(createItem(schema.collection, payload));
    const categoryId = category?.id ?? category?.data?.id;
    if (!categoryId) throw new Error('No id in create response');

    for (const [languages_code, title] of Object.entries(titles)) {
      if (!title) continue;
      await client.request(createItem(schema.translationsCollection, {
        categories_id: categoryId,
        languages_code,
        title,
      }));
    }
    return { id: categoryId, ...payload, title: titles };
  }

  const imported = [];
  for (const item of EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES) {
    try {
      const parent = await createCategoryAndTranslations(item);
      const firstTitle = Object.values(parent.title)[0] || parent.id;
      console.log(`   ✅ Created: ${firstTitle} (id: ${parent.id})`);

      const subcategories = item.subcategories ?? [];
      const importedSubs = [];
      for (const sub of subcategories) {
        const child = await createCategoryAndTranslations(sub, parent.id);
        importedSubs.push({ id: child.id, title: child.title });
        const childTitle = Object.values(child.title)[0] || child.id;
        console.log(`      └ sub: ${childTitle} (id: ${child.id})`);
      }

      imported.push({
        id: parent.id,
        title: parent.title,
        subcategories: importedSubs,
      });
    } catch (err) {
      console.error(`   ❌ Failed:`, err.message);
      if (err.errors) err.errors.forEach((e) => console.error('      -', e.message));
    }
  }

  const timestamp = getShortTimestamp();
  const outDir = path.resolve(__dirname, 'imports');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `categories.imported.${timestamp}.json`);
  await fs.writeFile(outPath, JSON.stringify(imported, null, 2), 'utf8');
  console.log(`\n🎉 Done. Created ${imported.reduce((n, p) => n + 1 + (p.subcategories?.length ?? 0), 0)} category item(s).`);
  console.log(`   Wrote IDs and titles to ${path.basename(outPath)}`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
