import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { isClientRole } from "../context/DashboardContext";
import Button from "../components/Button";
import Card from "../components/Card";
import Input from "../components/Input";
import SelectInput from "../components/SelectInput";
import TextArea from "../components/TextArea";

const DISH_TYPES = [
  { value: "universal", label: "Универсальное" },
  { value: "breakfast", label: "Завтрак" },
  { value: "lunch", label: "Обед" },
  { value: "dinner", label: "Ужин" },
];

const MEALS = [
  { value: "breakfast", label: "Завтрак" },
  { value: "lunch", label: "Обед" },
  { value: "dinner", label: "Ужин" },
];

const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

const emptyDish = {
  name: "",
  mealType: "universal",
  ingredients: "",
  recipe: "",
  calories: "",
  protein: "",
  fat: "",
  carbs: "",
  additions: "",
  active: true,
};

const toInputValue = (value) => (value == null ? "" : String(value));
const hasValue = (value) => value !== "" && value != null;
const formatCalories = (value) => hasValue(value) ? `${Math.round(Number(value) || 0)} ккал` : "ккал не указаны";
const formatNumber = (value) => Math.round(Number(value) || 0);

const getMonday = (date = new Date()) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const shiftWeek = (weekStart, delta) => {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + delta * 7);
  return getMonday(d);
};

const normalizeWeekInput = (value) => {
  if (!value) return getMonday();
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return getMonday();
  return getMonday(d);
};

