import { useTheme } from "../context/ThemeContext";

export default function LoadingScreen({ slow = false, onRetry } = {}) {
  const { $ } = useTheme();
  return (
    <div style={{
      background: $.bg, color: $.tx, height: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI',sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: $.ac }}>2life</div>
        <div style={{ fontSize: 12, color: $.txM, marginTop: 4, maxWidth: 280 }}>
          {slow ? "Соединение медленное — продолжаем загрузку…" : "Загрузка данных..."}
        </div>
        {slow && onRetry && (
          <button
            onClick={onRetry}
            style={{
              marginTop: 14, padding: "7px 18px", fontSize: 13,
              color: $.tx, background: "transparent",
              border: `1px solid ${$.brd}`, borderRadius: 8, cursor: "pointer",
            }}
          >
            Повторить сейчас
          </button>
        )}
      </div>
    </div>
  );
}
