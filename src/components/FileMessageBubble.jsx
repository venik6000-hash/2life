import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { isImageLike } from "../utils/messengerUiUtils";

export default function FileMessageBubble({ msg, chatId, downloadFile, getFileUrl, onOpenImage }) {
  const { $ } = useTheme();
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const previewUrlRef = useRef("");
  const meta = useMemo(() => {
    try { return JSON.parse(msg.text); } catch { return { name: "Файл", type: "", size: 0 }; }
  }, [msg.text]);

  const isImage = msg.msg_type === "image" || isImageLike(meta?.type, meta?.name, meta?.thumb);

  const handleDownload = async () => {
    if (!meta?.iv) {
      setError("Не удалось открыть файл: отсутствуют данные шифрования");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const ok = await downloadFile(chatId, msg.file_id, meta.iv, meta.name, meta.type);
      if (!ok) setError("Не удалось расшифровать или скачать файл");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const revoke = () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
      setPreviewUrl("");
    };
    revoke();

    if (!isImage) return revoke;
    if (meta?.thumb) return revoke;
    if (!msg?.file_id || !meta?.iv) return revoke;

    let cancelled = false;
    setPreviewLoading(true);
    getFileUrl(chatId, msg.file_id, meta.iv, meta.type || "image/*")
      .then((url) => {
        if (!url) return;
        if (cancelled) { URL.revokeObjectURL(url); return; }
        previewUrlRef.current = url;
        setPreviewUrl(url);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPreviewLoading(false); });

    return () => { cancelled = true; revoke(); };
  }, [chatId, getFileUrl, isImage, meta?.iv, meta?.thumb, meta?.type, msg?.file_id]);

  if (isImage) {
    const previewSrc = meta?.thumb || previewUrl;
    return (
      <div
        style={{ cursor: "pointer", width: "min(240px, 100%)", display: "flex", flexDirection: "column", gap: 4 }}
        onClick={() => onOpenImage?.({ fileId: msg.file_id, iv: meta?.iv, name: meta?.name, type: meta?.type || "image/*" })}
        title="Открыть изображение"
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={meta?.name || "Изображение"}
            style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, display: "block", background: "rgba(255,255,255,.08)" }}
            loading="lazy"
          />
        ) : (
          <div style={{ padding: "8px 10px", background: "rgba(255,255,255,.1)", borderRadius: 6, fontSize: 11, color: $.txS }}>
            🖼 Изображение<br />
            <span style={{ fontSize: 10, opacity: .7 }}>{meta?.size ? `${Math.round(meta.size / 1024)} KB` : ""}</span>
          </div>
        )}
        {previewLoading && <div style={{ fontSize: 10, opacity: .6 }}>Загрузка превью...</div>}
        {loading && <div style={{ fontSize: 10, opacity: .6, marginTop: 2 }}>Загрузка...</div>}
        {error && <div style={{ fontSize: 10, color: $.dn, marginTop: 2 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ cursor: "pointer", minWidth: 0 }} onClick={handleDownload}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "rgba(255,255,255,.1)", borderRadius: 6 }}>
        <span style={{ fontSize: 16 }}>📎</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta?.name || "Файл"}</div>
          <div style={{ fontSize: 10, opacity: .7 }}>{meta?.size ? `${Math.round(meta.size / 1024)} KB` : ""} {loading ? "· Загрузка..." : ""}</div>
        </div>
      </div>
      {error && <div style={{ fontSize: 10, color: $.dn, marginTop: 2 }}>{error}</div>}
    </div>
  );
}
