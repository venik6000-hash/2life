// Circular avatar showing a client's initials on a gradient background.
// size: "sm" (24px) | "md" (32px, default)
export default function ClientAvatar({ color, avatar, size = "md" }) {
  const dim = size === "sm" ? 24 : 32;
  const fontSize = size === "sm" ? 10 : 12;
  return (
    <div style={{
      width: dim,
      height: dim,
      borderRadius: "50%",
      background: `linear-gradient(135deg,${color},${color}88)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize,
      fontWeight: 700,
      color: "#fff",
      flexShrink: 0,
    }}>
      {avatar}
    </div>
  );
}
