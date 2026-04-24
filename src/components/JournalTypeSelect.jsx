import { useTheme } from "../context/ThemeContext";
import { jColors } from "../styles/theme";

const JOURNAL_TYPES = ["Консультация", "Старт", "Созвон", "Обследование", "Заметка"];

export default function JournalTypeSelect({ value, onChange }) {
  const { $ } = useTheme();
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        width: "auto",
        padding: "2px 6px",
        fontSize: 11,
        fontWeight: 600,
        color: jColors[value] || $.txM,
        background: $.bgI,
        border: `1px solid ${$.brd}`,
        borderRadius: 4,
        fontFamily: "inherit",
        outline: "none",
        cursor: "pointer",
      }}
    >
      {JOURNAL_TYPES.map(jt => <option key={jt} value={jt}>{jt}</option>)}
    </select>
  );
}
