import { useTheme } from "../context/ThemeContext";
import { useDashboard } from "../context/DashboardContext";
import Badge from "./Badge";
import Ed from "./Ed";
import Button from "./Button";
import Wrapper from "./Wrapper";

export default function DashboardHeader({ onPrintPdf }) {
  const { $, dk, setDk } = useTheme();
  const { sec, cl, st, updateClientName, removeClient, canDeleteClient, canWriteSection } = useDashboard();

  return (
    <div
      style={{
        padding: "10px 20px",
        borderBottom: `1px solid ${$.brd}`,
        background: $.bgC,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        gap: 12,
      }}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          {sec === "overview"
            ? <Ed v={cl.name} f={`client-name-${cl.id}`} save={updateClientName} ro={!canWriteSection("overview")} />
            : cl.name}
        </h2>
        <div style={{ fontSize: 11, color: $.txM, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          Этап {st.id}: {st.title}
          {st.doctor && <Badge c="pu" ch={`👨‍⚕️ ${st.doctor}${st.doctorRole ? ` • ${st.doctorRole}` : ""}`} />}
          {st.status === "active" && <Badge c="ac" ch="Активный" />}
        </div>
      </div>
      <Wrapper dir="row" align="center" gap="xs" shrink={0}>
        <Button variant="ghost" onClick={onPrintPdf}>📄 PDF</Button>
        {canDeleteClient && (
          <Button variant="ghost" tone="danger" onClick={removeClient} title="Удалить клиента">🗑</Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => setDk(!dk)}>
          {dk ? "☀️" : "🌙"}
        </Button>
      </Wrapper>
    </div>
  );
}
