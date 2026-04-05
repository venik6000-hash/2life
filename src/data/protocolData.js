export const PROTOCOL_SLOTS = [
  { id: "morning", label: "Утро", tint: "#e9dfb5", rail: "#d6b155", head: "#2d9c96" },
  { id: "day", label: "День", tint: "#d7e5cf", rail: "#87b06a", head: "#2d9c96" },
  { id: "evening", label: "Вечер", tint: "#efc0bf", rail: "#db8180", head: "#2d9c96" },
  { id: "night", label: "На ночь", tint: "#c6d7f4", rail: "#7ea1df", head: "#2d9c96" }
];

export const PROTOCOL_SLOT_MAP = Object.fromEntries(PROTOCOL_SLOTS.map(slot => [slot.id, slot]));

export const normalizeProtocolText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const inferProtocolSlot = (item = {}, groupName = "") => {
  const rawSlot = normalizeProtocolText(item.slot);
  if (PROTOCOL_SLOT_MAP[rawSlot]) return rawSlot;

  const hay = normalizeProtocolText(`${groupName} ${item.timing || ""} ${item.name || ""}`);
  if (/(на ночь|ноч|сном|ко сну|перед сном)/.test(hay)) return "night";
  if (/(вечер|ужин|после ужина)/.test(hay)) return "evening";
  if (/(день|обед|днём|днем|перекус)/.test(hay)) return "day";
  if (/(утр|завтрак|натощак|после пробуждения|после сна|после подъема)/.test(hay)) return "morning";
  return "morning";
};

export const createProtocolItem = (slotId, order) => ({
  name: "Новый препарат",
  dose: "1 капсула",
  timing: "",
  goal: "",
  days: 30,
  packs: 1,
  link: "",
  slot: slotId,
  order
});
