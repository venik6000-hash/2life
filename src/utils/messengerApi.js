export async function apiJson(authFetch, url, options = {}) {
  const res = await authFetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Ошибка сервера");
  return data;
}

export const MessengerApi = {
  listChats: (authFetch, clientId) => apiJson(
    authFetch,
    clientId ? `/api/chats?clientId=${encodeURIComponent(clientId)}` : "/api/chats"
  ),
  getChat: (authFetch, chatId) => apiJson(authFetch, `/api/chats/${chatId}`),
  createChat: (authFetch, payload) => apiJson(authFetch, "/api/chats", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  updateChat: (authFetch, chatId, payload) => apiJson(authFetch, `/api/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }),
  listMessages: (authFetch, chatId, before) => apiJson(
    authFetch,
    `/api/chats/${chatId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`
  ),
  sendMessage: (authFetch, chatId, payload) => apiJson(authFetch, `/api/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  editMessage: (authFetch, chatId, messageId, payload) => apiJson(
    authFetch,
    `/api/chats/${chatId}/messages/${messageId}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  ),
  deleteMessage: (authFetch, chatId, messageId, scope = "all") => apiJson(
    authFetch,
    `/api/chats/${chatId}/messages/${messageId}?scope=${encodeURIComponent(scope)}`,
    { method: "DELETE", body: JSON.stringify({ scope }) }
  ),
  markRead: (authFetch, chatId, messageId) => apiJson(authFetch, `/api/chats/${chatId}/read`, {
    method: "POST",
    body: JSON.stringify({ messageId }),
  }),
  addParticipant: (authFetch, chatId, userId) => apiJson(authFetch, `/api/chats/${chatId}/participants`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  }),
  removeParticipant: (authFetch, chatId, userId) => apiJson(
    authFetch,
    `/api/chats/${chatId}/participants/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  ),
  uploadFile: (authFetch, chatId, form) => apiJson(authFetch, `/api/chats/${chatId}/files`, {
    method: "POST",
    body: form,
  }),
  sync: (authFetch, cursor) => apiJson(
    authFetch,
    `/api/messenger/sync?after=${encodeURIComponent(cursor || 0)}`
  ),
  registerDevice: (authFetch, payload) => apiJson(authFetch, "/api/messenger/devices", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  unregisterDevice: (authFetch, deviceId) => apiJson(
    authFetch,
    `/api/messenger/devices/${encodeURIComponent(deviceId)}`,
    { method: "DELETE" }
  ),
};
