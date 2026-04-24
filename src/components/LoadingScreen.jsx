import { useTheme } from "../context/ThemeContext";

export default function LoadingScreen() {
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
        <div style={{ fontSize: 12, color: $.txM, marginTop: 4 }}>Загрузка данных...</div>
      </div>
    </div>
  );
}
