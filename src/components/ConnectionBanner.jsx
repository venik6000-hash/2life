export default function ConnectionBanner({ message = "⚡ Переподключение..." }) {
  return (
    <div style={{ padding: "4px 12px", background: "#f59e0b", color: "#fff", fontSize: 11, fontWeight: 600, textAlign: "center" }}>
      {message}
    </div>
  );
}
