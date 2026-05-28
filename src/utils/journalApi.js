const apiJson = async (authFetch, url, options = {}) => {
  const hasBody = options.body !== undefined && options.body !== null;
  const res = await authFetch(url, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Ошибка журнала");
  return data;
};

export const fetchJournal = (authFetch, clientId) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal`);

export const createJournalItem = (authFetch, clientId, payload) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const updateJournalItem = (authFetch, clientId, itemId, payload) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

export const deleteJournalItem = (authFetch, clientId, itemId, reason = "") =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items/${itemId}`, {
    method: "DELETE",
    body: JSON.stringify({ reason }),
  });

export const createJournalComment = (authFetch, clientId, itemId, body) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/items/${itemId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const initializeJournalChecklist = (authFetch, clientId, stageId) =>
  apiJson(authFetch, `/api/clients/${encodeURIComponent(clientId)}/journal/stages/${stageId}/checklist/initialize`, {
    method: "POST",
  });

export const fetchJournalBadges = (authFetch) =>
  apiJson(authFetch, "/api/journal/badges");
