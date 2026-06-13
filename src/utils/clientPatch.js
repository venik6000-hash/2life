const isPlainObject = (value) =>
  value != null &&
  typeof value === "object" &&
  !Array.isArray(value);

const deepEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false;
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
};

export const buildPatchOps = (prevValue, nextValue, path = []) => {
  const ops = [];

  const walk = (prevNode, nextNode, currentPath) => {
    if (deepEqual(prevNode, nextNode)) return;

    const prevObj = isPlainObject(prevNode);
    const nextObj = isPlainObject(nextNode);
    if (prevObj && nextObj) {
      const keys = new Set([...Object.keys(prevNode), ...Object.keys(nextNode)]);
      for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(nextNode, key)) {
          ops.push({ op: "delete", path: [...currentPath, key] });
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(prevNode, key)) {
          ops.push({ op: "set", path: [...currentPath, key], value: nextNode[key] });
          continue;
        }
        walk(prevNode[key], nextNode[key], [...currentPath, key]);
      }
      return;
    }

    const prevArr = Array.isArray(prevNode);
    const nextArr = Array.isArray(nextNode);
    if (prevArr || nextArr) {
      if (!prevArr || !nextArr) {
        ops.push({ op: "set", path: [...currentPath], value: nextNode });
        return;
      }
      const minLen = Math.min(prevNode.length, nextNode.length);
      for (let i = 0; i < minLen; i += 1) {
        walk(prevNode[i], nextNode[i], [...currentPath, i]);
      }
      if (nextNode.length > prevNode.length) {
        for (let i = prevNode.length; i < nextNode.length; i += 1) {
          ops.push({ op: "set", path: [...currentPath, i], value: nextNode[i] });
        }
      } else if (prevNode.length > nextNode.length) {
        for (let i = prevNode.length - 1; i >= nextNode.length; i -= 1) {
          ops.push({ op: "delete", path: [...currentPath, i] });
        }
      }
      return;
    }

    ops.push({ op: "set", path: [...currentPath], value: nextNode });
  };

  walk(prevValue, nextValue, path);
  return ops;
};

export const collapsePatchOps = (ops = []) => {
  const seen = new Set();
  const compact = [];
  const pathKey = (path = []) => path.map(String).join(".");
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    const op = ops[i];
    const key = pathKey(op?.path || []);
    if (seen.has(key)) continue;
    seen.add(key);
    compact.push(op);
  }
  return compact.reverse();
};
