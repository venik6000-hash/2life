export default function ReadReceipt({ messageId, chatReceipts, currentUserId, participants }) {
  const otherParticipants = (participants || []).filter((participant) => participant.user_id !== currentUserId);
  if (otherParticipants.length === 0) return <span style={{ fontSize: 10, opacity: 0.6 }}>✓</span>;

  const readCount = otherParticipants.filter((participant) => {
    const receipt = (chatReceipts || []).find((item) => item.user_id === participant.user_id);
    return receipt && receipt.last_read_message_id >= messageId;
  }).length;

  const color = readCount === otherParticipants.length ? "#4fc3f7" : undefined;
  return (
    <span style={{ fontSize: 10, opacity: 0.8, color }}>
      {readCount > 0 ? "✓✓" : "✓"}
    </span>
  );
}
