/**
 * Batched ETL: for each **extract** yield → **transform** → **load**.
 *
 * - **`stages.batchSize`** is set on **`context.batchSize`** before **`extract(context)`**.
 * - **`extract`** must return a sync or async **iterable** (not a Promise).
 * - Per yield: if the value is an **array of plain objects**, **`transform`** runs on **each** element and
 *   **`load`** receives the resulting array; otherwise **`transform`** runs **once** on the whole yield and
 *   **`load`** receives that result.
 *
 * @template TResult
 * @param {object} stages
 * @param {(ctx: object) => Iterable<unknown> | AsyncIterable<unknown>} stages.extract
 * @param {(item: unknown, ctx: object) => unknown | Promise<unknown>} stages.transform
 * @param {(canonical: unknown, ctx: object) => TResult | Promise<TResult>} stages.load
 * @param {number} stages.batchSize
 * @param {object} [context={}]
 * @returns {Promise<TResult[]>}
 */
export async function etlPipe(stages, context = {}) {
  const { extract, transform, load, batchSize } = stages;

  if (typeof extract !== 'function' || typeof transform !== 'function' || typeof load !== 'function') {
    throw new Error('etlPipe requires stages.extract, stages.transform, and stages.load as functions');
  }
  if (!(Number.isFinite(batchSize) && batchSize > 0)) {
    throw new Error('etlPipe requires a positive finite stages.batchSize');
  }

  const ctx = { ...context, batchSize };
  const iterable = extract(ctx);

  if (iterable != null && typeof iterable.then === 'function') {
    throw new Error(
      'etlPipe: extract must return an iterable, not a Promise. Use an async generator and yield batches instead.',
    );
  }

  /** @param {unknown} payload */
  async function applyTransform(payload) {
    if (
      Array.isArray(payload) &&
      payload.every((x) => x != null && typeof x === 'object' && !Array.isArray(x))
    ) {
      const mapped = [];
      for (const item of payload) mapped.push(await transform(item, ctx));
      return mapped;
    }
    return transform(payload, ctx);
  }

  const results = [];

  if (iterable?.[Symbol.asyncIterator]) {
    for await (const item of iterable) {
      results.push(await load(await applyTransform(item), ctx));
    }
    return results;
  }

  if (iterable?.[Symbol.iterator]) {
    for (const item of iterable) {
      results.push(await load(await applyTransform(item), ctx));
    }
    return results;
  }

  throw new Error(
    'etlPipe: extract must return an async iterable or iterable (e.g. async function* (ctx) { yield item; }).',
  );
}
