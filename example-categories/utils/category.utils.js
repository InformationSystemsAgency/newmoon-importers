import { schemaSnapshot } from '@directus/sdk';

export async function getCategoriesSchema(client) {
    const CATEGORIES_COLLECTION = 'categories';
    const CATEGORIES_TRANSLATIONS_COLLECTION = 'categories_translations';

    const snapshot = await client.request(schemaSnapshot());
    const collections = snapshot?.collections ?? [];
    const fields = snapshot?.fields ?? [];
  
    const categoriesColl = collections.find((c) => c.collection === CATEGORIES_COLLECTION);
    const translationsColl = collections.find((c) => c.collection === CATEGORIES_TRANSLATIONS_COLLECTION);
  
    if (!categoriesColl || !translationsColl) {
      const names = collections.map((c) => c.collection).filter(Boolean);
      console.warn(`⚠️  "${CATEGORIES_COLLECTION}" or "${CATEGORIES_TRANSLATIONS_COLLECTION}" not found.`);
      console.warn('   Available:', names.slice(0, 25).join(', '));
      console.log('💡 Ensure the "categories" collection exists with "categories_translations" (title, languages_code).');
      process.exit(1);
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