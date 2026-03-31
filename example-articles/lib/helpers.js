/**
 * Import logic for `import-article-basic.js` / `import-article-advanced.js`.
 *
 * Exports `importArticle(payload)`. Requires DIRECTUS_URL and DIRECTUS_IMPORTER_TOKEN
 * in .env (project root or example-articles/).
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
  
   
  // ---------------------------------------------------------------------------
  // 2) Env + Directus client (used by helpers below)
  // ---------------------------------------------------------------------------
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
  dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
  
  const directusUrl = process.env.DIRECTUS_URL;
  const directusToken = process.env.DIRECTUS_IMPORTER_TOKEN;
  
  if (!directusUrl || !directusToken) {
    console.error('Set DIRECTUS_URL and DIRECTUS_IMPORTER_TOKEN in .env');
    process.exit(1);
  }
  
  const client = createDirectus(directusUrl).with(staticToken(directusToken)).with(rest());
  
  const C = {
    articles: 'articles',
    articles_translations: 'articles_translations',
    articles_categories: 'articles_categories',
    articles_content_blocks: 'articles_content_blocks',
  };

  const FILE_ATTACHMENTS_COLLECTION = 'file_attachments';
  const FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION = 'file_attachments_translations';
  const INFO_CARDS_COLLECTION = 'info_cards';
  const INFO_CARDS_TRANSLATIONS_COLLECTION = 'info_cards_translations';
  const INFO_CARD_TYPES_COLLECTION = 'info_card_types';

  /**
   * For auto upsert match: first **writable** field on `info_card_types` that is set in `spec` wins.
   * Or set `match_field` + `match_value` explicitly (both required; `match_field` must be writable).
   */
  const INFO_CARD_TYPE_MATCH_FIELDS = [
    'slug',
    'internal_identifier',
    'code',
    'key',
    'identifier',
    'name',
    'title',
    'label',
  ];
  
  const SIMPLE_BLOCK_TYPES = [
    'block_title',
    'block_richtext',
    'block_alert',
    'block_image',
    'block_video',
    'block_gallery',
    'block_accordions',
    'block_embed',
  ];
  
  /** Block types that must have a non-empty `translations` array when the schema has a translations collection. */
  const BLOCK_TYPES_REQUIRING_TRANSLATIONS = new Set([
    'block_title',
    'block_richtext',
    'block_alert',
    'block_image',
  ]);
  
  // ---------------------------------------------------------------------------
  // 3) Main flow (read top to bottom)
  // ---------------------------------------------------------------------------
  
  export async function importArticle(ARTICLE) {
    console.log('Loading Directus schema (writable fields only)…');
    const schema = await loadSimpleSchema();
  
    await assertContentTypeExists(ARTICLE.content_type);
  
    const mediaPaths = collectArticleMediaPaths(ARTICLE);
    const pathToFileId = await uploadLocalFiles(mediaPaths);
    const featuredFileId = ARTICLE.featured_image_path
      ? pathToFileId.get(ARTICLE.featured_image_path)
      : undefined;
  
    const articlePayload = pick(
      {
        content_type: ARTICLE.content_type,
        ...(schema.articleFields.includes('status')
          ? {
              status: normalizeArticleStatus(ARTICLE.status, schema.allowedStatuses),
            }
          : {}),
        layout: normalizeArticleLayout(ARTICLE.layout, schema.allowedLayouts),
        published_date: ARTICLE.published_date ?? ARTICLE.date_created,
      },
      schema.articleFields
    );
  
    const created = await client.request(createItem(C.articles, articlePayload));
    const articleId = created?.id ?? created?.data?.id;
    if (!articleId) throw new Error('Could not read new article id from Directus.');
  
    if (ARTICLE.date_created) {
      await client.request(
        updateItem(C.articles, articleId, { date_created: ARTICLE.date_created })
      );
    }
  
    for (const tr of ARTICLE.translations) {
      if (!tr.languages_code || !tr.title) {
        throw new Error('Each translation needs languages_code and title.');
      }
      const trPayload = pick(
        {
          ...tr,
          articles_id: articleId,
          featured_image: featuredFileId,
        },
        schema.translationFields
      );
      await client.request(createItem(C.articles_translations, trPayload));
    }
  
    if (schema.hasCategoryJunction) {
      for (const categoryId of ARTICLE.categories ?? []) {
        if (!categoryId) continue;
        const junctionPayload = pick(
          { articles_id: articleId, categories_id: categoryId },
          schema.junctionFields
        );
        await client.request(createItem(C.articles_categories, junctionPayload));
      }
    }

    const attachmentRows = await createAdvancedFileAttachments(
      ARTICLE,
      articleId,
      schema,
      pathToFileId
    );

    if (ARTICLE.info_card_type_upsert && !schema.hasInfoCardTypes) {
      throw new Error('Article sets info_card_type_upsert but Directus has no info_card_types collection.');
    }

    let defaultInfoCardTypeId = null;
    if (
      isAdvancedLayout(ARTICLE.layout ?? 'basic') &&
      ARTICLE.info_card_type_upsert &&
      schema.hasInfoCardTypes
    ) {
      defaultInfoCardTypeId = await upsertInfoCardType(ARTICLE.info_card_type_upsert, schema, {
        pathToFileId,
      });
    }

    const infoCardRows = await createAdvancedInfoCards(
      ARTICLE,
      articleId,
      schema,
      defaultInfoCardTypeId
    );
  
    const blockSummaries = [];
    if (schema.hasContentBlocksJunction) {
      for (let i = 0; i < (ARTICLE.content_blocks ?? []).length; i++) {
        const block = ARTICLE.content_blocks[i];
        const order = block.order ?? i + 1;
        const summary = await createSimpleBlockAndLink({
          articleId,
          block,
          order,
          schema,
          pathToFileId,
        });
        blockSummaries.push(summary);
      }
    }
  
    return {
      id: articleId,
      content_blocks: blockSummaries,
      attachments: attachmentRows,
      info_card_type_id: defaultInfoCardTypeId,
      info_cards: infoCardRows,
    };
  }
  
  // ---------------------------------------------------------------------------
  // 4) Helpers
  // ---------------------------------------------------------------------------
  
  function pick(obj, keys) {
    const out = {};
    for (const k of keys) {
      if (obj[k] !== undefined) out[k] = obj[k];
    }
    return out;
  }
  
  function uniqueStrings(arr) {
    return [...new Set(arr.filter(Boolean))];
  }
  
  function isAdvancedLayout(layout) {
    return String(layout ?? '').trim().toLowerCase() === 'advanced';
  }

  /** All local file paths referenced by the article (featured image + block media + advanced attachments). */
  function collectArticleMediaPaths(article) {
    const paths = [];
    if (article.featured_image_path) paths.push(article.featured_image_path);
    if (article.info_card_type_upsert?.icon_path) {
      paths.push(article.info_card_type_upsert.icon_path);
    }
    if (isAdvancedLayout(article.layout)) {
      for (const p of article.attachment_paths ?? []) {
        if (p) paths.push(p);
      }
      for (const item of article.attachments ?? []) {
        if (item?.path) paths.push(item.path);
      }
    }
    for (const block of article.content_blocks ?? []) {
      const t = block.type;
      if (t === 'block_image') {
        for (const tr of block.translations ?? []) {
          if (tr.image_path) paths.push(tr.image_path);
        }
      }
      if (t === 'block_gallery') {
        for (const p of block.upload_files_paths ?? []) paths.push(p);
        for (const item of block.gallery_items ?? []) {
          if (item.image_path) paths.push(item.image_path);
        }
      }
      if (t === 'block_video' && block.data?.video_file_path) {
        paths.push(block.data.video_file_path);
      }
    }
    return uniqueStrings(paths);
  }
  
  async function uploadLocalFiles(rawPaths) {
    const rawToId = new Map();
    const absToId = new Map();
  
    for (const raw of uniqueStrings(rawPaths)) {
      const abs = await resolveLocalPath(raw);
      if (!(await pathExists(abs))) {
        throw new Error(`Media file not found: ${raw} (resolved: ${abs})`);
      }
      let fileId = absToId.get(abs);
      if (!fileId) {
        fileId = await uploadLocalFile(abs);
        absToId.set(abs, fileId);
      }
      rawToId.set(raw, fileId);
    }
    return rawToId;
  }
  
  function writableFieldNames(fields, collection, exclude = []) {
    return fields
      .filter((f) => f.collection === collection)
      .filter((f) => f.type !== 'alias')
      .filter((f) => !f.meta?.readonly)
      .map((f) => f.field)
      .filter((name) => !exclude.includes(name));
  }

  /** Real columns (not alias), including read-only — usable in `readItems` filters for upsert match. */
  function nonAliasFieldNames(fields, collection, exclude = []) {
    return fields
      .filter((f) => f.collection === collection)
      .filter((f) => f.type !== 'alias')
      .map((f) => f.field)
      .filter((name) => !exclude.includes(name));
  }
  
  function translationsConfig(fields, relations, parentCollection) {
    const rel = relations.find(
      (r) => r.related_collection === parentCollection && r.meta?.one_field === 'translations'
    );
    if (!rel) return null;
    return {
      collection: rel.collection,
      foreignField: rel.field,
      fields: writableFieldNames(fields, rel.collection, ['id']),
    };
  }
  
  function junctionOrderField(writable) {
    if (writable.includes('order')) return 'order';
    if (writable.includes('sort')) return 'sort';
    return null;
  }
  
  async function loadSimpleSchema() {
    const snapshot = await client.request(schemaSnapshot());
    const fields = snapshot?.fields ?? [];
    const relations = snapshot?.relations ?? [];
    const collections = snapshot?.collections ?? [];
  
    const layoutField = fields.find((f) => f.collection === C.articles && f.field === 'layout');
    const allowedLayouts = (layoutField?.meta?.options?.choices ?? [])
      .map((c) => c?.value)
      .filter(Boolean);

    const statusField = fields.find((f) => f.collection === C.articles && f.field === 'status');
    const allowedStatuses = (statusField?.meta?.options?.choices ?? [])
      .map((c) => c?.value)
      .filter(Boolean);
  
    const contentBlocksRelation = relations.find(
      (r) => r.collection === C.articles_content_blocks && r.field === 'item'
    );
    const allowedFromDirectus = contentBlocksRelation?.meta?.one_allowed_collections ?? [];
    const allowedBlockCollections = SIMPLE_BLOCK_TYPES.filter((t) => allowedFromDirectus.includes(t));
  
    if (allowedBlockCollections.length < SIMPLE_BLOCK_TYPES.length) {
      const missing = SIMPLE_BLOCK_TYPES.filter((t) => !allowedFromDirectus.includes(t));
      console.warn(
        'Some simple block types are not allowed on articles_content_blocks.item:',
        missing.join(', ')
      );
    }
  
    function childRelationConfig(parentCollection, oneField) {
      const rel = relations.find(
        (r) => r.related_collection === parentCollection && r.meta?.one_field === oneField
      );
      if (!rel) return null;
      const coll = rel.collection;
      return {
        collection: coll,
        parentField: rel.field,
        fields: writableFieldNames(fields, coll, ['id']),
        translations: translationsConfig(fields, relations, coll),
      };
    }
  
    const blockSchemas = {};
    for (const blockType of SIMPLE_BLOCK_TYPES) {
      let children = {};
      if (blockType === 'block_gallery') {
        children = {
          upload_here: childRelationConfig('block_gallery', 'upload_here'),
          gallery_items: childRelationConfig('block_gallery', 'gallery_items'),
        };
      } else if (blockType === 'block_accordions') {
        children = {
          accordions: childRelationConfig('block_accordions', 'accordions'),
        };
      }
      blockSchemas[blockType] = {
        fields: writableFieldNames(fields, blockType, ['id']),
        translations: translationsConfig(fields, relations, blockType),
        children,
      };
    }
  
    const hasFileAttachments = collections.some((c) => c.collection === FILE_ATTACHMENTS_COLLECTION);
    const hasFileAttachmentTranslations = collections.some(
      (c) => c.collection === FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION
    );
    const hasInfoCards = collections.some((c) => c.collection === INFO_CARDS_COLLECTION);
    const hasInfoCardTranslations = collections.some(
      (c) => c.collection === INFO_CARDS_TRANSLATIONS_COLLECTION
    );
    const hasInfoCardTypes = collections.some((c) => c.collection === INFO_CARD_TYPES_COLLECTION);

    return {
      articleFields: writableFieldNames(fields, C.articles, ['id', 'date_created']),
      translationFields: writableFieldNames(fields, C.articles_translations, ['id']),
      hasCategoryJunction: collections.some((c) => c.collection === C.articles_categories),
      junctionFields: writableFieldNames(fields, C.articles_categories, ['id']),
      hasContentBlocksJunction: collections.some((c) => c.collection === C.articles_content_blocks),
      contentBlockJunctionFields: writableFieldNames(fields, C.articles_content_blocks, ['id']),
      allowedLayouts,
      allowedStatuses,
      allowedBlockCollections,
      blockSchemas,
      hasFileAttachments,
      fileAttachmentFields: hasFileAttachments
        ? writableFieldNames(fields, FILE_ATTACHMENTS_COLLECTION, ['id'])
        : [],
      hasFileAttachmentTranslations,
      fileAttachmentTranslationFields: hasFileAttachmentTranslations
        ? writableFieldNames(fields, FILE_ATTACHMENTS_TRANSLATIONS_COLLECTION, ['id'])
        : [],
      hasInfoCards,
      infoCardFields: hasInfoCards ? writableFieldNames(fields, INFO_CARDS_COLLECTION, ['id']) : [],
      hasInfoCardTranslations,
      infoCardTranslationFields: hasInfoCardTranslations
        ? writableFieldNames(fields, INFO_CARDS_TRANSLATIONS_COLLECTION, ['id'])
        : [],
      hasInfoCardTypes,
      infoCardTypeFields: hasInfoCardTypes
        ? writableFieldNames(fields, INFO_CARD_TYPES_COLLECTION, ['id'])
        : [],
      infoCardTypeMatchableFields: hasInfoCardTypes
        ? nonAliasFieldNames(fields, INFO_CARD_TYPES_COLLECTION, [])
        : [],
      infoCardTypeTranslations: (() => {
        const tr = translationsConfig(fields, relations, INFO_CARD_TYPES_COLLECTION);
        if (!tr) return null;
        return {
          ...tr,
          matchableFields: nonAliasFieldNames(fields, tr.collection, []),
        };
      })(),
    };
  }

  function normalizeArticleLayout(layout, allowedLayouts) {
    const value = String(layout ?? 'basic').trim().toLowerCase();
    if (allowedLayouts.length > 0) {
      const match = allowedLayouts.find((x) => String(x).toLowerCase() === value);
      if (match) return match;
      throw new Error(
        `Invalid layout "${layout}". Allowed values: ${allowedLayouts.join(', ')}`
      );
    }
    if (value === 'basic' || value === 'advanced') return value;
    throw new Error(`Invalid layout "${layout}". Use "basic" or "advanced".`);
  }

  /**
   * Maps payload status to the exact value Directus stores (dropdown "value", not admin label).
   * e.g. label "Published" often maps to value `published` — sending wrong casing breaks the UI.
   */
  function normalizeArticleStatus(status, allowedStatuses) {
    const raw =
      status === undefined || status === null || status === ''
        ? 'published'
        : String(status).trim();

    if (allowedStatuses.length > 0) {
      const match = allowedStatuses.find((x) => String(x).toLowerCase() === raw.toLowerCase());
      if (match) return match;
      throw new Error(`Invalid status "${status}". Allowed values: ${allowedStatuses.join(', ')}`);
    }

    const lower = raw.toLowerCase();
    if (['published', 'draft', 'archived'].includes(lower)) return lower;
    return raw;
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
    return uniqueStrings(rawPaths).map((p, index) => ({ path: p, sort: index + 1 }));
  }

  async function createAdvancedFileAttachments(row, articleId, schema, localPathToFileMap) {
    if (!schema.hasFileAttachments || !isAdvancedLayout(row.layout ?? 'basic')) return [];
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
        const trRows =
          Array.isArray(spec.translations) && spec.translations.length > 0
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

  function detectInfoCardTypeMatch(spec, matchableFields) {
    const mf = spec.match_field;
    const mv = spec.match_value;
    if (mf && mv != null && String(mv).trim() !== '') {
      if (!matchableFields.includes(mf)) {
        throw new Error(
          `info_card_type_upsert.match_field "${mf}" is not on info_card_types (${matchableFields.join(', ') || 'none'}). ` +
            `If the label lives in translations, use match_translation instead and omit match_field.`
        );
      }
      return { field: mf, value: mv };
    }

    for (const field of INFO_CARD_TYPE_MATCH_FIELDS) {
      if (!matchableFields.includes(field)) continue;
      const v = spec[field];
      if (v != null && String(v).trim() !== '') {
        return { field, value: v };
      }
    }
    return null;
  }

  async function findInfoCardTypeParentIdByTranslation(matchTranslation, trCfg) {
    if (!matchTranslation || typeof matchTranslation !== 'object') return null;
    const keys = Object.keys(matchTranslation).filter(
      (k) => matchTranslation[k] != null && String(matchTranslation[k]).trim() !== ''
    );
    if (keys.length === 0) return null;

    const bad = keys.filter((k) => !trCfg.matchableFields.includes(k));
    if (bad.length > 0) {
      throw new Error(
        `info_card_type_upsert.match_translation: unknown field(s) "${bad.join(', ')}" on ${trCfg.collection}. ` +
          `Columns: ${trCfg.matchableFields.join(', ') || '(none)'}.`
      );
    }

    const filter =
      keys.length === 1
        ? { [keys[0]]: { _eq: matchTranslation[keys[0]] } }
        : { _and: keys.map((k) => ({ [k]: { _eq: matchTranslation[k] } })) };

    const rows = await client.request(
      readItems(trCfg.collection, {
        filter,
        fields: [trCfg.foreignField],
        limit: 1,
      })
    );
    return rows?.[0]?.[trCfg.foreignField] ?? null;
  }

  /** Rows for `info_card_types` translations: explicit `type_translations`, else `[match_translation]` if set. */
  function infoCardTypeTranslationRows(spec) {
    if (Array.isArray(spec.type_translations) && spec.type_translations.length > 0) {
      return spec.type_translations;
    }
    if (spec.match_translation && typeof spec.match_translation === 'object') {
      return [spec.match_translation];
    }
    return [];
  }

  /** Create or update translation rows by `languages_code` for this type. */
  async function upsertInfoCardTypeTranslationRows(trCfg, parentId, rows) {
    if (!rows?.length) return;
    const fk = trCfg.foreignField;
    for (const tr of rows) {
      if (!tr?.languages_code) continue;
      const filter = {
        _and: [{ [fk]: { _eq: parentId } }, { languages_code: { _eq: tr.languages_code } }],
      };
      const found = await client.request(
        readItems(trCfg.collection, {
          filter,
          fields: ['id'],
          limit: 1,
        })
      );
      const base = { ...tr, [fk]: parentId };
      const payload = pick(base, trCfg.fields);
      const existingId = found?.[0]?.id;
      if (existingId != null) {
        const updatePayload = Object.fromEntries(
          Object.entries(payload).filter(([k, v]) => k !== fk && v !== undefined)
        );
        if (Object.keys(updatePayload).length > 0) {
          await client.request(updateItem(trCfg.collection, existingId, updatePayload));
        }
      } else {
        await client.request(createItem(trCfg.collection, payload));
      }
    }
  }

  /**
   * Reuse `icon` from another `info_card_types` row (same shape Directus stores: file id, string key, etc.).
   */
  async function borrowInfoCardTypeIconFromPeers(schema) {
    if (!schema.infoCardTypeFields.includes('icon')) return null;
    const rows = await client.request(
      readItems(INFO_CARD_TYPES_COLLECTION, {
        fields: ['icon'],
        filter: { icon: { _nnull: true } },
        limit: 50,
      })
    );
    for (const row of rows ?? []) {
      const v = row?.icon;
      if (v == null || v === '') continue;
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v.id) return v.id;
    }
    return null;
  }

  /**
   * Upsert `info_card_types`: match on parent columns and/or on `info_card_types_translations` (match_translation).
   * Create path: set `icon` explicitly, or `icon_path` (uploaded like other article media), or copy `icon` from an existing type.
   */
  async function upsertInfoCardType(spec, schema, options = {}) {
    if (!schema.hasInfoCardTypes) {
      throw new Error('info_card_type_upsert requires collection info_card_types.');
    }

    const trCfg = schema.infoCardTypeTranslations;
    if (spec.match_translation && !trCfg) {
      throw new Error(
        'info_card_type_upsert.match_translation requires a translations collection linked to info_card_types (relation one_field "translations").'
      );
    }

    let parentId = null;

    const parentMatch = detectInfoCardTypeMatch(spec, schema.infoCardTypeMatchableFields);
    if (parentMatch) {
      const rows = await client.request(
        readItems(INFO_CARD_TYPES_COLLECTION, {
          filter: { [parentMatch.field]: { _eq: parentMatch.value } },
          fields: ['id'],
          limit: 1,
        })
      );
      parentId = rows?.[0]?.id ?? null;
    }

    if (!parentId && spec.match_translation && trCfg) {
      parentId = await findInfoCardTypeParentIdByTranslation(spec.match_translation, trCfg);
    }

    let payload = pick(spec, schema.infoCardTypeFields);
    const { pathToFileId } = options;

    if (!parentId && spec.icon_path && schema.infoCardTypeFields.includes('icon')) {
      const fileId = pathToFileId?.get(spec.icon_path);
      if (!fileId) {
        throw new Error(
          `info_card_type_upsert.icon_path "${spec.icon_path}" was not uploaded. It must match a path collected for this article (e.g. featured_image_path, attachment_paths, block images, or this same icon_path).`
        );
      }
      payload = { ...payload, icon: fileId };
    }

    if (
      !parentId &&
      schema.infoCardTypeFields.includes('icon') &&
      (payload.icon === undefined || payload.icon === null || payload.icon === '')
    ) {
      const borrowed = await borrowInfoCardTypeIconFromPeers(schema);
      if (borrowed != null) {
        payload = { ...payload, icon: borrowed };
      }
    }

    if (parentId) {
      const updatePayload = Object.fromEntries(
        Object.entries(payload).filter(([k, v]) => k !== 'id' && v !== undefined)
      );
      if (Object.keys(updatePayload).length > 0) {
        await client.request(updateItem(INFO_CARD_TYPES_COLLECTION, parentId, updatePayload));
      }
      const trRows = infoCardTypeTranslationRows(spec);
      if (trCfg && trRows.length > 0) {
        await upsertInfoCardTypeTranslationRows(trCfg, parentId, trRows);
      }
      return parentId;
    }

    if (!parentMatch && !spec.match_translation && Object.keys(payload).length === 0) {
      throw new Error(
        `info_card_type_upsert: define match_field + match_value on info_card_types (${schema.infoCardTypeMatchableFields.join(', ') || 'none'}), ` +
          `or match_translation on ${trCfg?.collection ?? 'the types translations collection'} (e.g. languages_code + title). ` +
          `Writable on info_card_types: ${schema.infoCardTypeFields.join(', ') || '(none)'}.`
      );
    }

    if (Object.keys(payload).length === 0) {
      throw new Error(
        'Cannot create info_card_types: no writable fields. Set `icon` or `icon_path` on info_card_type_upsert, or add at least one existing info_card_types row with `icon` set so the importer can copy it.'
      );
    }

    const created = await client.request(createItem(INFO_CARD_TYPES_COLLECTION, payload));
    const newId = created?.id ?? created?.data?.id;
    if (newId == null) throw new Error('Failed to create info_card_types row.');

    if (trCfg) {
      const trRows = infoCardTypeTranslationRows(spec);
      if (trRows.length > 0) {
        await upsertInfoCardTypeTranslationRows(trCfg, newId, trRows);
      }
    }

    return newId;
  }

  async function createAdvancedInfoCards(row, articleId, schema, defaultInfoCardTypeId) {
    if (!schema.hasInfoCards || !schema.hasInfoCardTranslations) return [];
    if (!isAdvancedLayout(row.layout ?? 'basic')) return [];

    const cards = Array.isArray(row.info_cards) ? row.info_cards : [];
    const created = [];

    for (const [index, card] of cards.entries()) {
      const typeId = card.type ?? defaultInfoCardTypeId;
      if (typeId == null || typeId === '') {
        throw new Error(
          `Info card at index ${index} needs "type" (uuid) or article-level "info_card_type_upsert" that resolves to a type id.`
        );
      }

      const cardPayload = pick(
        {
          article: articleId,
          type: typeId,
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
  
  async function assertContentTypeExists(id) {
    const rows = await client.request(
      readItems('content_types', { filter: { id: { _eq: id } }, fields: ['id'], limit: 1 })
    );
    if (!rows?.length) throw new Error(`Unknown content_type id: ${id}`);
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
    const fromExampleArticles = path.resolve(__dirname, '..', rawPath);
    if (await pathExists(fromExampleArticles)) return fromExampleArticles;
    const fromLib = path.resolve(__dirname, rawPath);
    if (await pathExists(fromLib)) return fromLib;
    return fromCwd;
  }
  
  function mimeFromExt(filePath) {
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
  
  async function uploadLocalFile(rawPath) {
    const absolutePath = await resolveLocalPath(rawPath);
    if (!(await pathExists(absolutePath))) {
      throw new Error(`File not found: ${rawPath} (tried ${absolutePath})`);
    }
    const mime = mimeFromExt(absolutePath);
    if (!mime) throw new Error(`Unsupported image type for: ${absolutePath}`);
  
    const buf = await fs.readFile(absolutePath);
    const form = new FormData();
    form.append('file', new Blob([buf], { type: mime }), path.basename(absolutePath));
  
    const res = await fetch(`${directusUrl}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${directusToken}` },
      body: form,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    if (!res.ok) {
      throw new Error(`Upload failed (${res.status}): ${JSON.stringify(json)}`);
    }
    const fileId = json?.data?.id;
    if (!fileId) throw new Error('Upload response missing file id');
    return fileId;
  }
  
  async function createChildRowsForBlock(childCfg, parentBlockId, rows, pathToFileId) {
    if (!childCfg || !Array.isArray(rows) || rows.length === 0) return [];
  
    const orderKey = junctionOrderField(childCfg.fields);
    const createdIds = [];
  
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const payloadObj = { ...row, [childCfg.parentField]: parentBlockId };
  
      if (payloadObj.directus_files_path && childCfg.fields.includes('directus_files_id')) {
        payloadObj.directus_files_id = pathToFileId.get(payloadObj.directus_files_path);
      }
      if (payloadObj.file_path && childCfg.fields.includes('directus_files_id')) {
        payloadObj.directus_files_id = pathToFileId.get(payloadObj.file_path);
      }
      if (payloadObj.image_path && childCfg.fields.includes('image')) {
        payloadObj.image = pathToFileId.get(payloadObj.image_path);
      }
      if (orderKey && payloadObj[orderKey] === undefined) {
        payloadObj[orderKey] = index + 1;
      }
  
      const payload = pick(payloadObj, childCfg.fields);
      const item = await client.request(createItem(childCfg.collection, payload));
      const itemId = item?.id ?? item?.data?.id;
      if (itemId == null) throw new Error(`Failed to create row in "${childCfg.collection}".`);
  
      if (childCfg.translations && row.translations?.length) {
        for (const tr of row.translations) {
          if (!tr.languages_code) continue;
          const trRow = { ...tr, [childCfg.translations.foreignField]: itemId };
          if (trRow.image_path && childCfg.translations.fields.includes('image')) {
            trRow.image = pathToFileId.get(trRow.image_path);
          }
          await client.request(
            createItem(childCfg.translations.collection, pick(trRow, childCfg.translations.fields))
          );
        }
      }
  
      createdIds.push(itemId);
    }
  
    return createdIds;
  }
  
  async function createSimpleBlockAndLink({ articleId, block, order, schema, pathToFileId }) {
    const type = String(block.type ?? '').trim();
    if (!SIMPLE_BLOCK_TYPES.includes(type)) {
      throw new Error(`Unsupported block type "${type}". Use: ${SIMPLE_BLOCK_TYPES.join(', ')}`);
    }
    if (!schema.allowedBlockCollections.includes(type)) {
      throw new Error(`Directus does not allow "${type}" on articles. Check articles_content_blocks.item.`);
    }
  
    const bs = schema.blockSchemas[type];
    const data = { ...(block.data ?? {}) };
  
    if (type === 'block_video' && data.video_file_path) {
      data.video_file = pathToFileId.get(data.video_file_path);
      delete data.video_file_path;
    }
    if (type === 'block_embed') {
      if (!data.url && !data.code) {
        throw new Error('block_embed needs data.url and/or data.code (e.g. iframe HTML for a chart).');
      }
    }
  
    const blockPayload = pick(data, bs.fields);
    const created = await client.request(createItem(type, blockPayload));
    const blockId = created?.id ?? created?.data?.id;
    if (!blockId) throw new Error(`No id returned when creating ${type}`);
  
    const trCfg = bs.translations;
    if (trCfg) {
      const translations = block.translations ?? [];
      if (BLOCK_TYPES_REQUIRING_TRANSLATIONS.has(type) && translations.length === 0) {
        throw new Error(`${type} needs a non-empty translations array`);
      }
      for (const tr of translations) {
        if (!tr.languages_code) continue;
        const row = { ...tr, [trCfg.foreignField]: blockId };
        if (row.image_path && trCfg.fields.includes('image')) {
          const fid = pathToFileId.get(row.image_path);
          if (!fid) throw new Error(`No file id for image_path: ${row.image_path}`);
          row.image = fid;
        }
        await client.request(createItem(trCfg.collection, pick(row, trCfg.fields)));
      }
    }
  
    let accordionIds = [];
    if (type === 'block_accordions') {
      const ch = bs.children ?? {};
      const accordionRows = block.accordions ?? [];
      if (accordionRows.length > 0 && !ch.accordions) {
        throw new Error(
          'block_accordions with accordions needs relation "accordions" on block_accordions.'
        );
      }
      accordionIds = await createChildRowsForBlock(
        ch.accordions,
        blockId,
        accordionRows,
        pathToFileId
      );
    }

    let galleryUploadIds = [];
    let galleryItemIds = [];
    if (type === 'block_gallery') {
      const ch = bs.children ?? {};
      const needsUpload = (block.upload_files_paths ?? []).length > 0;
      const needsItems = (block.gallery_items ?? []).length > 0;
      if (needsUpload && !ch.upload_here) {
        throw new Error('block_gallery with upload_files_paths needs relation "upload_here" on block_gallery.');
      }
      if (needsItems && !ch.gallery_items) {
        throw new Error('block_gallery with gallery_items needs relation "gallery_items" on block_gallery.');
      }
      const uploadRows = (block.upload_files_paths ?? []).map((p) => ({ directus_files_path: p }));
      galleryUploadIds = await createChildRowsForBlock(ch.upload_here, blockId, uploadRows, pathToFileId);
      galleryItemIds = await createChildRowsForBlock(
        ch.gallery_items,
        blockId,
        block.gallery_items ?? [],
        pathToFileId
      );
    }
  
    const jf = schema.contentBlockJunctionFields;
    const orderKey = junctionOrderField(jf);
    const linkPayload = pick(
      {
        articles_id: articleId,
        collection: type,
        item: blockId,
        ...(orderKey ? { [orderKey]: order } : {}),
      },
      jf
    );
    await client.request(createItem(C.articles_content_blocks, linkPayload));
  
    return {
      type,
      id: blockId,
      order,
      ...(type === 'block_accordions' ? { accordions: accordionIds } : {}),
      ...(type === 'block_gallery'
        ? { gallery_upload_here: galleryUploadIds, gallery_items: galleryItemIds }
        : {}),
    };
  }
  