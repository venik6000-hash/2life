const IMAGE_NAME_RE = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|svg)$/i;

export const fmtTime = (ts) => {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export const fmtDate = (ts) => {
  const date = new Date(ts);
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

export const fmtSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const isImageLike = (type, name, thumb) => {
  if (thumb) return true;
  const normalizedType = String(type || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return IMAGE_NAME_RE.test(String(name || ""));
};

export const parseBundleMeta = (text) => {
  try {
    const parsed = JSON.parse(text || "{}");
    const items = Array.isArray(parsed?.files) ? parsed.files : [];
    return {
      bundleType: typeof parsed?.bundleType === "string" ? parsed.bundleType : null,
      files: items
        .map((item) => ({
          fileId: item?.fileId || item?.id || null,
          iv: item?.iv || null,
          name: item?.name || "Файл",
          type: item?.type || "application/octet-stream",
          size: Number(item?.size) || 0,
          thumb: item?.thumb || null,
        }))
        .filter((item) => item.fileId && item.iv),
    };
  } catch {
    return { bundleType: null, files: [] };
  }
};

export const parseBundleFiles = (text) => parseBundleMeta(text).files;

export const getPhotoBundleLayout = (count) => {
  const normalized = Math.max(1, Math.min(10, Number(count) || 1));
  const tiles = Array.from({ length: normalized }, () => ({ colSpan: 1, rowSpan: 1 }));
  let cols = 2;
  let rowHeight = 96;

  switch (normalized) {
    case 1:
      cols = 1;
      rowHeight = 220;
      break;
    case 2:
      cols = 2;
      rowHeight = 120;
      break;
    case 3:
      cols = 2;
      rowHeight = 96;
      tiles[0] = { colSpan: 1, rowSpan: 2 };
      break;
    case 4:
      cols = 2;
      rowHeight = 95;
      break;
    case 5:
      cols = 3;
      rowHeight = 80;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      break;
    case 6:
      cols = 3;
      rowHeight = 78;
      break;
    case 7:
      cols = 4;
      rowHeight = 66;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      break;
    case 8:
      cols = 4;
      rowHeight = 64;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      tiles[1] = { colSpan: 2, rowSpan: 2 };
      break;
    case 9:
      cols = 3;
      rowHeight = 74;
      break;
    default:
      cols = 4;
      rowHeight = 62;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      break;
  }

  return { cols, rowHeight, tiles };
};

export const isClientRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "viewer" || normalized === "client";
};

export const formatRoleLabel = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "viewer" || normalized === "client") return "Клиент";
  if (normalized === "admin") return "Администратор";
  if (normalized === "doctor") return "Врач";
  if (normalized === "nutritionist") return "Нутрициолог";
  return String(role || "").trim() || "Пользователь";
};
