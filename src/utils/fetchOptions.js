export function withNoStoreCache(opts = {}) {
  return {
    ...opts,
    cache: opts.cache || "no-store",
  };
}
