# NewMoon Importers

**[English](README.md)** | Հայերեն

Node.js սկրիպտներ՝ հոդվածները NewMoon CMS-ի Directusի մեջ ներմուծելու համար։

Այս պահին պահեստում կա աշխատող **հոդվածների** ներմուծիչ (`example-articles/`)։

## Պահանջներ

- Node.js 18+
- Մուտք Directus
- Ստատիկ API թոքեն՝ անհրաժեշտ հավաքածուների թույլտվություններով

## Տեղադրում

1. Տեղադրել կախվածությունները՝

```bash
npm install
```

1. Կարգավորել միջավայրը նախագծի արմատային `.env` ֆայլում՝

```env
DIRECTUS_URL=http://localhost:8055
DIRECTUS_IMPORTER_TOKEN=your_static_token_here
```

## Նախագծի կառուցվածք

- `example-articles/`
  - `import-article-basic.js` — հիմնական `layout` դեմո
  - `import-article-advanced.js` — ընդլայնված `layout` (կցված ֆայլեր, info cards) դեմո
  - `lib/helpers.js` — `importArticle(payload)`
  - `remove.articles.js` — ներմուծված հոդվածների ջնջում snapshot ֆայլից
  - `README.md` — payload-ի ձևեր, բլոկներ, միջավայր, օգտագործում
- `utils/` — `write-log.js` (`writeImportLog`), `timestamp.js` (լոգի ֆայլի ժամանակի նշում)

## Հոդվածների ներմուծիչ

Ստեղծում է հոդվածներ թարգմանություններով, գլխավոր պատկերի վերբեռնմամբ, սովորական և ընդլայնված (`layout: 'advanced')` տարբերակներով և բովանդակության բլոկներով։ Payload-ի ընտրանքները և լրացուցիչ դաշտերը նկարագրված են `example-articles/README.md` ֆայլում։

- **Փաստաթղթեր՝** `example-articles/README.md`

**Ներմուծում**

```bash
node example-articles/import-article-basic.js
node example-articles/import-article-advanced.js
```

**Ջնջում** (փոխանցել snapshot JSON֊ը `import-logs/`-ից)

```bash
node example-articles/remove.articles.js example-articles/import-logs/articles.imported.<timestamp>.json
```

## Ելքի snapshot-ներ

Ներմուծված հոդվածների մասին տեղեկությունը գրվում է `example-articles/import-logs/` պանակում՝

- Հիմնական դեմո՝ `articles.imported.{timestamp}.json`
- Ընդլայնված դեմո՝ `articles-advanced.imported.{timestamp}.json`

Ներմուծված հոդվածները հեռացնելու համար օգտագործիր `remove.articles.js` սքրիփթը։

## Նշումներ

- `import-logs/` ֆայլերը սովորաբար git-ում անտեսվում են։
- Directus-ում `date_created`-ը սահմանվում է ստեղծման պահին. հոդվածների ներմուծիչը կարող է հետագա թարմացման մեջ կիրառել հատուկ արժեք՝ մանրամասները `example-articles/README.md` ֆայլում։

