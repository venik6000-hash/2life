import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  createJournalTemplateItem,
  deleteJournalTemplateItem,
  fetchJournalTemplate,
  updateJournalTemplateItem,
} from "../utils/journalApi";
import Button from "./Button";
import Card from "./Card";
import Input from "./Input";
import Wrapper from "./Wrapper";

export default function AdminJournalTemplatePanel() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await fetchJournalTemplate(authFetch);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err.message || "Не удалось загрузить шаблон журнала");
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (item, patch) => {
    try {
      await updateJournalTemplateItem(authFetch, item.id, { ...item, ...patch });
      await load();
    } catch (err) {
      setError(err.message || "Не удалось сохранить пункт");
    }
  };

  const add = async () => {
    try {
      await createJournalTemplateItem(authFetch, { title: "Новый пункт", sortOrder: items.length, active: true });
      await load();
    } catch (err) {
      setError(err.message || "Не удалось создать пункт");
    }
  };

  const remove = async (id) => {
    try {
      await deleteJournalTemplateItem(authFetch, id);
      await load();
    } catch (err) {
      setError(err.message || "Не удалось удалить пункт");
    }
  };

  return (
    <Card>
      <Wrapper gap="sm">
        <Wrapper dir="row" align="center" justify="space-between" gap="sm">
          <div style={{ fontSize: 14, fontWeight: 700 }}>Шаблон чек-листа журнала</div>
          <Button onClick={add} size="sm">+ Пункт</Button>
        </Wrapper>
        {error && <div style={{ color: "#dc2626", fontSize: 12 }}>{error}</div>}
        {items.map((item, index) => (
          <Wrapper key={item.id} dir="row" align="center" gap="sm">
            <div style={{ width: 48 }}>
              <Input
                type="number"
                value={String(item.sortOrder ?? index)}
                onChange={(e) => save(item, { sortOrder: Number(e.target.value) || 0 })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Input
                value={item.title}
                onChange={(e) => save(item, { title: e.target.value })}
              />
            </div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={!!item.active}
                onChange={(e) => save(item, { active: e.target.checked })}
              />
              Активен
            </label>
            <Button variant="bare" tone="danger" size="sm" onClick={() => remove(item.id)}>
              Удалить
            </Button>
          </Wrapper>
        ))}
      </Wrapper>
    </Card>
  );
}
