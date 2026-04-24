import { useEffect } from "react";
import { useEditor } from "../context/EditorContext";
import { PROTOCOL_SLOTS, normalizeProtocolText, inferProtocolSlot, createProtocolItem } from "../data/protocolData";
import Card from "../components/Card";
import ProtocolSheet from "../components/ProtocolSheet";
import ProtocolRevisionHeader from "../components/ProtocolRevisionHeader";
import Wrapper from "../components/Wrapper";

export default function ProtocolSection({
  st,
  pri,
  setPri,
  uS,
  protMode,
  setProtMode,
  todayLabel,
  readOnly = false,
}) {
  const { setEf, setEv } = useEditor();
  const mode = readOnly ? "client" : protMode;
  const rs = st.protocolRevisions || [];
  const activeRevIndex = rs[pri] ? pri : 0;
  const rv = rs[activeRevIndex] || rs[0];
  if (!rv) return <Card>Пусто</Card>;

  const CUSTOM_COLORS = ["#a06ee8", "#e8906e", "#2db8a0", "#c87dd4", "#e8c96e"];
  const customSlots = (rv.customSlots || []).map((slot) => ({ ...slot, _custom: true }));
  const allSlots = [...PROTOCOL_SLOTS, ...customSlots];

  const groups = rv.groups || [];
  let fallbackOrder = 0;
  const records = [];
  groups.forEach((group, gi) => {
    (group.items || []).forEach((item, ii) => {
      const raw = String(item.slot || "").trim();
      const slotId = (raw && allSlots.find((s) => s.id === raw)) ? raw : inferProtocolSlot(item, group.name);
      records.push({
        gi, ii, groupName: group.name || "", item, slotId,
        sortOrder: Number.isFinite(+item.order) ? +item.order : 1000 + fallbackOrder++,
      });
    });
  });

  const slotBuckets = allSlots.map((slot) => ({
    ...slot,
    records: records
      .filter((r) => r.slotId === slot.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.gi - b.gi || a.ii - b.ii),
  }));

  const withRevision = (fn) => uS((s) => {
    const revisions = s.protocolRevisions || [];
    const revision = revisions[activeRevIndex] || revisions[0];
    if (!revision) return;
    if (!revision.groups) revision.groups = [];
    fn(revision);
  });

  const nextOrderForSlot = (revision, slotId) => {
    let max = -1;
    (revision.groups || []).forEach((group) => {
      (group.items || []).forEach((item, index) => {
        const raw = String(item.slot || "").trim();
        const resolved = (raw && [...PROTOCOL_SLOTS, ...(revision.customSlots || [])].find((s) => s.id === raw))
          ? raw : inferProtocolSlot(item, group.name);
        if (resolved !== slotId) return;
        const order = Number.isFinite(+item.order) ? +item.order : 1000 + index;
        if (order > max) max = order;
      });
    });
    return max + 1;
  };

  const addProtocolItem = (slotId) => {
    const slotDef = allSlots.find((s) => s.id === slotId);
    const slotLabel = slotDef?.label || slotId;
    let focusKey = null;
    withRevision((revision) => {
      let gi = revision.groups.findIndex((g) => normalizeProtocolText(g.name) === normalizeProtocolText(slotLabel));
      if (gi === -1) { revision.groups.push({ name: slotLabel, items: [] }); gi = revision.groups.length - 1; }
      if (!revision.groups[gi].items) revision.groups[gi].items = [];
      const ii = revision.groups[gi].items.length;
      revision.groups[gi].items.push(createProtocolItem(slotId, nextOrderForSlot(revision, slotId)));
      focusKey = `prot-name-${activeRevIndex}-${gi}-${ii}`;
    });
    setProtMode("builder");
    if (focusKey) { setEf(focusKey); setEv("Новый препарат"); }
  };

  const updateProtocolItem = (gi, ii, fn) => withRevision((revision) => {
    const item = revision.groups?.[gi]?.items?.[ii];
    if (!item) return;
    fn(item, revision.groups[gi], revision);
  });

  const moveProtocolOrder = (record, direction) => {
    const bucket = slotBuckets.find((s) => s.id === record.slotId)?.records || [];
    const index = bucket.findIndex((cur) => cur.gi === record.gi && cur.ii === record.ii);
    const swapWith = bucket[index + direction];
    if (index === -1 || !swapWith) return;
    withRevision((revision) => {
      const current = revision.groups?.[record.gi]?.items?.[record.ii];
      const next = revision.groups?.[swapWith.gi]?.items?.[swapWith.ii];
      if (!current || !next) return;
      const currentOrder = Number.isFinite(+current.order) ? +current.order : record.sortOrder;
      const nextOrder = Number.isFinite(+next.order) ? +next.order : swapWith.sortOrder;
      current.order = nextOrder;
      next.order = currentOrder;
    });
  };

  const duplicateProtocolItem = (record) => {
    let focusKey = null;
    withRevision((revision) => {
      const source = revision.groups?.[record.gi]?.items?.[record.ii];
      if (!source) return;
      const copy = JSON.parse(JSON.stringify(source));
      copy.order = nextOrderForSlot(revision, record.slotId);
      const gi = record.gi;
      const ii = revision.groups[gi].items.length;
      revision.groups[gi].items.push(copy);
      focusKey = `prot-name-${activeRevIndex}-${gi}-${ii}`;
    });
    if (focusKey) { setEf(focusKey); setEv(record.item.name || "Копия"); }
  };

  const removeProtocolItem = (record) => {
    if (!confirm(`Удалить «${record.item.name || "Без названия"}»?`)) return;
    withRevision((revision) => { revision.groups?.[record.gi]?.items?.splice(record.ii, 1); });
  };

  const addCustomSlot = () => {
    const name = prompt("Название слота (например: Во время еды, Натощак):");
    if (!name || !name.trim()) return;
    const colorIndex = (rv.customSlots || []).length % CUSTOM_COLORS.length;
    withRevision((revision) => {
      if (!revision.customSlots) revision.customSlots = [];
      revision.customSlots.push({ id: `custom-${Date.now()}`, label: name.trim(), rail: CUSTOM_COLORS[colorIndex] });
    });
  };

  const removeCustomSlot = (slotId) => {
    const bucket = slotBuckets.find((s) => s.id === slotId);
    const count = bucket?.records.length || 0;
    if (count > 0 && !confirm(`Слот содержит ${count} препаратов. Удалить? Препараты перейдут в «Утро».`)) return;
    withRevision((revision) => {
      if (count > 0) {
        (slotBuckets.find((s) => s.id === slotId)?.records || []).forEach((record) => {
          const item = revision.groups?.[record.gi]?.items?.[record.ii];
          if (item) item.slot = "morning";
        });
      }
      revision.customSlots = (revision.customSlots || []).filter((s) => s.id !== slotId);
    });
  };

  useEffect(() => {
    if (readOnly && protMode !== "client") setProtMode("client");
  }, [readOnly, protMode, setProtMode]);

  return (
    <Wrapper gap="md">
      <ProtocolRevisionHeader
        revisions={rs}
        activeIndex={activeRevIndex}
        mode={mode}
        readOnly={readOnly}
        onSelectRevision={setPri}
        onDeleteRevision={(index) => {
          const revision = rs[index];
          if (!confirm(`Удалить версию «${revision.label}»?`)) return;
          uS((s) => { s.protocolRevisions.splice(index, 1); });
          setPri((prev) => (prev >= index && prev > 0 ? prev - 1 : prev));
        }}
        onAddRevision={() => {
          const now = new Date();
          const date = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
          const copy = JSON.parse(JSON.stringify(rv));
          copy.id = rs.length + 1;
          copy.date = date;
          copy.label = `Корректировка ${rs.length + 1}`;
          uS((s) => { s.protocolRevisions.push(copy); });
          setPri(rs.length);
        }}
        onSetMode={setProtMode}
      />

      <ProtocolSheet
        allSlots={allSlots}
        slotBuckets={slotBuckets}
        mode={mode}
        rv={rv}
        activeRevIndex={activeRevIndex}
        todayLabel={todayLabel}
        totalCount={records.length}
        onAddItem={addProtocolItem}
        onRemoveCustomSlot={removeCustomSlot}
        onMoveOrder={moveProtocolOrder}
        onDuplicate={duplicateProtocolItem}
        onRemoveItem={removeProtocolItem}
        onUpdateItem={updateProtocolItem}
        onSaveField={(key, value) => withRevision((revision) => { revision[key] = value; })}
        onSaveSlotName={(slotId, value) => withRevision((revision) => {
          const customSlot = (revision.customSlots || []).find((s) => s.id === slotId);
          if (customSlot) customSlot.label = value || "Слот";
        })}
        onAddCustomSlot={addCustomSlot}
      />
    </Wrapper>
  );
}
