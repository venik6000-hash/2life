import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  createJournalComment,
  createJournalItem,
  deleteJournalItem,
  fetchJournal,
  fetchStaff,
  updateJournalItem,
} from "../utils/journalApi";
import {
  getTodayIso,
  isOnBoard,
  isInNotesPanel,
} from "../utils/journalRules";
import JournalSummary from "../components/JournalSummary";
import JournalBoard from "../components/JournalBoard";
import JournalCommentsPopup from "../components/JournalCommentsPopup";
import JournalNotesPanel from "../components/JournalNotesPanel";
import JournalItemEditor from "../components/JournalItemEditor";

export default function JournalSection({ clientId, stages = [], currentStageId, readOnly = false, onChanged }) {
  const { authFetch, user } = useAuth();
  const { $ } = useTheme();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);
  const [commentPopup, setCommentPopup] = useState(null);

  const loadJournal = async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJournal(authFetch, clientId);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить журнал");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJournal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    let active = true;
    fetchStaff(authFetch)
      .then((data) => {
        if (active) setUsers(Array.isArray(data?.users) ? data.users : []);
      })
      .catch(() => {
        if (active) setUsers([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usersById = useMemo(() => {
    const map = {};
    for (const u of users) map[u.id] = u;
    return map;
  }, [users]);

  const today = getTodayIso();

  const boardItems = useMemo(() => items.filter(isOnBoard), [items]);
  const noteItems = useMemo(() => items.filter(isInNotesPanel), [items]);

  const refreshAfterChange = async () => {
    await loadJournal();
    if (onChanged) await onChanged();
  };

  const saveItem = async (payload) => {
    if (editor?.item?.id) await updateJournalItem(authFetch, clientId, editor.item.id, payload);
    else await createJournalItem(authFetch, clientId, payload);
    setEditor(null);
    await refreshAfterChange();
  };

  const removeItem = async (item) => {
    if (!window.confirm(`Удалить «${item.title || "запись журнала"}»?`)) return;
    await deleteJournalItem(authFetch, clientId, item.id, "Удалено из интерфейса журнала");
    await refreshAfterChange();
  };

  const addComment = async (item, body) => {
    await createJournalComment(authFetch, clientId, item.id, body);
    await refreshAfterChange();
  };

  const handleMove = async (item, toStatus) => {
    if (!toStatus || toStatus === item.status) return;
    await updateJournalItem(authFetch, clientId, item.id, { status: toStatus });
    await refreshAfterChange();
  };

  const handleDrop = async ({ id, fromStatus, toStatus }) => {
    if (!id || fromStatus === toStatus) return;
    // Optimistic update.
    setItems((prev) =>
      prev.map((it) => (Number(it.id) === Number(id) ? { ...it, status: toStatus } : it))
    );
    try {
      await updateJournalItem(authFetch, clientId, id, { status: toStatus });
      await refreshAfterChange();
    } catch (err) {
      // Rollback: full reload to get truth.
      window.alert(err.message || "Не удалось обновить статус");
      await loadJournal();
    }
  };

  // New journal items belong to the stage currently being viewed — no manual stage picker.
  const openCreate = ({ type = "task", status = "open" } = {}) =>
    setEditor({ type, status, stageId: currentStageId == null ? undefined : Number(currentStageId) });

  const openEdit = (item) => setEditor({ item });

  const handleAddNote = () => openCreate({ type: "note" });

  const handleQuoteToTask = async (note) => {
    const payload = {
      type: "task",
      status: "open",
      title: note.title && note.title !== "Заметка" ? note.title : (note.description || "Из заметки").slice(0, 80),
      description: note.description || "",
      stageId: note.stageId == null ? null : Number(note.stageId),
      assigneeUserId: null,
      isTeamTask: true,
      priority: "normal",
      dueDate: "",
      dueTime: "",
      metadata: { quotedFromNoteId: note.id },
    };
    await createJournalItem(authFetch, clientId, payload);
    await refreshAfterChange();
  };

  const handleCommentIconClick = (item, anchorRect) =>
    setCommentPopup({ itemId: item.id, anchorRect });

  const popupItem = commentPopup
    ? items.find((it) => Number(it.id) === Number(commentPopup.itemId))
    : null;

  if (loading) return <div style={{ padding: 16 }}>Загрузка журнала...</div>;
  if (error) return <div style={{ padding: 16, color: $.dn }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <JournalSummary items={items} today={today} />
      <JournalBoard
        items={boardItems}
        stages={stages}
        usersById={usersById}
        currentUserId={user?.id}
        readOnly={readOnly}
        onEditItem={openEdit}
        onCreateItem={openCreate}
        onMoveItem={handleMove}
        onDropItem={handleDrop}
        onCommentClick={handleCommentIconClick}
      />
      <JournalNotesPanel
        notes={noteItems}
        allItems={items}
        stages={stages}
        readOnly={readOnly}
        onEditNote={openEdit}
        onAddNote={handleAddNote}
        onQuoteToTask={handleQuoteToTask}
        onDeleteNote={removeItem}
      />
      {popupItem && (
        <JournalCommentsPopup
          item={popupItem}
          anchorRect={commentPopup.anchorRect}
          readOnly={readOnly}
          onClose={() => setCommentPopup(null)}
          onAddComment={addComment}
        />
      )}
      {editor && (
        <JournalItemEditor
          users={users}
          initialType={editor.type}
          initialStatus={editor.status}
          initialStageId={editor.stageId}
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={saveItem}
        />
      )}
    </div>
  );
}
