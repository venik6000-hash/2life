const CLIENT_SORT_LOCALE = "ru";
const CLIENT_SORT_OPTIONS = { sensitivity: "base", numeric: true };

const getClientDisplayName = (client) =>
  String(client?.shortName || client?.name || "").trim();

const compareClientsByName = (a, b) => {
  const an = getClientDisplayName(a);
  const bn = getClientDisplayName(b);
  const byName = an.localeCompare(bn, CLIENT_SORT_LOCALE, CLIENT_SORT_OPTIONS);
  if (byName !== 0) return byName;
  return String(a?.id || "").localeCompare(String(b?.id || ""), CLIENT_SORT_LOCALE, CLIENT_SORT_OPTIONS);
};

export const sortClientsByName = (clients = []) => [...clients].sort(compareClientsByName);

