import { useTheme } from "../context/ThemeContext";

// A labelled field row used in Overview profile grid and similar places.
// label — left side text, children — right side content (Ed, SexEd, etc.)
export default function FieldRow({ label, children }) {
  const { $ } = useTheme();
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "5px 0",
      borderBottom: `1px solid ${$.brd}`,
      gap: 10,
      alignItems: "center",
    }}>
      <span style={{ color: $.txS, fontSize: 12 }}>{label}</span>
      {children}
    </div>
  );
}
