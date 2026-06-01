export function withNoStoreCache(opts = {}) {
  return {
    ...opts,
    cache: opts.cache || "no-store",
  };
}

export class TimeoutError extends Error {
  constructor(message) { super(message || "Превышено время ожидания запроса"); this.name = "TimeoutError"; }
}
