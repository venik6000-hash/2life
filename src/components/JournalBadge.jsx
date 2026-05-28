export default function JournalBadge({ count }) {
  const safeCount = Number(count || 0);
  if (!safeCount) return null;
  return (
    <span
      title={`${safeCount} задач на сегодня или просрочено`}
      style={{
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#dc2626",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {safeCount > 99 ? "99+" : safeCount}
    </span>
  );
}
