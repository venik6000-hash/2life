const express = require("express");
const router = express.Router();
const { requireAuth, requireSectionRead, requireSectionWrite } = require("../middleware/auth");
const { pool, hasAllClientsAccess, getAssignmentsByUser } = require("../services/db");

const DISH_TYPES = new Set(["breakfast", "lunch", "dinner", "universal"]);
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);

const toCleanString = (value) => String(value ?? "").trim();
const toNullableNumber = (value) => {
  if (value === "" || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const isWeekStart = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

const readOptionalNumber = (payload, field, existingValue = null) => {
  if (payload[field] === undefined) return { value: existingValue ?? null };
  if (payload[field] === "" || payload[field] == null) return { value: null };
  const n = Number(payload[field]);
  if (!Number.isFinite(n) || n < 0) return { error: `${field} должен быть числом не меньше 0` };
  return { value: n };
};

const canAccessClient = async (user, clientId) => {
  if (user.role === "admin" || await hasAllClientsAccess(user.id)) return true;
  const assigned = await getAssignmentsByUser(user.id);
  return assigned.some((row) => row.client_id === clientId);
};

const mapDish = (row) => ({
  id: row.id,
  name: row.name,
  mealType: row.meal_type,
  ingredients: row.ingredients,
  recipe: row.recipe,
  calories: row.calories,
  protein: row.protein,
  fat: row.fat,
  carbs: row.carbs,
  additions: row.additions,
  active: row.active,
});

const mapMenuItem = (row) => ({
  id: row.id,
  menuId: row.menu_id,
  dishId: row.dish_id,
  dayIndex: row.day_index,
  mealType: row.meal_type,
  customAdditions: row.custom_additions,
  grams: row.grams,
  caloriesOverride: row.calories_override,
  proteinOverride: row.protein_override,
  fatOverride: row.fat_override,
  carbsOverride: row.carbs_override,
  comment: row.comment,
  sortOrder: row.sort_order,
  dish: mapDish({
    id: row.dish_id,
    name: row.dish_name,
    meal_type: row.dish_meal_type,
    ingredients: row.dish_ingredients,
    recipe: row.dish_recipe,
    calories: row.dish_calories,
    protein: row.dish_protein,
    fat: row.dish_fat,
    carbs: row.dish_carbs,
    additions: row.dish_additions,
    active: row.dish_active,
  }),
});

const dishSelect = `
  id, name, meal_type, ingredients, recipe, calories, protein, fat, carbs, additions, active
`;

const validateDishPayload = (payload, existing = null) => {
  const calories = readOptionalNumber(payload, "calories", existing?.calories);
  const protein = readOptionalNumber(payload, "protein", existing?.protein);
  const fat = readOptionalNumber(payload, "fat", existing?.fat);
  const carbs = readOptionalNumber(payload, "carbs", existing?.carbs);
  const numberError = calories.error || protein.error || fat.error || carbs.error;
  if (numberError) return { error: numberError };

  const next = {
    name: payload.name === undefined ? existing?.name : toCleanString(payload.name),
    mealType: payload.mealType === undefined ? existing?.meal_type : toCleanString(payload.mealType || "universal"),
    ingredients: payload.ingredients === undefined ? existing?.ingredients : toCleanString(payload.ingredients),
    recipe: payload.recipe === undefined ? existing?.recipe : toCleanString(payload.recipe),
    calories: calories.value,
    protein: protein.value,
    fat: fat.value,
    carbs: carbs.value,
    additions: payload.additions === undefined ? existing?.additions : toCleanString(payload.additions),
    active: payload.active === undefined ? existing?.active ?? true : !!payload.active,
  };

  if (!next.name) return { error: "Название блюда обязательно" };
  if (!DISH_TYPES.has(next.mealType)) return { error: "Некорректный тип блюда" };
  if (!next.ingredients) return { error: "Состав блюда обязателен" };
  if (!next.recipe) return { error: "Рецепт блюда обязателен" };
  return { value: next };
};

const ensureWeeklyMenu = async (client, clientId, weekStart, createdBy) => {
  const r = await client.query(
    `INSERT INTO client_weekly_menus (client_id, week_start, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id, week_start) DO UPDATE SET updated_at = NOW()
     RETURNING id, client_id, week_start`,
    [clientId, weekStart, createdBy || null]
  );
  return r.rows[0];
};

const loadMenuItems = async (clientId, weekStart) => {
  const r = await pool.query(
    `SELECT
       cmi.*,
       d.name AS dish_name,
       d.meal_type AS dish_meal_type,
       d.ingredients AS dish_ingredients,
       d.recipe AS dish_recipe,
       d.calories AS dish_calories,
       d.protein AS dish_protein,
       d.fat AS dish_fat,
       d.carbs AS dish_carbs,
       d.additions AS dish_additions,
       d.active AS dish_active
     FROM client_weekly_menus cwm
     JOIN client_menu_items cmi ON cmi.menu_id = cwm.id
     JOIN dishes d ON d.id = cmi.dish_id
     WHERE cwm.client_id = $1 AND cwm.week_start = $2
     ORDER BY cmi.day_index, cmi.meal_type, cmi.sort_order, cmi.id`,
    [clientId, weekStart]
  );
  return r.rows.map(mapMenuItem);
};

const getMenuItemForClient = async (clientId, itemId) => {
  const r = await pool.query(
    `SELECT cmi.*, cwm.client_id, cwm.week_start
     FROM client_menu_items cmi
     JOIN client_weekly_menus cwm ON cwm.id = cmi.menu_id
     WHERE cwm.client_id = $1 AND cmi.id = $2
     LIMIT 1`,
    [clientId, Number(itemId)]
  );
  return r.rows[0] || null;
};

router.get("/menu/dishes", requireAuth(), requireSectionRead("menu"), async (req, res) => {
  try {
    const search = toCleanString(req.query.search).toLowerCase();
    const mealType = toCleanString(req.query.mealType);
    const activeOnly = req.query.active !== "all";
    const maxCalories = toNullableNumber(req.query.maxCalories);
    const hasMacros = req.query.hasMacros === "1";
    const params = [];
    const where = [];

    if (activeOnly) where.push("active = true");
    if (search) {
      params.push(`%${search}%`);
      where.push(`LOWER(name) LIKE $${params.length}`);
    }
    if (DISH_TYPES.has(mealType)) {
      params.push(mealType);
      where.push(`meal_type = $${params.length}`);
    }
    if (maxCalories != null) {
      params.push(maxCalories);
      where.push(`calories <= $${params.length}`);
    }
    if (hasMacros) where.push("protein IS NOT NULL AND fat IS NOT NULL AND carbs IS NOT NULL");

    const r = await pool.query(
      `SELECT ${dishSelect}
       FROM dishes
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY active DESC, name ASC`,
      params
    );
    res.json({ ok: true, dishes: r.rows.map(mapDish) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/menu/dishes", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  try {
    const validated = validateDishPayload(req.body || {});
    if (validated.error) return res.status(400).json({ error: validated.error });
    const d = validated.value;
    const r = await pool.query(
      `INSERT INTO dishes (name, meal_type, ingredients, recipe, calories, protein, fat, carbs, additions, active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${dishSelect}`,
      [d.name, d.mealType, d.ingredients, d.recipe, d.calories, d.protein, d.fat, d.carbs, d.additions, d.active]
    );
    res.json({ ok: true, dish: mapDish(r.rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch("/menu/dishes/:dishId", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  try {
    const existing = await pool.query(`SELECT ${dishSelect} FROM dishes WHERE id = $1`, [Number(req.params.dishId)]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Блюдо не найдено" });
    const validated = validateDishPayload(req.body || {}, existing.rows[0]);
    if (validated.error) return res.status(400).json({ error: validated.error });
    const d = validated.value;
    const r = await pool.query(
      `UPDATE dishes
       SET name = $2, meal_type = $3, ingredients = $4, recipe = $5, calories = $6,
           protein = $7, fat = $8, carbs = $9, additions = $10, active = $11, updated_at = NOW()
       WHERE id = $1
       RETURNING ${dishSelect}`,
      [Number(req.params.dishId), d.name, d.mealType, d.ingredients, d.recipe, d.calories, d.protein, d.fat, d.carbs, d.additions, d.active]
    );
    res.json({ ok: true, dish: mapDish(r.rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/menu/dishes/:dishId", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE dishes SET active = false, updated_at = NOW() WHERE id = $1 RETURNING ${dishSelect}`,
      [Number(req.params.dishId)]
    );
    if (!r.rows[0]) return res.status(404).json({ error: "Блюдо не найдено" });
    res.json({ ok: true, dish: mapDish(r.rows[0]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/clients/:clientId/menu", requireAuth(), requireSectionRead("menu"), async (req, res) => {
  try {
    const { clientId } = req.params;
    const weekStart = toCleanString(req.query.weekStart);
    if (!isWeekStart(weekStart)) return res.status(400).json({ error: "weekStart должен быть в формате YYYY-MM-DD" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа к этому клиенту" });

    const menu = await pool.query(
      "SELECT id, client_id, week_start FROM client_weekly_menus WHERE client_id = $1 AND week_start = $2",
      [clientId, weekStart]
    );
    const items = menu.rows[0] ? await loadMenuItems(clientId, weekStart) : [];
    res.json({ ok: true, menu: { id: menu.rows[0]?.id || null, clientId, weekStart, items } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/clients/:clientId/menu/items", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { clientId } = req.params;
    const weekStart = toCleanString(req.body?.weekStart);
    const dayIndex = Number(req.body?.dayIndex);
    const mealType = toCleanString(req.body?.mealType);
    const rawDishIds = Array.isArray(req.body?.dishIds) ? req.body.dishIds : [req.body?.dishId];
    const dishIds = [...new Set(rawDishIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];

    if (!isWeekStart(weekStart)) return res.status(400).json({ error: "weekStart должен быть в формате YYYY-MM-DD" });
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return res.status(400).json({ error: "Некорректный день меню" });
    if (!MEAL_TYPES.has(mealType)) return res.status(400).json({ error: "Некорректный приём пищи" });
    if (!dishIds.length) return res.status(400).json({ error: "dishId или dishIds обязательны" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа к этому клиенту" });

    const dish = await pool.query("SELECT id FROM dishes WHERE id = ANY($1::int[]) AND active = true", [dishIds]);
    const activeIds = new Set(dish.rows.map((row) => Number(row.id)));
    if (activeIds.size !== dishIds.length) return res.status(404).json({ error: "Одно или несколько активных блюд не найдены" });

    await client.query("BEGIN");
    const menu = await ensureWeeklyMenu(client, clientId, weekStart, req.user?.id);
    const orderRes = await client.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM client_menu_items WHERE menu_id = $1 AND day_index = $2 AND meal_type = $3",
      [menu.id, dayIndex, mealType]
    );
    const sortOrder = Number(orderRes.rows[0]?.next_order || 0);
    for (let idx = 0; idx < dishIds.length; idx += 1) {
      await client.query(
        `INSERT INTO client_menu_items (menu_id, dish_id, day_index, meal_type, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [menu.id, dishIds[idx], dayIndex, mealType, sortOrder + idx]
      );
    }
    await client.query("COMMIT");
    const items = await loadMenuItems(clientId, weekStart);
    res.json({ ok: true, menu: { id: menu.id, clientId, weekStart, items } });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.patch("/clients/:clientId/menu/items/:itemId", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  try {
    const { clientId, itemId } = req.params;
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    const existing = await getMenuItemForClient(clientId, itemId);
    if (!existing) return res.status(404).json({ error: "Позиция меню не найдена" });

    const dayIndex = req.body?.dayIndex === undefined ? existing.day_index : Number(req.body.dayIndex);
    const mealType = req.body?.mealType === undefined ? existing.meal_type : toCleanString(req.body.mealType);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return res.status(400).json({ error: "Некорректный день меню" });
    if (!MEAL_TYPES.has(mealType)) return res.status(400).json({ error: "Некорректный приём пищи" });

    await pool.query(
      `UPDATE client_menu_items
       SET day_index = $2,
           meal_type = $3,
           custom_additions = $4,
           grams = $5,
           calories_override = $6,
           protein_override = $7,
           fat_override = $8,
           carbs_override = $9,
           comment = $10,
           updated_at = NOW()
       WHERE id = $1`,
      [
        Number(itemId),
        dayIndex,
        mealType,
        req.body?.customAdditions === undefined ? existing.custom_additions : toCleanString(req.body.customAdditions),
        req.body?.grams === undefined ? existing.grams : toCleanString(req.body.grams),
        req.body?.caloriesOverride === undefined ? existing.calories_override : toNullableNumber(req.body.caloriesOverride),
        req.body?.proteinOverride === undefined ? existing.protein_override : toNullableNumber(req.body.proteinOverride),
        req.body?.fatOverride === undefined ? existing.fat_override : toNullableNumber(req.body.fatOverride),
        req.body?.carbsOverride === undefined ? existing.carbs_override : toNullableNumber(req.body.carbsOverride),
        req.body?.comment === undefined ? existing.comment : toCleanString(req.body.comment),
      ]
    );
    const items = await loadMenuItems(clientId, existing.week_start);
    res.json({ ok: true, menu: { clientId, weekStart: existing.week_start, items } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/clients/:clientId/menu/items/:itemId", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  try {
    const { clientId, itemId } = req.params;
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа к этому клиенту" });
    const existing = await getMenuItemForClient(clientId, itemId);
    if (!existing) return res.status(404).json({ error: "Позиция меню не найдена" });
    await pool.query("DELETE FROM client_menu_items WHERE id = $1", [Number(itemId)]);
    const items = await loadMenuItems(clientId, existing.week_start);
    res.json({ ok: true, menu: { clientId, weekStart: existing.week_start, items } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/clients/:clientId/menu/copy", requireAuth(), requireSectionWrite("menu"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { clientId } = req.params;
    const fromWeekStart = toCleanString(req.body?.fromWeekStart);
    const toWeekStart = toCleanString(req.body?.toWeekStart);
    if (!isWeekStart(fromWeekStart) || !isWeekStart(toWeekStart)) return res.status(400).json({ error: "Неделя должна быть в формате YYYY-MM-DD" });
    if (fromWeekStart === toWeekStart) return res.status(400).json({ error: "Выберите другую неделю для копирования" });
    if (!(await canAccessClient(req.user, clientId))) return res.status(403).json({ error: "Нет доступа к этому клиенту" });

    await client.query("BEGIN");
    const source = await client.query(
      "SELECT id FROM client_weekly_menus WHERE client_id = $1 AND week_start = $2",
      [clientId, fromWeekStart]
    );
    const target = await ensureWeeklyMenu(client, clientId, toWeekStart, req.user?.id);
    await client.query("DELETE FROM client_menu_items WHERE menu_id = $1", [target.id]);
    let copied = 0;
    if (source.rows[0]) {
      const r = await client.query(
        `INSERT INTO client_menu_items (
           menu_id, dish_id, day_index, meal_type, custom_additions, grams,
           calories_override, protein_override, fat_override, carbs_override,
           comment, sort_order
         )
         SELECT $2, dish_id, day_index, meal_type, custom_additions, grams,
                calories_override, protein_override, fat_override, carbs_override,
                comment, sort_order
         FROM client_menu_items
         WHERE menu_id = $1`,
        [source.rows[0].id, target.id]
      );
      copied = r.rowCount;
    }
    await client.query("COMMIT");
    const items = await loadMenuItems(clientId, toWeekStart);
    res.json({ ok: true, copied, menu: { id: target.id, clientId, weekStart: toWeekStart, items } });
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
