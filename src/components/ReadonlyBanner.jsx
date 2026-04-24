import { useTheme } from "../context/ThemeContext";

export default function ReadonlyBanner() {
  const { $ } = useTheme();
  return (
    <div style={{
      marginBottom: 10,
      padding: "8px 10px",
      borderRadius: 8,
      border: `1px solid ${$.brd}`,
      background: $.bgI,
      fontSize: 12,
      color: $.txM,
    }}>
      Режим только просмотра: для этого раздела запрещено редактирование.
    </div>
  );
}
