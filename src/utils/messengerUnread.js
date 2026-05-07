export function getUnreadCount(chat, messagesByChat, user) {
  const userId = Number(user?.id);
  const chatId = chat?.id;
  if (!chatId || !Number.isInteger(userId) || userId <= 0) return 0;

  const myReceipt = (chat.receipts || []).find((receipt) => Number(receipt.user_id) === userId);
  const lastReadId = Number(myReceipt?.last_read_message_id || 0);
  const chatMessages = messagesByChat?.[chatId] || [];

  return chatMessages.filter((message) => {
    const messageId = Number(message?.id);
    if (!Number.isInteger(messageId) || messageId <= 0) return false;
    if (message.deleted_for_all) return false;
    if (Number(message.sender_id) === userId) return false;
    return !lastReadId || messageId > lastReadId;
  }).length;
}
