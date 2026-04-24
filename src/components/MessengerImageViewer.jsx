export default function MessengerImageViewer({ imageViewer, onClose, onNavigate }) {
  const multi = (imageViewer.items || []).length > 1;

  const navBtnStyle = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    background: "rgba(255,255,255,.18)", border: "none", color: "#fff",
    width: 42, height: 42, borderRadius: "50%", cursor: "pointer", fontSize: 22, lineHeight: 1,
    fontFamily: "inherit",
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(10,10,12,.88)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10001, padding: 24 }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: "50%", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}
        title="Закрыть"
      >✕</button>

      {multi && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}
          style={{ ...navBtnStyle, left: 16 }}
          title="Предыдущее изображение"
        >‹</button>
      )}
      {multi && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(1); }}
          style={{ ...navBtnStyle, right: 16 }}
          title="Следующее изображение"
        >›</button>
      )}

      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "96vw", maxHeight: "90vh" }}>
        {imageViewer.loading && (
          <div style={{ color: "rgba(255,255,255,.84)", fontSize: 13 }}>Загрузка изображения...</div>
        )}
        {!imageViewer.loading && imageViewer.url && (
          <img
            src={imageViewer.url}
            alt={imageViewer.name || "Изображение"}
            style={{ maxWidth: "96vw", maxHeight: "84vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 6px 28px rgba(0,0,0,.35)" }}
          />
        )}
        {!imageViewer.loading && !imageViewer.url && (
          <div style={{ color: "rgba(255,255,255,.84)", fontSize: 13 }}>{imageViewer.error || "Не удалось открыть изображение"}</div>
        )}
        {multi && (
          <div style={{ color: "rgba(255,255,255,.92)", fontSize: 12, textAlign: "center" }}>
            {imageViewer.index + 1}/{imageViewer.items.length}
          </div>
        )}
      </div>
    </div>
  );
}
