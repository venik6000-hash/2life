import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { formatRoleLabel, isClientRole } from "../utils/messengerUiUtils";

export default function MessengerParticipantsPanel({
  chat,
  user,
  addParticipant,
  removeParticipant,
  onClose,
  readOnly = false,
}) {
  const { $ } = useTheme();
  const { authFetch } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const isOwner = (chat.participants || []).find((participant) => participant.user_id === user.id)?.role_in_chat === "owner"
    || user.role === "admin";
  const canManageParticipants = isOwner && !readOnly && !isClientRole(user);

  useEffect(() => {
    if (!canManageParticipants) {
      setAllUsers([]);
      setUsersError("");
      setUsersLoading(false);
      return;
    }

    let cancelled = false;
    const normalizeUsers = (rows = []) => rows
      .filter((item) => item && item.id != null && item.username)
      .filter((item) => item.active !== false)
      .map((item) => ({ id: Number(item.id), username: String(item.username), role: String(item.role || ""), is_client: typeof item.is_client === "boolean" ? item.is_client : undefined }));

    const fetchUsers = async () => {
      setUsersLoading(true);
      setUsersError("");
      try {
        const preferred = user.role === "admin" ? "/api/admin/users" : "/api/users";
        const fallback = user.role === "admin" ? "/api/users" : null;

        let res = await authFetch(preferred);
        if (!res.ok && fallback) res = await authFetch(fallback);
        if (!res.ok) throw new Error("Не удалось загрузить пользователей");

        const data = await res.json().catch(() => null);
        const users = normalizeUsers(data?.users || []);
        if (!cancelled) setAllUsers(users);
      } catch (error) {
        if (!cancelled) {
          setAllUsers([]);
          setUsersError(error.message || "Ошибка загрузки пользователей");
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    };

    fetchUsers();
    return () => { cancelled = true; };
  }, [authFetch, canManageParticipants, user.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const isViewingAsClient = isClientRole(user);
  const visibleParticipants = isViewingAsClient
    ? (chat.participants || []).filter((p) => p.role !== "admin")
    : (chat.participants || []);
  const participantIds = new Set((chat.participants || []).map((participant) => participant.user_id));
  const available = allUsers.filter((item) => (
    item.id !== user.id &&
    !participantIds.has(item.id) &&
    (!chat.is_internal || !isClientRole(item))
  ));

  const handleAdd = async (userId, username) => {
    setAdding(userId);
    setAddError("");
    const result = await addParticipant(chat.id, userId);
    if (result !== true) {
      setAddError(
        result === "no_key"
          ? `${username} ещё не открывал(а) мессенджер — попросите его войти в чат хотя бы раз`
          : result || "Не удалось добавить участника"
      );
    }
    setAdding(false);
  };

  const handleRemove = async (userId) => {
    if (!window.confirm("Удалить участника из чата?")) return;
    await removeParticipant(chat.id, userId);
  };

  return (
    <div style={{ width: 230, borderLeft: `1px solid ${$.brd}`, background: $.bgC, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${$.brd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Участники</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: $.txS, fontSize: 16 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
        {visibleParticipants.map((participant) => {
          const displayName = participant.display_name || participant.username || "?";
          return (
            <div key={participant.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderRadius: 6, marginBottom: 2 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: $.ac, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {displayName[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{displayName}</div>
                <div style={{ fontSize: 10, color: $.txM }}>{formatRoleLabel(participant.role)} · {participant.role_in_chat === "owner" ? "владелец" : "участник"}</div>
              </div>
              {canManageParticipants && participant.user_id !== user.id && (
                <button onClick={() => handleRemove(participant.user_id)} title="Удалить" style={{ background: "none", border: "none", cursor: "pointer", color: $.dn, fontSize: 13 }}>✕</button>
              )}
            </div>
          );
        })}

        {addError && (
          <div style={{ margin: "8px 0", padding: "7px 10px", borderRadius: 6, background: "rgba(239,83,80,.1)", border: `1px solid ${$.dn}44`, fontSize: 11, color: $.dn, lineHeight: 1.4 }}>
            ⚠️ {addError}
          </div>
        )}

        {canManageParticipants && (
          <>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: $.txM, marginTop: 12, marginBottom: 6, letterSpacing: 0.6 }}>
              Добавить в чат
            </div>
            {usersLoading && (
              <div style={{ fontSize: 12, color: $.txM }}>Загрузка пользователей...</div>
            )}
            {!usersLoading && usersError && (
              <div style={{ fontSize: 12, color: $.dn }}>{usersError}</div>
            )}
            {!usersLoading && !usersError && available.length === 0 && (
              <div style={{ fontSize: 12, color: $.txM }}>Все пользователи уже в чате</div>
            )}
            {!usersLoading && !usersError && available.map((item) => (
              <div
                key={item.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderRadius: 6, marginBottom: 2, cursor: adding === item.id ? "default" : "pointer", opacity: adding === item.id ? 0.6 : 1 }}
                onClick={() => adding || handleAdd(item.id, item.username)}
              >
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: $.bgI, border: `1px solid ${$.brd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {item.username[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: 12 }}>
                  {item.username} <span style={{ color: $.txM, fontSize: 10 }}>({formatRoleLabel(item.role)})</span>
                </div>
                <span style={{ color: adding === item.id ? $.txM : $.ac, fontSize: 13, fontWeight: 700 }}>
                  {adding === item.id ? "…" : "+"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
