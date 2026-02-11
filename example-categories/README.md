# Category import example

Example scripts to **import** and **remove** **categories** (with optional **subcategories**) in [Directus](https://directus.io) via the REST API and a static token.

## Scripts

| Script | Description |
|--------|-------------|
| `import.categories.js` | Creates categories from `EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES` and writes IDs and titles to `imports/categories.imported.{timestamp}.json` in this folder. Timestamp format: `YYMMDDHMS`. |
| `remove.categories.js` | Deletes all categories listed in a given imported JSON file. Pass the file path as the first argument. |

## Prerequisites

- Directus with a **categories** collection and **categories_translations** (translations interface).
- **categories**: `parent_category` (M2O to self).
- **categories_translations**: `categories_id`, `languages_code`, `title`.

## Environment variables

In the project root or in this folder, create a `.env` file:

```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

- **Import**: token must have **create** on `categories` and `categories_translations`.
- **Remove**: token must have **delete** on `categories`. You can copy from the project root `.env.example`.

## How to run

### Import

From the **project root**:

```bash
node example-categories/import.categories.js
```

From **this folder** (`example-categories`):

```bash
node import.categories.js
```

When the import finishes, it writes a file to **this folder** at `imports/categories.imported.YYMMDDHMS.json` (e.g. `imports/categories.imported.250211143052.json`). Use that path with the remove script.

### Remove

Pass the path to one of the imported JSON files.

From the **project root**:

```bash
node example-categories/remove.categories.js example-categories/imports/categories.imported.250211143052.json
```

From **this folder**:

```bash
node remove.categories.js imports/categories.imported.250211143052.json
```

Remove deletes subcategories first, then parents. If you run it without a file path, it prints an error and usage.

## What the import does

1. Loads `DIRECTUS_URL` and `DIRECTUS_IMPORTER_TOKEN` from `.env`.
2. Fetches the Directus schema for `categories` and `categories_translations`.
3. For each item in `EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES`:
   - Creates the **parent** category and its translations.
   - For each **subcategory**, creates a category with `parent_category` set to the parent id and creates its translations.
4. Writes IDs and titles to `imports/categories.imported.{timestamp}.json` in this folder.

Example output:

```
📡 Reading schema from Directus...

✅ Collection: categories
   Fields: parent_category, ...
   Translations: categories_translations (categories_id, languages_code, title)

   ✅ Created: News (id: ...)
      └ sub: Press Releases (id: ...)
      └ sub: Announcements (id: ...)
   ...

🎉 Done. Created 9 category item(s).
   Wrote IDs and titles to categories.imported.250211143052.json
```

## Data shape and examples

The import reads the array `EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES` in `import.categories.js`:

| Field           | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| `title`         | object | yes      | `{ en: 'Title', hy: 'Վերնագիր' }` — one key per language. |
| `subcategories` | array  | no       | Child categories (same shape; this example uses one level only). |

### Flat list (no subcategories)

```javascript
const EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES = [
  { title: { en: 'News', hy: 'Նորություններ' } },
  { title: { en: 'Events', hy: 'Իրադարձություններ' } },
  { title: { en: 'Documents', hy: 'Փաստաթղթեր' } },
];
```

### Parents with subcategories

```javascript
const EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES = [
  {
    title: { en: 'News', hy: 'Նորություններ' },
    subcategories: [
      { title: { en: 'Press Releases', hy: 'Մամլոյան հաղորդագրություններ' } },
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
];
```

### Single language

```javascript
{ title: { en: 'News' } }
```

## Customizing

1. **Change the data**: Edit `EXAMPLE_CATEGORIES_WITH_SUBCATEGORIES` in `import.categories.js` (add/remove items or subcategories).
2. **Different collection names**: Update `CATEGORIES_COLLECTION` and `CATEGORIES_TRANSLATIONS_COLLECTION` in both scripts; the import still reads the schema from Directus.
3. **Re-running import**: The import always creates new items. To clean up, run the remove script with the path to the relevant `categories.imported.*.json` file, or add your own upsert logic.

## Dependencies

Uses `@directus/sdk` and `dotenv` from the project root. The import script also uses `utils/timestamp.js` for the output filename. No extra install is needed in this folder when running from the project root.
