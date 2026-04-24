import { useTheme } from "../context/ThemeContext";
import Button from "./Button";

export default function NoClientsScreen({ canCreateClient, onCreateClient, children }) {
  const { $ } = useTheme();
  return (
    <div style={{
      background: $.bg, color: $.tx, height: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI',sans-serif",
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, color: $.txS }}>Нет клиентов</div>
        {canCreateClient && (
          <div style={{ marginTop: 12 }}>
            <Button onClick={onCreateClient}>+ Создать клиента</Button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
