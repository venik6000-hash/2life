import { useEffect, useMemo, useRef, useState } from "react";
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

  const loadSeqRef = useRef(0);
  const loadJournal = async () => {
    if (!clientId) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await fetchJournal(authFetch, clientId);
      if (seq !== loadSeqRef.current) return;            // a newer load started — discard this result
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err.message || "Не удалось загрузить журнал");
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
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

  // Full reload + parent notify. Kept for paths that still need server truth
  // (delete / comment / quote-to-task); save/move/drop patch state inline instead.
  const refreshAfterChange = async () => {
    await loadJournal();
    if (onChanged) await onChanged();
  };

  const saveItem = async (payload) => {
    try {
      if (editor?.item?.id) {
        const editId = editor.item.id;
        const { item } = await updateJournalItem(authFetch, clientId, editId, payload);
        if (!item) { await loadJournal(); setEditor(null); return; } // row vanished — resync to truth
        setItems((prev) => prev.map((it) => (Number(it.id) === Number(editId) ? { ...item, comments: it.comments ?? [] } : it)));
      } else {
        const { item } = await createJournalItem(authFetch, clientId, payload);
        if (item) setItems((prev) => [{ ...item, comments: [] }, ...prev]);
      }
      setEditor(null);
      if (onChanged) await onChanged();
    } catch (err) {
      window.alert(err.message || "Не удалось сохранить запись");
    }
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
    try {
      const { item: updated } = await updateJournalItem(authFetch, clientId, item.id, { status: toStatus });
      if (!updated) { await loadJournal(); return; } // row vanished — resync to truth
      setItems((prev) => prev.map((it) => (Number(it.id) === Number(item.id) ? { ...updated, comments: it.comments ?? [] } : it)));
      if (onChanged) await onChanged();
    } catch (err) {
      window.alert(err.message || "Не удалось обновить запись");
      await loadJournal();
    }
  };

  const handleDrop = async ({ id, fromStatus, toStatus }) => {
    if (!id || fromStatus === toStatus) return;
    setItems((prev) => prev.map((it) => (Number(it.id) === Number(id) ? { ...it, status: toStatus } : it)));
    try {
      const { item: updated } = await updateJournalItem(authFetch, clientId, id, { status: toStatus });
      if (!updated) { await loadJournal(); return; } // row vanished — resync to truth
      setItems((prev) => prev.map((it) => (Number(it.id) === Number(id) ? { ...updated, comments: it.comments ?? [] } : it)));
      if (onChanged) await onChanged();
    } catch (err) {
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
  if (error) return (
    <div style={{ padding: 16 }}>
      <div style={{ color: $.dn, marginBottom: 8 }}>{error}</div>
      <button onClick={loadJournal} style={{ cursor: "pointer", padding: "4px 12px" }}>Повторить</button>
    </div>
  );

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
        usersById={usersById}
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
          usersById={usersById}
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
