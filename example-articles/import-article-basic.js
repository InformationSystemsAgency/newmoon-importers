/**
 * One-article import demo — `layout: 'basic'` (no file_attachments / info_cards).
 *
 * From repo root:
 *   node example-articles/import-article-basic.js
 *
 * Needs: DIRECTUS_URL, DIRECTUS_IMPORTER_TOKEN in .env (root or example-articles/).
 */

import { fileURLToPath } from 'url';
import pathModule from 'path';
import { importArticle } from './lib/helpers.js';
import { writeImportLog } from '../utils/write-log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathModule.dirname(__filename);

// ---------------------------------------------------------------------------
// 1) Your data (JSON). Change UUIDs, paths, and text to match your project.
// ---------------------------------------------------------------------------

const ArticleBasicLayout = {
  content_type: 'a41b2288-526c-4241-baa4-6af53257bc06',
  // Must match Directus `articles.status` choice **value** (often lowercase), not the admin label.
  status: 'published',
  layout: 'basic',
  date_created: '2026-03-31T12:00:00.000Z',
  published_date: '2026-03-31T12:00:00.000Z',
  featured_image_path: 'attachments/1-800x600.png',
  categories: [
    '2af20969-1152-4165-8c37-99357760fd6f',
    'fbaaea30-78e4-4a98-bcf8-51c766ad58e5',
  ],
  translations: [
    {
      languages_code: 'en',
      title: 'Simple article (EN)',
      slug: 'simple-article-en',
      short_description: '<p>Short teaser in English.</p>',
    },
    {
      languages_code: 'hy',
      title: 'Պարզ հոդված 1 (HY)',
      slug: 'simple-article-hy',
      short_description: '<p>Կարճ նկարագրություն հայերեն։</p>',
    },
  ],
  content_blocks: [
    {
      type: 'block_title',
      data: { font_size: 'h3', column_size: '1/1' },
      translations: [
        { languages_code: 'en', title: 'Section heading (EN)' },
        { languages_code: 'hy', title: 'Բաժնի վերնագիր (HY)' },
      ],
    },
    {
      type: 'block_richtext',
      data: { font_size: 'base', column_size: '1/1' },
      translations: [
        { languages_code: 'en', content: '<p>Main body <strong>rich text</strong> in English.</p>' },
        { languages_code: 'hy', content: '<p>Հիմնական տեքստը հայերեն։</p>' },
      ],
    },
    {
      type: 'block_alert',
      data: { variant: 'info' },
      translations: [
        {
          languages_code: 'en',
          title: 'Note (EN)',
          content: '<p>Alert body in English.</p>',
        },
        {
          languages_code: 'hy',
          title: 'Նշում (HY)',
          content: '<p>Զգուշացման տեքստը հայերեն։</p>',
        },
      ],
    },
    {
      type: 'block_image',
      data: { image_size: '1/1', alignment: 'left' },
      translations: [
        {
          languages_code: 'en',
          image_path: 'attachments/1-800x600.png',
          image_alt_text: 'Illustration (EN)',
        },
        {
          languages_code: 'hy',
          image_path: 'attachments/1-800x600.png',
          image_alt_text: 'Պատկեր (HY)',
        },
      ],
    },
    {
      type: 'block_video',
      data: {
        type: 'url',
        video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        video_size: '1/1',
      },
    },
    {
      type: 'block_gallery',
      upload_files_paths: ['attachments/1-800x600.png', 'attachments/3-800x600.png'],
      gallery_items: [
        {
          order: 1,
          image_path: 'attachments/1-800x600.png',
          translations: [
            { languages_code: 'en', image_alt_text: 'Gallery slide 1 (EN)' },
            { languages_code: 'hy', image_alt_text: 'Պատկերասրահ 1 (HY)' },
          ],
        },
        {
          order: 2,
          image_path: 'attachments/3-800x600.png',
          translations: [
            { languages_code: 'en', image_alt_text: 'Gallery slide 2 (EN)' },
            { languages_code: 'hy', image_alt_text: 'Պատկերասրահ 2 (HY)' },
          ],
        },
      ],
    },
    {
      type: 'block_accordions',
      data: { column_size: '1/1' },
      accordions: [
        {
          translations: [
            { languages_code: 'en', title: 'First panel (EN)', content: '<p>Accordion body in English.</p>' },
            {
              languages_code: 'hy',
              title: 'Առաջին վահանակ (HY)',
              content: '<p>Ակորդեոնի բովանդակություն հայերեն։</p>',
            },
          ],
        },
        {
          translations: [
            { languages_code: 'en', title: 'Second panel (EN)', content: '<p>More details here.</p>' },
            {
              languages_code: 'hy',
              title: 'Երկրորդ վահանակ (HY)',
              content: '<p>Լրացուցիչ տեղեկություններ։</p>',
            },
          ],
        },
      ],
    },
    {
      type: 'block_embed',
      data: {
        mode: 'code',
        code: `<iframe title="Sample chart embed" width="600" height="400" src="https://www.gapminder.org/tools/#$chart-type:bubbles" style="border:0" loading="lazy"></iframe>`,
      },
    },
  ],
};

importArticle(ArticleBasicLayout)
  .then(async (result) => {
    const importLogsDir = pathModule.resolve(__dirname, 'import-logs');
    const outPath = await writeImportLog(importLogsDir, 'articles.imported', [result]);
    console.log(`Created article ${result.id}`);
    console.log(`Log: ${outPath}`);
    console.log('Article imported successfully');
  })
  .catch((error) => {
    console.error('Error importing article:', error);
    process.exit(1);
  });