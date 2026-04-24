import { useTheme } from "../context/ThemeContext";

const EMOJIS = [
  "😀", "😂", "🥰", "😍", "🤔", "😊", "😎", "🥹", "😢", "😡", "🤯", "🥳", "😴", "🤒", "💪",
  "👍", "👎", "👏", "🙏", "🤝", "❤️", "🔥", "⭐", "✅", "❌", "⚠️", "💊", "💉", "🏥", "🩺",
  "📋", "📊", "📅", "📝", "📎", "🔗", "📂", "🗂️", "📤", "📥", "🔒", "🔓", "💬", "📞", "✉️",
];

export default function EmojiPicker({ onPick }) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: 6,
        zIndex: 10,
        background: $.bgC,
        border: `1px solid ${$.brd}`,
        borderRadius: 10,
        padding: 8,
        boxShadow: $.sh,
        display: "flex",
        flexWrap: "wrap",
        width: 280,
        gap: 4,
      }}
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onPick(emoji)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 20,
            padding: "3px 4px",
            borderRadius: 4,
            transition: "background .1s",
          }}
          onMouseEnter={(event) => { event.currentTarget.style.background = $.acD; }}
          onMouseLeave={(event) => { event.currentTarget.style.background = "none"; }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
