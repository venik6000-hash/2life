import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import StatCard from "./StatCard";
import Wrapper from "./Wrapper";

export default function AdminSectionHeader({ title, stats, tabs, activeTab, onTabChange }) {
  const { $ } = useTheme();
  return (
    <div style={{ padding: "18px 24px 0", borderBottom: `1px solid ${$.brd}`, background: $.bgC, flexShrink: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: $.tx }}>{title}</div>
      {stats && (
        <Wrapper dir="row" gap="xl" marginBottom="md" wrap>
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.val} />
          ))}
        </Wrapper>
      )}
      <Wrapper dir="row" gap={4} wrap>
        {tabs.map((item) => (
          <Button
            key={item.id}
            variant="pill"
            tone="accent"
            size="sm"
            active={activeTab === item.id}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </Wrapper>
    </div>
  );
}
