import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createJournalComment,
  createJournalItem,
  deleteJournalItem,
  fetchJournal,
  initializeJournalChecklist,
  updateJournalItem,
} from "../utils/journalApi";
import { compareJournalDueAsc, getTodayIso, isJournalBadgeEligible } from "../utils/journalRules";
import JournalCurrentPanel from "../components/JournalCurrentPanel";
import JournalChecklistPanel from "../components/JournalChecklistPanel";
import JournalFeed from "../components/JournalFeed";
import JournalItemEditor from "../components/JournalItemEditor";

export default function JournalSection({ clientId, stages = [], readOnly = false, onChanged }) {
  const { authFetch, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null);

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

  const today = getTodayIso();
  const currentItems = useMemo(() => (
    items
      .filter((item) => isJournalBadgeEligible(item, { today, userId: user?.id }))
      .sort(compareJournalDueAsc)
      .slice(0, 8)
  ), [items, today, user?.id]);

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

  const initChecklist = async (stageId) => {
    await initializeJournalChecklist(authFetch, clientId, stageId);
    await refreshAfterChange();
  };

  const handleItemEdit = async (item) => {
    // If the caller passes the full updated item (status select), persist directly.
    if (item && item.id && (item.status !== undefined) && !editor) {
      await updateJournalItem(authFetch, clientId, item.id, {
        status: item.status,
        title: item.title,
        description: item.description,
        dueDate: item.dueDate,
        dueTime: item.dueTime,
        assigneeUserId: item.assigneeUserId,
        isTeamTask: item.isTeamTask,
        priority: item.priority,
      });
      await refreshAfterChange();
      return;
    }
    setEditor({ item });
  };

  if (loading) return <div style={{ padding: 16 }}>Загрузка журнала...</div>;
  if (error) return <div style={{ padding: 16, color: "#dc2626" }}>{error}</div>;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <JournalCurrentPanel
        items={currentItems}
        readOnly={readOnly}
        onAddTask={() => setEditor({ type: "task" })}
        onAddEvent={() => setEditor({ type: "event" })}
        onAddNote={() => setEditor({ type: "note" })}
        onEdit={(item) => setEditor({ item })}
      />
      <JournalChecklistPanel
        stages={stages}
        items={items}
        readOnly={readOnly}
        onInitialize={initChecklist}
        onAdd={(stage) => setEditor({ type: "task", stageId: stage.id })}
        onEdit={handleItemEdit}
        onDelete={removeItem}
        onComment={addComment}
      />
      <JournalFeed
        stages={stages}
        items={items}
        readOnly={readOnly}
        onEdit={handleItemEdit}
        onDelete={removeItem}
        onComment={addComment}
      />
      {editor && (
        <JournalItemEditor
          stages={stages}
          initialType={editor.type}
          initialStageId={editor.stageId}
          item={editor.item}
          onClose={() => setEditor(null)}
          onSave={saveItem}
        />
      )}
    </div>
  );
}
