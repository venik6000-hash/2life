import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { isImageLike, fmtSize, getPhotoBundleLayout, parseBundleMeta } from "../utils/messengerUiUtils";

export default function FileBundleBubble({ msg, chatId, downloadFile, downloadFiles, getFileUrl, onOpenImage }) {
  const { $ } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewMap, setPreviewMap] = useState({});
  const previewUrlsRef = useRef([]);
  const parsedBundle = useMemo(() => parseBundleMeta(msg.text), [msg.text]);
  const files = parsedBundle.files;
  const imageFiles = useMemo(() => files.filter((f) => isImageLike(f.type, f.name, f.thumb)), [files]);
  const nonImageFiles = useMemo(() => files.filter((f) => !isImageLike(f.type, f.name, f.thumb)), [files]);
  const isPhotoBundle = imageFiles.length > 0 && (parsedBundle.bundleType === "images" || nonImageFiles.length === 0);
  const visiblePhotos = useMemo(() => imageFiles.slice(0, 10), [imageFiles]);
  const photoLayout = useMemo(() => getPhotoBundleLayout(visiblePhotos.length || 1), [visiblePhotos.length]);

  useEffect(() => {
    const clearPreviewUrls = () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current = [];
      setPreviewMap({});
    };
    clearPreviewUrls();

    const candidates = imageFiles.filter((f) => !f.thumb);
    if (candidates.length === 0) return clearPreviewUrls;

    let cancelled = false;
    (async () => {
      const nextMap = {};
      for (const file of candidates) {
        try {
          const url = await getFileUrl(chatId, file.fileId, file.iv, file.type || "image/*");
          if (!url) continue;
          if (cancelled) { URL.revokeObjectURL(url); continue; }
          previewUrlsRef.current.push(url);
          nextMap[file.fileId] = url;
        } catch { /* ignore individual preview errors */ }
      }
      if (!cancelled) setPreviewMap(nextMap);
    })();

    return () => { cancelled = true; clearPreviewUrls(); };
  }, [chatId, imageFiles, getFileUrl]);

  const handleDownloadAll = async () => {
    if (files.length === 0) { setError("Не удалось прочитать список файлов"); return; }
    setLoading(true);
    setError("");
    try {
      const result = await downloadFiles(chatId, files);
      if (!result?.ok) {
        if ((result?.downloaded || 0) === 0) {
          setError("Не удалось скачать файлы");
        } else {
          setError(`Скачано ${result.downloaded} из ${result.total}`);
        }
      }
    } finally { setLoading(false); }
  };

  const handleDownloadOne = async (file) => {
    setError("");
    const ok = await downloadFile(chatId, file.fileId, file.iv, file.name, file.type, { forceDownload: true });
    if (!ok) setError(`Не удалось скачать: ${file.name}`);
  };

  if (isPhotoBundle) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 230, maxWidth: 340 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${photoLayout.cols}, minmax(0, 1fr))`,
          gridAutoRows: `${photoLayout.rowHeight}px`,
          gridAutoFlow: "dense",
          gap: 2,
          borderRadius: 10,
          overflow: "hidden",
          background: "rgba(255,255,255,.08)",
        }}>
          {visiblePhotos.map((file, idx) => {
            const tile = photoLayout.tiles[idx] || { colSpan: 1, rowSpan: 1 };
            const previewSrc = file.thumb || previewMap[file.fileId];
            const hiddenTail = imageFiles.length - visiblePhotos.length;
            return (
              <button
                key={file.fileId}
                onClick={() => onOpenImage?.(file)}
                title="Открыть изображение"
                style={{
                  position: "relative", border: "none", cursor: "pointer", padding: 0, margin: 0,
                  background: "rgba(255,255,255,.08)", color: "inherit",
                  gridColumn: `span ${tile.colSpan}`, gridRow: `span ${tile.rowSpan}`,
                  minHeight: 0, minWidth: 0,
                }}
              >
                {previewSrc ? (
                  <img src={previewSrc} alt="Фото" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, opacity: .65 }}>🖼</div>
                )}
                {idx === visiblePhotos.length - 1 && hiddenTail > 0 && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.4)", color: "#fff", fontSize: 16, fontWeight: 700 }}>
                    +{hiddenTail}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, opacity: .75 }}>🖼 Фото ({imageFiles.length})</div>
          <button
            onClick={handleDownloadAll}
            disabled={loading || files.length === 0}
            style={{ border: "none", cursor: loading || files.length === 0 ? "default" : "pointer", fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.15)", color: "#fff", opacity: loading || files.length === 0 ? .65 : 1 }}
          >
            {loading ? "..." : "Скачать все"}
          </button>
        </div>
        {error && <div style={{ fontSize: 10, color: $.dn }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 230 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>📎 Файлы ({files.length})</div>
        <button
          onClick={handleDownloadAll}
          disabled={loading || files.length === 0}
          style={{ border: "none", cursor: loading || files.length === 0 ? "default" : "pointer", fontSize: 11, padding: "4px 8px", borderRadius: 6, background: "rgba(255,255,255,.15)", color: "#fff", opacity: loading || files.length === 0 ? .65 : 1 }}
        >
          {loading ? "..." : "Скачать все"}
        </button>
      </div>
      {files.map((file) => (
        <button
          key={file.fileId}
          onClick={() => isImageLike(file.type, file.name, file.thumb) ? onOpenImage?.(file) : handleDownloadOne(file)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", cursor: "pointer", borderRadius: 6, background: "rgba(255,255,255,.1)", color: "inherit", textAlign: "left" }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {isImageLike(file.type, file.name, file.thumb) && (file.thumb || previewMap[file.fileId]) ? (
              <img src={file.thumb || previewMap[file.fileId]} alt={file.name} style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 6, flexShrink: 0, display: "block" }} loading="lazy" />
            ) : (
              <span style={{ fontSize: 15, opacity: .9, flexShrink: 0 }}>📄</span>
            )}
            <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
          </span>
          <span style={{ fontSize: 10, opacity: .75, flexShrink: 0 }}>{fmtSize(file.size)}</span>
        </button>
      ))}
      {error && <div style={{ fontSize: 10, color: $.dn }}>{error}</div>}
    </div>
  );
}