const typeLabel = (value) => DISH_TYPES.find((item) => item.value === value)?.label || "Универсальное";
const mealLabel = (value) => MEALS.find((item) => item.value === value)?.label || value;
const slotLabel = (slot) => `${DAYS[slot.dayIndex]}, ${mealLabel(slot.mealType).toLowerCase()}`;
const formatDayDate = (weekStart, dayIndex) => {
  const d = new Date(`${weekStart}T00:00:00`);
  d.setDate(d.getDate() + dayIndex);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const fmtMacro = (label, value) => hasValue(value) ? `${label} ${Number(value) || 0} г` : null;
const fmtMacros = (item) => {
  const values = [
    fmtMacro("Б", item.protein),
    fmtMacro("Ж", item.fat),
    fmtMacro("У", item.carbs),
  ].filter(Boolean);
  return values.length ? values.join(" / ") : "";
};

const effectiveValue = (item, overrideKey, dishKey) =>
  hasValue(item?.[overrideKey]) ? item[overrideKey] : item?.dish?.[dishKey];

const buildItemDraft = (item) => ({
  grams: item.grams || "",
  customAdditions: item.customAdditions || "",
  caloriesOverride: toInputValue(item.caloriesOverride),
  proteinOverride: toInputValue(item.proteinOverride),
  fatOverride: toInputValue(item.fatOverride),
  carbsOverride: toInputValue(item.carbsOverride),
  comment: item.comment || "",
});

const buildDishPayload = (draft) => ({
  ...draft,
  calories: draft.calories === "" ? null : Number(draft.calories),
  protein: draft.protein === "" ? null : Number(draft.protein),
  fat: draft.fat === "" ? null : Number(draft.fat),
  carbs: draft.carbs === "" ? null : Number(draft.carbs),
});

const isInteractiveTarget = (target) => {
  const tag = target?.tagName?.toLowerCase?.();
  return ["button", "input", "textarea", "select", "option", "summary"].includes(tag);
};

function Tabs({ activeTab, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button variant="pill" tone="info" active={activeTab === "client"} onClick={() => onChange("client")}>Меню клиента</Button>
      <Button variant="pill" tone="info" active={activeTab === "base"} onClick={() => onChange("base")}>База блюд</Button>
    </div>
  );
}

export default function MenuSection({ cl, readOnly = false }) {
  const { $ } = useTheme();
  const { authFetch, user } = useAuth();
  const isClient = isClientRole(user);
  const [activeTab, setActiveTab] = useState("client");
  const [weekStart, setWeekStart] = useState(() => getMonday());
  const [selectedSlot, setSelectedSlot] = useState({ dayIndex: 0, mealType: "breakfast" });
  const [selectedDishIds, setSelectedDishIds] = useState(() => new Set());
  const [dishes, setDishes] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ search: "", mealType: "", maxCalories: "", hasMacros: false });
  const [dishDraft, setDishDraft] = useState(emptyDish);
  const [editingDishId, setEditingDishId] = useState(null);
  const [itemDrafts, setItemDrafts] = useState({});
  const [expandedMenuItemIds, setExpandedMenuItemIds] = useState(() => new Set());
  const [editingMenuItemIds, setEditingMenuItemIds] = useState(() => new Set());

  const loadDishes = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("active", "all");
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.mealType) params.set("mealType", filters.mealType);
    if (filters.maxCalories) params.set("maxCalories", filters.maxCalories);
    if (filters.hasMacros) params.set("hasMacros", "1");
    const res = await authFetch(`/api/menu/dishes?${params.toString()}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Не удалось загрузить базу блюд");
    setDishes(Array.isArray(data?.dishes) ? data.dishes : []);
  }, [authFetch, filters]);

  const loadMenu = useCallback(async () => {
    if (!cl?.id) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch(`/api/clients/${encodeURIComponent(cl.id)}/menu?weekStart=${encodeURIComponent(weekStart)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Не удалось загрузить меню клиента");
      const items = Array.isArray(data?.menu?.items) ? data.menu.items : [];
      setMenuItems(items);
      setItemDrafts(Object.fromEntries(items.map((item) => [item.id, buildItemDraft(item)])));
    } catch (e) {
      setError(e.message || "Ошибка загрузки меню");
    } finally {
      setLoading(false);
    }
  }, [authFetch, cl?.id, weekStart]);

  useEffect(() => {
    loadDishes().catch((e) => setError(e.message || "Ошибка загрузки базы блюд"));
  }, [loadDishes]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const slotItems = useMemo(() => {
    const grouped = new Map();
    for (const item of menuItems) {
      const key = `${item.dayIndex}:${item.mealType}`;
      grouped.set(key, [...(grouped.get(key) || []), item]);
    }
    return grouped;
  }, [menuItems]);

  const dayTotals = useMemo(() => DAYS.map((_, dayIndex) => {
    const items = menuItems.filter((item) => item.dayIndex === dayIndex);
    return items.reduce((acc, item) => {
      const calories = effectiveValue(item, "caloriesOverride", "calories");
      const protein = effectiveValue(item, "proteinOverride", "protein");
      const fat = effectiveValue(item, "fatOverride", "fat");
      const carbs = effectiveValue(item, "carbsOverride", "carbs");
      if (hasValue(calories)) {
        acc.calories += Number(calories) || 0;
        acc.calorieItems += 1;
      }
      if (hasValue(protein)) acc.protein += Number(protein) || 0;
      if (hasValue(fat)) acc.fat += Number(fat) || 0;
      if (hasValue(carbs)) acc.carbs += Number(carbs) || 0;
      return acc;
    }, { calories: 0, calorieItems: 0, protein: 0, fat: 0, carbs: 0 });
  }), [menuItems]);

  const selectedActiveDishIds = useMemo(() => {
    const activeIds = new Set(dishes.filter((dish) => dish.active).map((dish) => dish.id));
    return [...selectedDishIds].filter((id) => activeIds.has(id));
  }, [dishes, selectedDishIds]);

  const reloadAll = async () => {
    await Promise.all([loadDishes(), loadMenu()]);
  };

  const saveDish = async () => {
    if (readOnly) return;
    const method = editingDishId ? "PATCH" : "POST";
    const url = editingDishId ? `/api/menu/dishes/${editingDishId}` : "/api/menu/dishes";
    const res = await authFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDishPayload(dishDraft)),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Не удалось сохранить блюдо");
      return;
    }
    setDishDraft(emptyDish);
    setEditingDishId(null);
    await loadDishes();
  };

  const editDish = (dish) => {
    if (readOnly) return;
    setEditingDishId(dish.id);
    setDishDraft({
      name: dish.name || "",
      mealType: dish.mealType || "universal",
      ingredients: dish.ingredients || "",
      recipe: dish.recipe || "",
      calories: toInputValue(dish.calories),
      protein: toInputValue(dish.protein),
      fat: toInputValue(dish.fat),
      carbs: toInputValue(dish.carbs),
      additions: dish.additions || "",
      active: !!dish.active,
    });
    setActiveTab("base");
  };

  const deactivateDish = async (dish) => {
    if (readOnly) return;
    if (!confirm(`Деактивировать блюдо «${dish.name}»?`)) return;
    const res = await authFetch(`/api/menu/dishes/${dish.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Не удалось деактивировать блюдо");
      return;
    }
    setSelectedDishIds((prev) => {
      const next = new Set(prev);
      next.delete(dish.id);
      return next;
    });
    await loadDishes();
  };

  const addSelectedDishesToMenu = async () => {
    if (readOnly) return;
    if (!selectedActiveDishIds.length) {
      alert("Отметьте активные блюда в базе");
      return;
    }
    const addUrl = `/api/clients/${encodeURIComponent(cl.id)}/menu/items`;
    const addPayload = {
      weekStart,
      dayIndex: selectedSlot.dayIndex,
      mealType: selectedSlot.mealType,
      dishIds: selectedActiveDishIds,
    };
    const res = await authFetch(addUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addPayload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      if (String(data?.error || "").includes("dishId")) {
        let lastData = null;
        for (const dishId of selectedActiveDishIds) {
          const singleRes = await authFetch(addUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weekStart, dayIndex: selectedSlot.dayIndex, mealType: selectedSlot.mealType, dishId }),
          });
          lastData = await singleRes.json().catch(() => null);
          if (!singleRes.ok) {
            alert(lastData?.error || "Не удалось добавить блюда в меню");
            return;
          }
        }
        const items = Array.isArray(lastData?.menu?.items) ? lastData.menu.items : [];
        setMenuItems(items);
        setItemDrafts(Object.fromEntries(items.map((item) => [item.id, buildItemDraft(item)])));
        setSelectedDishIds(new Set());
        setActiveTab("client");
        return;
      }
      alert(data?.error || "Не удалось добавить блюда в меню");
      return;
    }
    const items = Array.isArray(data?.menu?.items) ? data.menu.items : [];
    setMenuItems(items);
    setItemDrafts(Object.fromEntries(items.map((item) => [item.id, buildItemDraft(item)])));
    setSelectedDishIds(new Set());
    setActiveTab("client");
  };

  const patchItem = async (item, patch) => {
    if (readOnly) return;
    const nextDraft = { ...(itemDrafts[item.id] || buildItemDraft(item)), ...patch };
    setItemDrafts((prev) => ({ ...prev, [item.id]: nextDraft }));
    const res = await authFetch(`/api/clients/${encodeURIComponent(cl.id)}/menu/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextDraft),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Не удалось сохранить правки блюда в меню");
      await loadMenu();
      return;
    }
    const items = Array.isArray(data?.menu?.items) ? data.menu.items : [];
    setMenuItems(items);
    setItemDrafts(Object.fromEntries(items.map((entry) => [entry.id, buildItemDraft(entry)])));
  };

  const removeItem = async (item) => {
    if (readOnly) return;
    const res = await authFetch(`/api/clients/${encodeURIComponent(cl.id)}/menu/items/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Не удалось удалить блюдо из меню");
      return;
    }
    const items = Array.isArray(data?.menu?.items) ? data.menu.items : [];
    setMenuItems(items);
    setItemDrafts(Object.fromEntries(items.map((entry) => [entry.id, buildItemDraft(entry)])));
  };

  const copyPreviousWeek = async () => {
    if (readOnly) return;
    const fromWeekStart = shiftWeek(weekStart, -1);
    if (!confirm(`Скопировать меню с недели ${fromWeekStart}? Текущая неделя будет заменена.`)) return;
    const res = await authFetch(`/api/clients/${encodeURIComponent(cl.id)}/menu/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromWeekStart, toWeekStart: weekStart }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      alert(data?.error || "Не удалось скопировать меню");
      return;
    }
    const items = Array.isArray(data?.menu?.items) ? data.menu.items : [];
    setMenuItems(items);
    setItemDrafts(Object.fromEntries(items.map((entry) => [entry.id, buildItemDraft(entry)])));
  };

  const updateItemDraft = (itemId, patch) => {
    setItemDrafts((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), ...patch } }));
  };

  const toggleDishSelection = (dishId) => {
    setSelectedDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  };

  const selectVisibleActiveDishes = () => {
    setSelectedDishIds(new Set(dishes.filter((dish) => dish.active).map((dish) => dish.id)));
  };

  const toggleMenuItemExpanded = (itemId) => {
    setExpandedMenuItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const setMenuItemEditing = (itemId, editing) => {
    setEditingMenuItemIds((prev) => {
      const next = new Set(prev);
      if (editing) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };

  const Header = (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Меню</div>
          <div style={{ color: $.txS, marginTop: 3 }}>{cl?.name || "Клиент"} · неделя с понедельника</div>
        </div>
        {!isClient && <Tabs activeTab={activeTab} onChange={setActiveTab} />}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
          <div style={{ width: 170 }}>
            <div style={{ color: $.txS, fontSize: 11, marginBottom: 4 }}>Неделя</div>
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(normalizeWeekInput(e.target.value))} />
          </div>
          <Button variant="ghost" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>←</Button>
          <Button variant="ghost" onClick={() => setWeekStart(getMonday())}>Сегодня</Button>
          <Button variant="ghost" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>→</Button>
          {!readOnly && <Button variant="soft" tone="info" onClick={copyPreviousWeek}>Копировать прошлую</Button>}
        </div>
      </div>
    </Card>
  );

  const renderMenuClient = () => (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, paddingBottom: 4 }}>
        {DAYS.map((day, dayIndex) => (
          <Card key={day} size="sm">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{day}</div>
              <div style={{ color: $.txS, fontSize: 12 }}>{formatDayDate(weekStart, dayIndex)}</div>
            </div>
            <div style={{ fontSize: 11, color: $.txS, marginBottom: 10 }}>
              Итого: {dayTotals[dayIndex].calorieItems ? `${formatNumber(dayTotals[dayIndex].calories)} ккал` : "ккал не указаны"} · Б {formatNumber(dayTotals[dayIndex].protein)} / Ж {formatNumber(dayTotals[dayIndex].fat)} / У {formatNumber(dayTotals[dayIndex].carbs)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {MEALS.map((meal) => {
                const isSelected = selectedSlot.dayIndex === dayIndex && selectedSlot.mealType === meal.value;
                const items = slotItems.get(`${dayIndex}:${meal.value}`) || [];
                return (
                  <div key={meal.value} style={{ border: `1px solid ${isSelected ? $.ac : $.brd}`, borderRadius: 8, padding: 8, background: isSelected ? $.acD : $.bgI }}>
                    <button
                      type="button"
                      onClick={() => setSelectedSlot({ dayIndex, mealType: meal.value })}
                      style={{ border: 0, background: "transparent", color: $.tx, font: "inherit", padding: 0, cursor: "pointer", fontWeight: 700, width: "100%", textAlign: "left" }}
                    >
                      {meal.label}
                    </button>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                      {items.length === 0 && <div style={{ color: $.txS, fontSize: 12 }}>Блюда не добавлены</div>}
                      {items.map((item) => {
                        const draft = itemDrafts[item.id] || buildItemDraft(item);
                        const calories = effectiveValue(item, "caloriesOverride", "calories");
                        const protein = effectiveValue(item, "proteinOverride", "protein");
                        const fat = effectiveValue(item, "fatOverride", "fat");
                        const carbs = effectiveValue(item, "carbsOverride", "carbs");
                        const isExpanded = expandedMenuItemIds.has(item.id);
                        const isEditing = editingMenuItemIds.has(item.id);
                        const customRows = [
                          draft.grams && ["Граммовка", draft.grams],
                          draft.customAdditions && ["Дополнения", draft.customAdditions],
                          hasValue(draft.caloriesOverride) && ["Ккал", draft.caloriesOverride],
                          hasValue(draft.proteinOverride) && ["Белки", `${draft.proteinOverride} г`],
                          hasValue(draft.fatOverride) && ["Жиры", `${draft.fatOverride} г`],
                          hasValue(draft.carbsOverride) && ["Углеводы", `${draft.carbsOverride} г`],
                          draft.comment && ["Комментарий", draft.comment],
                        ].filter(Boolean);
                        return (
                          <div
                            key={item.id}
                            onClick={(event) => {
                              if (isInteractiveTarget(event.target)) return;
                              toggleMenuItemExpanded(item.id);
                            }}
                            style={{
                              background: $.bgC,
                              border: `1px solid ${isExpanded ? $.ac : $.brd}`,
                              borderRadius: 8,
                              padding: 8,
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                                  <span style={{ color: isExpanded ? $.ac : $.txS, fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{isExpanded ? "−" : "+"}</span>
                                  <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{item.dish?.name || "Блюдо"}</div>
                                </div>
                                <div style={{ color: $.txS, fontSize: 11 }}>
                                  {formatCalories(calories)}
                                  {(hasValue(protein) || hasValue(fat) || hasValue(carbs)) && ` · Б ${Number(protein) || 0} / Ж ${Number(fat) || 0} / У ${Number(carbs) || 0}`}
                                </div>
                              </div>
                              {!readOnly && <Button variant="bare" tone="danger" size="xs" title="Удалить" onClick={(event) => { event.stopPropagation(); removeItem(item); }}>✕</Button>}
                            </div>
                            {isExpanded && (
                              <>
                                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                  <div>
                                    <div style={{ color: $.txM, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>Состав</div>
                                    <div style={{ color: $.txS, fontSize: 12, whiteSpace: "pre-wrap" }}>{item.dish?.ingredients || "Состав не заполнен"}</div>
                                  </div>
                                  <div>
                                    <div style={{ color: $.txM, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>Рецепт</div>
                                    <div style={{ color: $.txS, fontSize: 12, whiteSpace: "pre-wrap" }}>{item.dish?.recipe || "Рецепт не заполнен"}</div>
                                  </div>
                                  {item.dish?.additions && (
                                    <div>
                                      <div style={{ color: $.txM, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>Стандартные дополнения</div>
                                      <div style={{ color: $.txS, fontSize: 12, whiteSpace: "pre-wrap" }}>{item.dish.additions}</div>
                                    </div>
                                  )}
                                </div>
                                <div style={{ marginTop: 8, borderTop: `1px solid ${$.brd}`, paddingTop: 8 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: customRows.length || isEditing ? 8 : 0 }}>
                                    <div style={{ color: $.txM, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .4 }}>Индивидуально</div>
                                    {!readOnly && (
                                      <Button
                                        variant="bare"
                                        tone={isEditing ? "accent" : "info"}
                                        size="xs"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          if (isEditing) patchItem(item, {}).then(() => setMenuItemEditing(item.id, false));
                                          else setMenuItemEditing(item.id, true);
                                        }}
                                      >
                                        {isEditing ? "Готово" : "Править"}
                                      </Button>
                                    )}
                                  </div>
                                  {!isEditing && (
                                    customRows.length ? (
                                      <div style={{ display: "flex", flexDirection: "column", gap: 5, color: $.txS, fontSize: 12 }}>
                                        {customRows.map(([label, value]) => (
                                          <div key={label}>
                                            <span style={{ color: $.txM, fontWeight: 700 }}>{label}: </span>
                                            <span style={{ whiteSpace: "pre-wrap" }}>{value}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div style={{ color: $.txS, fontSize: 12 }}>Индивидуальных правок нет</div>
                                    )
                                  )}
                                  {!readOnly && isEditing && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                      <Input size="sm" placeholder="Граммовка" value={draft.grams} onChange={(e) => updateItemDraft(item.id, { grams: e.target.value })} onBlur={() => patchItem(item, {})} />
                                      <TextArea rows={2} placeholder="Индивидуальные дополнения" value={draft.customAdditions} onChange={(e) => updateItemDraft(item.id, { customAdditions: e.target.value })} onBlur={() => patchItem(item, {})} />
                                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(58px, 1fr))", gap: 5 }}>
                                        <Input size="sm" type="number" placeholder="ккал" value={draft.caloriesOverride} onChange={(e) => updateItemDraft(item.id, { caloriesOverride: e.target.value })} onBlur={() => patchItem(item, {})} />
                                        <Input size="sm" type="number" placeholder="Б" value={draft.proteinOverride} onChange={(e) => updateItemDraft(item.id, { proteinOverride: e.target.value })} onBlur={() => patchItem(item, {})} />
                                        <Input size="sm" type="number" placeholder="Ж" value={draft.fatOverride} onChange={(e) => updateItemDraft(item.id, { fatOverride: e.target.value })} onBlur={() => patchItem(item, {})} />
                                        <Input size="sm" type="number" placeholder="У" value={draft.carbsOverride} onChange={(e) => updateItemDraft(item.id, { carbsOverride: e.target.value })} onBlur={() => patchItem(item, {})} />
                                      </div>
                                      <TextArea rows={2} placeholder="Комментарий" value={draft.comment} onChange={(e) => updateItemDraft(item.id, { comment: e.target.value })} onBlur={() => patchItem(item, {})} />
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      {loading && <div style={{ color: $.txS }}>Загрузка меню...</div>}
    </>
  );

  const renderDishBase = () => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 360px)", gap: 14, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 170px 140px auto", gap: 8, alignItems: "center" }}>
            <Input placeholder="Поиск по названию" value={filters.search} onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))} />
            <SelectInput value={filters.mealType} onChange={(e) => setFilters((prev) => ({ ...prev, mealType: e.target.value }))}>
              <option value="">Все типы</option>
              {DISH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectInput>
            <Input type="number" placeholder="До ккал" value={filters.maxCalories} onChange={(e) => setFilters((prev) => ({ ...prev, maxCalories: e.target.value }))} />
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: $.txS, fontSize: 12, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={filters.hasMacros} onChange={(e) => setFilters((prev) => ({ ...prev, hasMacros: e.target.checked }))} />
              Есть БЖУ
            </label>
          </div>
        </Card>

        <Card size="sm">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 700 }}>Каталог блюд</div>
              <div style={{ color: $.txS, fontSize: 12 }}>Найдено: {dishes.length} · выбрано: {selectedActiveDishIds.length}</div>
            </div>
            {!readOnly && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Button variant="ghost" size="sm" onClick={selectVisibleActiveDishes}>Выбрать активные</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDishIds(new Set())}>Снять выбор</Button>
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 10 }}>
          {dishes.map((dish) => {
            const checked = selectedDishIds.has(dish.id);
            return (
              <Card key={dish.id} size="sm" tone={dish.active ? (checked ? "accent" : "default") : "warning"}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {!readOnly && (
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!dish.active}
                      onChange={() => toggleDishSelection(dish.id)}
                      style={{ marginTop: 3 }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{dish.name}</div>
                        <div style={{ color: $.txS, fontSize: 11 }}>{typeLabel(dish.mealType)} · {formatCalories(dish.calories)}</div>
                        {fmtMacros(dish) && <div style={{ color: $.txS, fontSize: 11 }}>{fmtMacros(dish)}</div>}
                      </div>
                      {!dish.active && <span style={{ color: $.wr, fontSize: 11, fontWeight: 700 }}>Неактивно</span>}
                    </div>
                    <div style={{ color: $.txS, fontSize: 12, marginTop: 8, whiteSpace: "pre-wrap" }}>{dish.ingredients}</div>
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ cursor: "pointer", color: $.in, fontWeight: 600, fontSize: 12 }}>Рецепт</summary>
                      <div style={{ color: $.txS, fontSize: 12, marginTop: 6, whiteSpace: "pre-wrap" }}>{dish.recipe}</div>
                      {dish.additions && <div style={{ color: $.txS, fontSize: 12, marginTop: 6, whiteSpace: "pre-wrap" }}>Дополнения: {dish.additions}</div>}
                    </details>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {!readOnly && <Button variant="ghost" size="sm" onClick={() => editDish(dish)}>Править</Button>}
                      {!readOnly && dish.active && <Button variant="bare" tone="danger" size="sm" onClick={() => deactivateDish(dish)}>Деактивировать</Button>}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {dishes.length === 0 && (
            <Card size="sm">
              <div style={{ color: $.txS }}>В базе пока нет блюд по выбранным фильтрам.</div>
            </Card>
          )}
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 0 }}>
        {!readOnly && (
          <Card tone="info">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Добавить выбранные</div>
            <div style={{ color: $.txS, fontSize: 12, marginBottom: 10 }}>Клиент: {cl?.name || "Клиент"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <SelectInput value={selectedSlot.dayIndex} onChange={(e) => setSelectedSlot((prev) => ({ ...prev, dayIndex: Number(e.target.value) }))}>
                {DAYS.map((day, index) => <option key={day} value={index}>{day} · {formatDayDate(weekStart, index)}</option>)}
              </SelectInput>
              <SelectInput value={selectedSlot.mealType} onChange={(e) => setSelectedSlot((prev) => ({ ...prev, mealType: e.target.value }))}>
                {MEALS.map((meal) => <option key={meal.value} value={meal.value}>{meal.label}</option>)}
              </SelectInput>
            </div>
            <Button fullWidth onClick={addSelectedDishesToMenu} disabled={!selectedActiveDishIds.length}>
              Добавить: {selectedActiveDishIds.length}
            </Button>
            <div style={{ color: $.txS, fontSize: 12, marginTop: 10 }}>Слот: {slotLabel(selectedSlot)}</div>
          </Card>
        )}

        {!readOnly && (
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{editingDishId ? "Редактировать блюдо" : "Новое блюдо"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Input placeholder="Название" value={dishDraft.name} onChange={(e) => setDishDraft((prev) => ({ ...prev, name: e.target.value }))} />
              <SelectInput value={dishDraft.mealType} onChange={(e) => setDishDraft((prev) => ({ ...prev, mealType: e.target.value }))}>
                {DISH_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </SelectInput>
              <TextArea rows={2} placeholder="Состав" value={dishDraft.ingredients} onChange={(e) => setDishDraft((prev) => ({ ...prev, ingredients: e.target.value }))} />
              <TextArea rows={2} placeholder="Короткий рецепт" value={dishDraft.recipe} onChange={(e) => setDishDraft((prev) => ({ ...prev, recipe: e.target.value }))} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                <Input type="number" placeholder="ккал" value={dishDraft.calories} onChange={(e) => setDishDraft((prev) => ({ ...prev, calories: e.target.value }))} />
                <Input type="number" placeholder="Б" value={dishDraft.protein} onChange={(e) => setDishDraft((prev) => ({ ...prev, protein: e.target.value }))} />
                <Input type="number" placeholder="Ж" value={dishDraft.fat} onChange={(e) => setDishDraft((prev) => ({ ...prev, fat: e.target.value }))} />
                <Input type="number" placeholder="У" value={dishDraft.carbs} onChange={(e) => setDishDraft((prev) => ({ ...prev, carbs: e.target.value }))} />
              </div>
              <TextArea rows={2} placeholder="Стандартные дополнения" value={dishDraft.additions} onChange={(e) => setDishDraft((prev) => ({ ...prev, additions: e.target.value }))} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, color: $.txS }}>
                <input type="checkbox" checked={dishDraft.active} onChange={(e) => setDishDraft((prev) => ({ ...prev, active: e.target.checked }))} />
                Активно
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={saveDish}>{editingDishId ? "Сохранить" : "Создать"}</Button>
                {editingDishId && <Button variant="ghost" onClick={() => { setEditingDishId(null); setDishDraft(emptyDish); }}>Отмена</Button>}
              </div>
            </div>
          </Card>
        )}
      </aside>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Header}
      {error && (
        <Card tone="danger" size="sm">
          <div style={{ color: $.dn, fontWeight: 600 }}>{error}</div>
        </Card>
      )}
      {(isClient || activeTab === "client") ? renderMenuClient() : renderDishBase()}
    </div>
  );
}
