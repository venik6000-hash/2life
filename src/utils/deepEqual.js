// Structural deep-equality for JSON-shaped values (plain objects, arrays,
// primitives). Used to preserve the referential identity of state when a fresh
// fetch returns content-identical data — avoiding spurious re-renders and
// effect re-runs (e.g. the dashboard bootstrap re-firing because a post-login
// token re-validation handed back an equal-but-new permissions object).
const isPlainObject = (value) =>
  value != null &&
  typeof value === "object" &&
  !Array.isArray(value);

export function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = isPlainObject(a);
  const bObj = isPlainObject(b);
  if (aObj || bObj) {
    if (!aObj || !bObj) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}
