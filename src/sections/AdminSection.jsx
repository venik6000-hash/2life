import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ANALYTICS_MARKER_DEFAULTS, ANALYTICS_MARKER_FALLBACK_DEFAULTS, normalizeAnalyticsKey } from "../data/analyticsData";
import { parseDeficitPresetPayload, serializeDeficitPresetPayload } from "../utils/analyticsUtils";
import { sortClientsByName } from "../utils/clientSort";
import {
  buildDefaultLabOrderTemplates,
  markersToLabOrderText,
  parseLabOrderItemPayload,
  parseLabOrderMarkersText,
  serializeLabOrderItemPayload
} from "../utils/labOrderUtils";

const ALL_SECTIONS = ['overview','questionnaire','nutrition','protocol','injections','analytics','lab','journal'];
const SECTION_LABELS = { overview:'Обзор', questionnaire:'Анкета', nutrition:'Питание', protocol:'Протокол', injections:'Инъекции', analytics:'Анализы', lab:'Направление', journal:'Журнал' };
const ALL_PERMISSIONS = ['delete_client','create_client','import_data'];
const PERM_LABELS = { delete_client:'Удалять клиентов', create_client:'Создавать клиентов', import_data:'Импортировать данные' };
const DEFICIT_TRIGGER_LABELS = { auto: "Авто (референс → оптимум)", ref: "Ниже референса", optimal: "Ниже оптимума" };
const DEFAULT_DEFICIT_MARKER_OPTIONS = Array.from(new Set([
  ...Object.keys(ANALYTICS_MARKER_DEFAULTS || {}),
  ...Object.keys(ANALYTICS_MARKER_FALLBACK_DEFAULTS || {}),
]))
  .sort((a, b) => a.localeCompare(b, "ru"))
  .map(key => {
    const [category, marker] = String(key).split("::");
    return { key, label: `${category} • ${marker}`, categoryName: category || "", markerName: marker || "" };
  });

const buildDeficitMarkerOptions = (items = []) => {
  const fromDb = Array.isArray(items) ? items.map((item) => {
    const categoryName = String(item?.categoryName || "").trim();
    const markerName = String(item?.markerName || "").trim();
    const key = String(item?.key || `${normalizeAnalyticsKey(categoryName)}::${normalizeAnalyticsKey(markerName)}`).trim().toLowerCase();
    if (!categoryName || !markerName || !key) return null;
    return { key, label: `${categoryName} • ${markerName}`, categoryName, markerName };
  }).filter(Boolean) : [];

  if (!fromDb.length) return DEFAULT_DEFICIT_MARKER_OPTIONS;

  const dedup = [];
  const seen = new Set();
  fromDb.forEach((item) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    dedup.push(item);
  });
  return dedup;
};

export default function AdminSection() {
  const { authFetch, user } = useAuth();
  const { $ } = useTheme();
  const [tab, setTab] = useState("users");

  // --- Stats ---
  const [stats, setStats] = useState(null);

  // --- Users ---
  const [users, setUsers] = useState([]);
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "doctor" });
  const [userFormErr, setUserFormErr] = useState("");
  const [userFormLoading, setUserFormLoading] = useState(false);
  const [roles, setRoles] = useState([]);

  // --- Roles ---
  const [rolesData, setRolesData] = useState([]);
  const [roleFormName, setRoleFormName] = useState("");
  const [roleFormDisplay, setRoleFormDisplay] = useState("");
  const [roleFormErr, setRoleFormErr] = useState("");
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editingRoleDisplay, setEditingRoleDisplay] = useState("");
  const [pendingRoleChanges, setPendingRoleChanges] = useState({});

  // --- Doctors ---
  const [doctors, setDoctors] = useState([]);
  const [doctorForm, setDoctorForm] = useState({ name: "", role: "", user_id: null });
  const [doctorFormErr, setDoctorFormErr] = useState("");
  const [editingDoctor, setEditingDoctor] = useState(null);

  // --- References ---
  const [refSubTab, setRefSubTab] = useState("deficit_preset");
  const [refItems, setRefItems] = useState([]);
  const [refInput, setRefInput] = useState("");
  const [refErr, setRefErr] = useState("");
  const [defPresetForm, setDefPresetForm] = useState({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
  const [labOrderForm, setLabOrderForm] = useState({ name: "", markersText: "", simple: false });
  const [labOrderFormCollapsed, setLabOrderFormCollapsed] = useState(false);
  const [editingRefId, setEditingRefId] = useState(null);
  const [editingRefInput, setEditingRefInput] = useState("");
  const [editingDefPresetForm, setEditingDefPresetForm] = useState({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
  const [editingLabOrderForm, setEditingLabOrderForm] = useState({ name: "", markersText: "", simple: false });
  const [editingLabOrderMarkersCollapsed, setEditingLabOrderMarkersCollapsed] = useState(false);
  const [deficitMarkerOptions, setDeficitMarkerOptions] = useState(DEFAULT_DEFICIT_MARKER_OPTIONS);
  const [labOrderSeeded, setLabOrderSeeded] = useState(false);

  // --- Activity ---
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // --- Client Assignments ---
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userClientsMap, setUserClientsMap] = useState({});
  const [allClients, setAllClients] = useState([]);
  const [addClientSelect, setAddClientSelect] = useState("");

  const card = { background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 10, padding: 18, marginBottom: 16 };
  const inp = { padding: "6px 10px", borderRadius: 6, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx, fontSize: 13, fontFamily: "inherit", outline: "none" };
  const bt = (v) => ({ padding: "7px 14px", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 12, fontFamily: "inherit", background: v === "g" ? "transparent" : $[v] || $.ac, color: v === "g" ? $.txS : "#fff", ...(v === "g" ? { border: `1px solid ${$.brd}` } : {}), transition: "all .15s" });
  const sbt = { padding: "4px 9px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" };
  const deficitMarkerLabelByKey = useMemo(
    () => deficitMarkerOptions.reduce((acc, x) => { acc[x.key] = x.label; return acc; }, {}),
    [deficitMarkerOptions]
  );

  const resolveMarkerKey = useCallback((rawValue) => {
    const n = normalizeAnalyticsKey(rawValue);
    if (!n) return "";
    const exactByKey = deficitMarkerOptions.find(opt => opt.key === n);
    if (exactByKey) return exactByKey.key;
    const exactByLabel = deficitMarkerOptions.find(opt => normalizeAnalyticsKey(opt.label) === n);
    if (exactByLabel) return exactByLabel.key;
    const exactByMarker = deficitMarkerOptions.find(opt => normalizeAnalyticsKey(opt.markerName) === n);
    if (exactByMarker) return exactByMarker.key;
    const partial = deficitMarkerOptions.filter(opt =>
      normalizeAnalyticsKey(opt.label).includes(n) ||
      normalizeAnalyticsKey(opt.markerName).includes(n)
    );
    return partial.length === 1 ? partial[0].key : "";
  }, [deficitMarkerOptions]);

  // Fetch stats
  const fetchStats = useCallback(() => {
    authFetch("/api/admin/stats").then(r => r.json()).then(d => { if (d.ok) setStats(d); });
  }, [authFetch]);

  // Fetch roles list (for user form dropdown)
  const fetchRolesList = useCallback(() => {
    authFetch("/api/admin/roles").then(r => r.json()).then(d => { if (d.ok) setRoles(d.roles); });
  }, [authFetch]);

  // Fetch users
  const fetchUsers = useCallback(() => {
    authFetch("/api/admin/users").then(r => r.json()).then(d => { if (d.ok) setUsers(d.users); });
  }, [authFetch]);

  // Fetch roles (detail)
  const fetchRoles = useCallback(() => {
    authFetch("/api/admin/roles").then(r => r.json()).then(d => {
      if (d.ok) { setRolesData(d.roles); setRoles(d.roles); }
    });
  }, [authFetch]);

  // Fetch doctors
  const fetchDoctors = useCallback(() => {
    authFetch("/api/admin/doctors").then(r => r.json()).then(d => { if (d.ok) setDoctors(d.doctors); });
  }, [authFetch]);

  const seedLabOrderRefs = useCallback(async () => {
    const defaults = buildDefaultLabOrderTemplates();
    await Promise.all(defaults.map((item, idx) =>
      authFetch("/api/admin/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lab_order_item",
          value: serializeLabOrderItemPayload({
            name: item.name,
            markers: item.markers,
            simple: !!item.simple
          }),
          sort_order: idx
        })
      })
    ));
  }, [authFetch]);

  // Fetch reference data
  const fetchRefs = useCallback(async (type) => {
    try {
      const r = await authFetch(`/api/admin/references?type=${type}`);
      const d = await r.json();
      if (!d?.ok) return;

      let items = Array.isArray(d.items) ? d.items : [];
      if (type === "lab_order_item" && !items.length && !labOrderSeeded) {
        await seedLabOrderRefs();
        setLabOrderSeeded(true);
        const r2 = await authFetch(`/api/admin/references?type=${type}`);
        const d2 = await r2.json();
        if (d2?.ok) items = Array.isArray(d2.items) ? d2.items : [];
      }

      setRefItems(items);
    } catch (_) {
      // ignore transient admin fetch errors
    }
  }, [authFetch, labOrderSeeded, seedLabOrderRefs]);

  // Fetch marker dictionary for deficit preset autocomplete
  const fetchDeficitMarkers = useCallback(() => {
    authFetch("/api/admin/analytics-markers")
      .then(r => r.json())
      .then(d => {
        if (d?.ok && Array.isArray(d.items)) {
          setDeficitMarkerOptions(buildDeficitMarkerOptions(d.items));
        }
      })
      .catch(() => setDeficitMarkerOptions(DEFAULT_DEFICIT_MARKER_OPTIONS));
  }, [authFetch]);

  // Fetch activity
  const fetchActivity = useCallback(() => {
    setActivityLoading(true);
    authFetch("/api/admin/activity?limit=100").then(r => r.json()).then(d => {
      if (d.ok) setActivity(d.items);
    }).finally(() => setActivityLoading(false));
  }, [authFetch]);

  const fetchAllClients = useCallback(() => {
    authFetch("/api/clients").then(r => r.json()).then(d => {
      if (Array.isArray(d)) {
        const sorted = sortClientsByName(d.map(c => ({ id: c.id, name: c.name })));
        setAllClients(sorted);
      }
    });
  }, [authFetch]);

  const fetchUserClients = useCallback((userId) => {
    authFetch(`/api/admin/users/${userId}/clients`).then(r => r.json()).then(d => {
      if (d.ok) {
        const sorted = Array.isArray(d.clients) ? sortClientsByName(d.clients) : [];
        setUserClientsMap(prev => ({ ...prev, [userId]: sorted }));
      }
    });
  }, [authFetch]);

  const handleAssignClient = async (userId, clientId) => {
    if (!clientId) return;
    await authFetch(`/api/clients/${clientId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    setAddClientSelect("");
    fetchUserClients(userId);
  };

  const handleUnassignClient = async (userId, clientId) => {
    await authFetch(`/api/clients/${clientId}/assignments/${userId}`, { method: "DELETE" });
    fetchUserClients(userId);
  };

  const handleToggleUserClients = (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
    } else {
      setExpandedUserId(userId);
      setAddClientSelect("");
      fetchUserClients(userId);
      if (!allClients.length) fetchAllClients();
    }
  };

  // Initial load
  useEffect(() => {
    fetchStats();
    fetchRolesList();
    fetchDeficitMarkers();
  }, [fetchStats, fetchRolesList, fetchDeficitMarkers]);

  useEffect(() => {
    if (tab === "users") { fetchUsers(); fetchAllClients(); }
    else if (tab === "roles") fetchRoles();
    else if (tab === "doctors") { fetchDoctors(); fetchUsers(); }
    else if (tab === "references") fetchRefs(refSubTab);
    else if (tab === "activity") fetchActivity();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === "references" && refSubTab === "deficit_preset") fetchDeficitMarkers();
  }, [tab, refSubTab, fetchDeficitMarkers]);

  useEffect(() => {
    if (tab === "references") fetchRefs(refSubTab);
    setEditingRefId(null);
    setEditingRefInput("");
    setEditingDefPresetForm({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
    setEditingLabOrderForm({ name: "", markersText: "", simple: false });
    setLabOrderForm({ name: "", markersText: "", simple: false });
    setLabOrderFormCollapsed(false);
    setEditingLabOrderMarkersCollapsed(false);
    setRefErr("");
  }, [refSubTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- TABS ---
  const TABS = [
    { id: "users", label: "Пользователи" },
    { id: "roles", label: "Роли" },
    { id: "doctors", label: "Врачи" },
    { id: "references", label: "Справочники" },
    { id: "activity", label: "Активность" },
  ];

  // ===== USERS TAB =====
  const handleCreateUser = async () => {
    setUserFormErr("");
    if (!userForm.username.trim() || !userForm.password.trim()) { setUserFormErr("Заполните логин и пароль"); return; }
    setUserFormLoading(true);
    try {
      const r = await authFetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(userForm) });
      const d = await r.json();
      if (!r.ok) { setUserFormErr(d.error || "Ошибка"); return; }
      setUserForm({ username: "", password: "", role: "doctor" });
      fetchUsers();
    } catch { setUserFormErr("Сетевая ошибка"); }
    finally { setUserFormLoading(false); }
  };

  const handleChangeUserRole = async (u, newRole) => {
    await authFetch(`/api/admin/users/${u.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: newRole }) });
    fetchUsers();
  };

  const readResponseSafe = async (res) => {
    try { return await res.json(); } catch (_) { return null; }
  };

  const handleChangeUserPassword = async (u) => {
    const password = prompt(`Новый пароль для "${u.username}" (минимум 6 символов):`);
    if (password == null) return;
    const nextPassword = String(password).trim();
    if (nextPassword.length < 6) {
      alert("Пароль должен быть не короче 6 символов");
      return;
    }
    const r = await authFetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: nextPassword })
    });
    const d = await readResponseSafe(r);
    if (!r.ok) {
      alert(d?.error || "Не удалось сменить пароль");
      return;
    }
    alert(`Пароль пользователя "${u.username}" обновлён`);
  };

  const handleDeleteUser = async (u) => {
    if (u.id === user?.id) {
      alert("Нельзя удалить текущего пользователя");
      return;
    }
    if (!confirm(`Удалить пользователя "${u.username}"? Это действие необратимо.`)) return;
    const r = await authFetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const d = await readResponseSafe(r);
    if (!r.ok) {
      alert(d?.error || "Не удалось удалить пользователя");
      return;
    }
    setUserClientsMap(prev => {
      const next = { ...prev };
      delete next[u.id];
      return next;
    });
    if (expandedUserId === u.id) {
      setExpandedUserId(null);
      setAddClientSelect("");
    }
    fetchUsers();
    fetchStats();
  };

  const handleToggleUserAllClientsAccess = async (u) => {
    if (u.role === "admin") return;
    const nextAllAccess = !u.all_clients_access;
    const r = await authFetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all_clients_access: nextAllAccess ? 1 : 0 })
    });
    const d = await readResponseSafe(r);
    if (!r.ok) {
      alert(d?.error || "Не удалось обновить доступ к клиентам");
      return;
    }
    if (nextAllAccess) {
      setExpandedUserId(prev => (prev === u.id ? null : prev));
      setAddClientSelect("");
    }
    fetchUserClients(u.id);
    fetchUsers();
  };

  // ===== ROLES TAB =====
  const handleCreateRole = async () => {
    setRoleFormErr("");
    if (!roleFormName.trim() || !roleFormDisplay.trim()) { setRoleFormErr("Заполните оба поля"); return; }
    const r = await authFetch("/api/admin/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: roleFormName, displayName: roleFormDisplay }) });
    const d = await r.json();
    if (!r.ok) { setRoleFormErr(d.error || "Ошибка"); return; }
    setRoleFormName(""); setRoleFormDisplay("");
    fetchRoles();
  };

  const handleDeleteRole = async (id) => {
    if (!confirm("Удалить роль?")) return;
    const r = await authFetch(`/api/admin/roles/${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) { alert(d.error || "Ошибка"); return; }
    fetchRoles();
  };

  const handleRenameRole = async (id) => {
    if (!editingRoleDisplay.trim()) return;
    await authFetch(`/api/admin/roles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: editingRoleDisplay }) });
    setEditingRoleId(null); setEditingRoleDisplay("");
    fetchRoles();
  };

  const getPendingRole = (roleId) => pendingRoleChanges[roleId] || {};

  const setRoleSectionPerm = (roleId, secId, field, val) => {
    setPendingRoleChanges(prev => {
      const cur = prev[roleId] || {};
      const curSec = (cur.sections || {})[secId] || {};
      return { ...prev, [roleId]: { ...cur, sections: { ...(cur.sections || {}), [secId]: { ...curSec, [field]: val } } } };
    });
  };

  const setRolePermission = (roleId, perm, val) => {
    setPendingRoleChanges(prev => {
      const cur = prev[roleId] || {};
      return { ...prev, [roleId]: { ...cur, permissions: { ...(cur.permissions || {}), [perm]: val } } };
    });
  };

  const handleSaveRolePerms = async (roleId) => {
    const changes = pendingRoleChanges[roleId];
    if (!changes) return;
    const role = rolesData.find(r => r.id === roleId);
    const payload = { ...changes };
    if (changes.sections) {
      const mergedSections = {};
      for (const [secId, perms] of Object.entries(changes.sections)) {
        const base = role?.sections?.[secId] || {};
        mergedSections[secId] = {
          read: perms?.read === undefined ? !!base.read : !!perms.read,
          write: perms?.write === undefined ? !!base.write : !!perms.write
        };
      }
      payload.sections = mergedSections;
    }
    const r = await authFetch(`/api/admin/roles/${roleId}/sections`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await readResponseSafe(r);
    if (!r.ok) {
      alert(d.error || "Ошибка сохранения прав");
      return;
    }
    setPendingRoleChanges(prev => { const n = { ...prev }; delete n[roleId]; return n; });
    fetchRoles();
  };

  const getRoleSectionVal = (role, secId, field) => {
    const pending = getPendingRole(role.id);
    if (pending.sections?.[secId]?.[field] !== undefined) return pending.sections[secId][field];
    return role.sections?.[secId]?.[field] ?? true;
  };

  const getRolePermVal = (role, perm) => {
    const pending = getPendingRole(role.id);
    if (pending.permissions?.[perm] !== undefined) return pending.permissions[perm];
    return role.permissions?.[perm] ?? false;
  };

  // ===== DOCTORS TAB =====
  const handleCreateDoctor = async () => {
    setDoctorFormErr("");
    if (!doctorForm.name.trim()) { setDoctorFormErr("Укажите имя"); return; }
    const r = await authFetch("/api/admin/doctors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(doctorForm) });
    const d = await r.json();
    if (!r.ok) { setDoctorFormErr(d.error || "Ошибка"); return; }
    setDoctorForm({ name: "", role: "", user_id: null });
    emitDoctorsChanged();
    fetchDoctors();
  };

  const handleDeleteDoctor = async (doc) => {
    if (!confirm(`Удалить "${doc.name}"?`)) return;
    await authFetch(`/api/admin/doctors/${doc.id}`, { method: "DELETE" });
    emitDoctorsChanged();
    fetchDoctors();
  };

  const handleSaveDoctor = async () => {
    if (!editingDoctor) return;
    await authFetch(`/api/admin/doctors/${editingDoctor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingDoctor.name, role: editingDoctor.role, user_id: editingDoctor.user_id ?? null })
    });
    setEditingDoctor(null);
    emitDoctorsChanged();
    fetchDoctors();
  };

  const handleSetDoctorUser = async (doc, userId) => {
    const nextUserId = userId ? Number(userId) : null;
    await authFetch(`/api/admin/doctors/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: nextUserId })
    });
    if (nextUserId) {
      fetchUserClients(nextUserId);
    }
    fetchDoctors();
  };

  // ===== REFERENCES TAB =====
  const handleDefPresetMarkerInput = (nextValue, setter) => {
    const markerKey = resolveMarkerKey(nextValue);
    setter(prev => ({ ...prev, markerSearch: nextValue, markerKey }));
  };

  const emitLabOrderTemplatesChanged = () => {
    try {
      window.dispatchEvent(new Event("lab-order-templates-changed"));
    } catch (_) {
      try {
        const ev = document.createEvent("Event");
        ev.initEvent("lab-order-templates-changed", true, true);
        window.dispatchEvent(ev);
      } catch (_) {
        // ignore
      }
    }
  };

  const emitDoctorsChanged = () => {
    try {
      window.dispatchEvent(new Event("doctors-changed"));
    } catch (_) {
      try {
        const ev = document.createEvent("Event");
        ev.initEvent("doctors-changed", true, true);
        window.dispatchEvent(ev);
      } catch (_) {
        // ignore
      }
    }
  };

  const handleAddRef = async () => {
    setRefErr("");
    let valueToSave = refInput;
    if (refSubTab === "deficit_preset") {
      if (!defPresetForm.label.trim()) { setRefErr("Введите название дефицита"); return; }
      const markerKey = defPresetForm.markerKey || resolveMarkerKey(defPresetForm.markerSearch);
      if (!markerKey) { setRefErr("Выберите анализ из подсказок"); return; }
      valueToSave = serializeDeficitPresetPayload({
        label: defPresetForm.label.trim(),
        markerKey,
        triggerMode: defPresetForm.triggerMode || "auto"
      });
    } else if (refSubTab === "lab_order_item") {
      if (!labOrderForm.name.trim()) { setRefErr("Введите название раздела"); return; }
      const markers = parseLabOrderMarkersText(labOrderForm.markersText);
      if (!labOrderForm.simple && markers.length === 0) { setRefErr("Добавьте хотя бы один маркер или включите режим \"раздел целиком\""); return; }
      valueToSave = serializeLabOrderItemPayload({
        name: labOrderForm.name.trim(),
        markers,
        simple: !!labOrderForm.simple
      });
    } else if (!refInput.trim()) {
      setRefErr("Введите значение");
      return;
    }

    const r = await authFetch("/api/admin/references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: refSubTab, value: valueToSave }) });
    const d = await r.json();
    if (!r.ok) { setRefErr(d.error || "Ошибка"); return; }
    if (refSubTab === "deficit_preset") {
      setDefPresetForm({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
    } else if (refSubTab === "lab_order_item") {
      setLabOrderForm({ name: "", markersText: "", simple: false });
      setLabOrderFormCollapsed(false);
      emitLabOrderTemplatesChanged();
    } else {
      setRefInput("");
    }
    fetchRefs(refSubTab);
  };

  const handleDeleteRef = async (id) => {
    await authFetch(`/api/admin/references/${id}`, { method: "DELETE" });
    if (editingRefId === id) {
      setEditingRefId(null);
      setEditingRefInput("");
      setEditingDefPresetForm({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
      setEditingLabOrderForm({ name: "", markersText: "", simple: false });
      setEditingLabOrderMarkersCollapsed(false);
    }
    if (refSubTab === "lab_order_item") emitLabOrderTemplatesChanged();
    fetchRefs(refSubTab);
  };

  const handleStartRefEdit = (item) => {
    setRefErr("");
    setEditingRefId(item.id);
    if (refSubTab === "deficit_preset") {
      const parsed = parseDeficitPresetPayload(item.value) || {};
      const parsedMarkerKey = String(parsed.markerKey || "");
      setEditingDefPresetForm({
        label: String(parsed.label || item.value || ""),
        markerKey: parsedMarkerKey,
        markerSearch: parsedMarkerKey ? (deficitMarkerLabelByKey[parsedMarkerKey] || parsedMarkerKey) : "",
        triggerMode: parsed.triggerMode === "ref" || parsed.triggerMode === "optimal" ? parsed.triggerMode : "auto"
      });
      setEditingRefInput("");
      return;
    }
    if (refSubTab === "lab_order_item") {
      const parsed = parseLabOrderItemPayload(item.value);
      setEditingLabOrderForm({
        name: parsed?.name || String(item.value || ""),
        markersText: markersToLabOrderText(parsed?.markers || []),
        simple: !!parsed?.simple
      });
      setEditingLabOrderMarkersCollapsed(false);
      setEditingRefInput("");
      setEditingDefPresetForm({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
      return;
    }
    setEditingRefInput(String(item.value || ""));
    setEditingDefPresetForm({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
    setEditingLabOrderForm({ name: "", markersText: "", simple: false });
    setEditingLabOrderMarkersCollapsed(false);
  };

  const handleCancelRefEdit = () => {
    setEditingRefId(null);
    setEditingRefInput("");
    setEditingDefPresetForm({ label: "", markerKey: "", markerSearch: "", triggerMode: "auto" });
    setEditingLabOrderForm({ name: "", markersText: "", simple: false });
    setEditingLabOrderMarkersCollapsed(false);
    setRefErr("");
  };

  const handleSaveRefEdit = async (id) => {
    setRefErr("");
    let valueToSave = editingRefInput;
    if (refSubTab === "deficit_preset") {
      if (!editingDefPresetForm.label.trim()) { setRefErr("Введите название дефицита"); return; }
      const markerKey = editingDefPresetForm.markerKey || resolveMarkerKey(editingDefPresetForm.markerSearch);
      if (!markerKey) { setRefErr("Выберите анализ из подсказок"); return; }
      const existingItem = refItems.find(x => x.id === id);
      const existingPayload = parseDeficitPresetPayload(existingItem?.value) || {};
      valueToSave = serializeDeficitPresetPayload({
        ...existingPayload,
        label: editingDefPresetForm.label.trim(),
        markerKey,
        triggerMode: editingDefPresetForm.triggerMode || "auto"
      });
    } else if (refSubTab === "lab_order_item") {
      if (!editingLabOrderForm.name.trim()) { setRefErr("Введите название раздела"); return; }
      const markers = parseLabOrderMarkersText(editingLabOrderForm.markersText);
      if (!editingLabOrderForm.simple && markers.length === 0) { setRefErr("Добавьте хотя бы один маркер или включите режим \"раздел целиком\""); return; }
      valueToSave = serializeLabOrderItemPayload({
        name: editingLabOrderForm.name.trim(),
        markers,
        simple: !!editingLabOrderForm.simple
      });
    } else if (!editingRefInput.trim()) {
      setRefErr("Введите значение");
      return;
    }

    const parseResponseSafe = async (res) => {
      const ct = String(res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        try { return await res.json(); } catch (_) { return null; }
      }
      try {
        const text = await res.text();
        return text ? { error: text.slice(0, 180) } : null;
      } catch (_) {
        return null;
      }
    };

    try {
      const existingItem = refItems.find(x => x.id === id);
      const r = await authFetch(`/api/admin/references/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: valueToSave })
      });
      let d = await parseResponseSafe(r);
      if (!r.ok) {
        // Fallback for environments where PATCH route is not available yet.
        if (r.status === 404 || r.status === 405 || r.status === 501) {
          const createRes = await authFetch("/api/admin/references", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: refSubTab,
              value: valueToSave,
              sort_order: Number(existingItem?.sort_order || 0)
            })
          });
          const createData = await parseResponseSafe(createRes);
          if (!createRes.ok) {
            setRefErr(createData?.error || `Ошибка сохранения (${createRes.status})`);
            return;
          }
          await authFetch(`/api/admin/references/${id}`, { method: "DELETE" }).catch(() => {});
        } else {
          setRefErr(d?.error || `Ошибка сохранения (${r.status})`);
          return;
        }
      }
      if (refSubTab === "lab_order_item") emitLabOrderTemplatesChanged();
      handleCancelRefEdit();
      fetchRefs(refSubTab);
    } catch (_) {
      setRefErr("Ошибка сохранения. Попробуйте ещё раз.");
    }
  };

  const tabStyle = (id) => ({
    padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 600 : 400,
    background: tab === id ? $.acD : "transparent", color: tab === id ? $.ac : $.txS,
    border: "none", fontFamily: "inherit", transition: "all .15s"
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',-apple-system,sans-serif", color: $.tx }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 0", borderBottom: `1px solid ${$.brd}`, background: $.bgC, flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Администрирование</div>
        {stats && (
          <div style={{ display: "flex", gap: 20, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "Клиентов", val: stats.clientsCount },
              { label: "Этапов", val: stats.stagesCount },
              { label: "Пользователей", val: stats.usersCount },
              { label: "Врачей", val: stats.doctorsCount },
            ].map(s => (
              <div key={s.label} style={{ background: $.bgI, border: `1px solid ${$.brd}`, borderRadius: 8, padding: "8px 16px", minWidth: 90, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: $.ac }}>{s.val}</div>
                <div style={{ fontSize: 11, color: $.txM }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={tabStyle(t.id)}>{t.label}</button>)}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>

        {/* ===== USERS TAB ===== */}
        {tab === "users" && (
          <div>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Создать пользователя</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Логин</div>
                  <input value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} style={{ ...inp, width: 160 }} placeholder="username" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Пароль</div>
                  <input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} style={{ ...inp, width: 140 }} placeholder="минимум 6 символов" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Роль</div>
                  <select value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))} style={{ ...inp, width: 160 }}>
                    {roles.map(r => <option key={r.id || r.name} value={r.name}>{r.displayName || r.display_name}</option>)}
                  </select>
                </div>
                <button onClick={handleCreateUser} disabled={userFormLoading} style={bt("ac")}>
                  {userFormLoading ? "..." : "+ Создать"}
                </button>
              </div>
              {userFormErr && <div style={{ marginTop: 8, color: $.dn, fontSize: 12 }}>{userFormErr}</div>}
            </div>

            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Пользователи</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${$.brd}` }}>
                    {["ID", "Логин", "Роль", "Создан", "Статус", "Клиенты", "Действия"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: $.txM, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const isExpanded = expandedUserId === u.id;
                    const assignedClients = sortClientsByName(userClientsMap[u.id] || []);
                    const isAdmin = u.role === "admin";
                    const hasAllClientsAccess = !!u.all_clients_access;
                    const hasGlobalClientAccess = isAdmin || hasAllClientsAccess;
                    const unassigned = sortClientsByName(
                      allClients.filter(c => !assignedClients.some(a => a.id === c.id))
                    );
                    return (
                      <Fragment key={u.id}>
                        <tr style={{ borderBottom: isExpanded ? "none" : `1px solid ${$.brd}`, opacity: u.active ? 1 : 0.5 }}>
                          <td style={{ padding: "8px 10px", color: $.txM }}>{u.id}</td>
                          <td style={{ padding: "8px 10px", fontWeight: 600 }}>{u.username}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <select
                              value={u.role}
                              onChange={e => handleChangeUserRole(u, e.target.value)}
                              style={{ ...inp, padding: "3px 7px", fontSize: 12 }}
                            >
                              {roles.map(r => <option key={r.id || r.name} value={r.name}>{r.displayName || r.display_name}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "8px 10px", color: $.txM, fontSize: 12 }}>{u.created_at?.slice(0, 10) || "—"}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: u.active ? "#22c55e" : $.txM }}>
                              {u.active ? "Активен" : "Отключён"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            {hasGlobalClientAccess ? (
                              <span style={{ fontSize: 11, color: $.txM, fontStyle: "italic" }}>все</span>
                            ) : (
                              <button
                                onClick={() => handleToggleUserClients(u.id)}
                                style={{ ...sbt, background: isExpanded ? $.ac + "22" : $.brd, color: isExpanded ? $.ac : $.txS }}
                              >
                                {isExpanded ? "Скрыть" : `Клиенты (${assignedClients.length})`}
                              </button>
                            )}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {!isAdmin && (
                                <button
                                  onClick={() => handleToggleUserAllClientsAccess(u)}
                                  style={{
                                    ...sbt,
                                    background: hasAllClientsAccess ? $.ac + "22" : $.brd,
                                    color: hasAllClientsAccess ? $.ac : $.txS
                                  }}
                                >
                                  {hasAllClientsAccess ? "Все клиенты" : "Ограниченный"}
                                </button>
                              )}
                              <button
                                onClick={() => handleChangeUserPassword(u)}
                                style={{ ...sbt, background: $.ac + "22", color: $.ac }}
                              >
                                Пароль
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                disabled={u.id === user?.id}
                                title={u.id === user?.id ? "Нельзя удалить текущего пользователя" : "Удалить пользователя"}
                                style={{ ...sbt, background: $.dn + "22", color: $.dn, opacity: u.id === user?.id ? 0.45 : 1 }}
                              >
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && !hasGlobalClientAccess && (
                          <tr style={{ borderBottom: `1px solid ${$.brd}` }}>
                            <td colSpan={7} style={{ padding: "8px 14px 14px 14px", background: $.bgB }}>
                              <div style={{ fontSize: 12, color: $.txM, marginBottom: 8, fontWeight: 600 }}>
                                Доступные клиенты для {u.username}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                                {assignedClients.length === 0 && (
                                  <span style={{ fontSize: 12, color: $.txM, fontStyle: "italic" }}>Нет назначенных клиентов</span>
                                )}
                                {assignedClients.map(c => (
                                  <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: $.ac + "22", color: $.ac, borderRadius: 5, padding: "3px 8px", fontSize: 12, fontWeight: 600 }}>
                                    {c.name}
                                    <button
                                      onClick={() => handleUnassignClient(u.id, c.id)}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: $.ac, fontWeight: 700, padding: 0, fontSize: 13, lineHeight: 1 }}
                                      title="Убрать доступ"
                                    >×</button>
                                  </span>
                                ))}
                              </div>
                              {unassigned.length > 0 && (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <select
                                    value={addClientSelect}
                                    onChange={e => setAddClientSelect(e.target.value)}
                                    style={{ ...inp, fontSize: 12, padding: "4px 8px" }}
                                  >
                                    <option value="">— выбрать клиента —</option>
                                    {unassigned.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                  <button
                                    onClick={() => handleAssignClient(u.id, addClientSelect)}
                                    disabled={!addClientSelect}
                                    style={{ ...sbt, background: $.ac + "22", color: $.ac, opacity: addClientSelect ? 1 : 0.4 }}
                                  >
                                    + Добавить
                                  </button>
                                </div>
                              )}
                              {unassigned.length === 0 && assignedClients.length > 0 && (
                                <span style={{ fontSize: 12, color: $.txM, fontStyle: "italic" }}>Все клиенты уже назначены</span>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {users.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: $.txM }}>Нет пользователей</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== ROLES TAB ===== */}
        {tab === "roles" && (
          <div>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Создать роль</div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Внутреннее имя (латиница)</div>
                  <input value={roleFormName} onChange={e => setRoleFormName(e.target.value)} style={{ ...inp, width: 160 }} placeholder="my_role" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Отображаемое название</div>
                  <input value={roleFormDisplay} onChange={e => setRoleFormDisplay(e.target.value)} style={{ ...inp, width: 180 }} placeholder="Моя роль" />
                </div>
                <button onClick={handleCreateRole} style={bt("ac")}>+ Создать</button>
              </div>
              {roleFormErr && <div style={{ marginTop: 8, color: $.dn, fontSize: 12 }}>{roleFormErr}</div>}
            </div>

            {rolesData.map(role => (
              <div key={role.id} style={card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {editingRoleId === role.id ? (
                      <>
                        <input
                          value={editingRoleDisplay}
                          onChange={e => setEditingRoleDisplay(e.target.value)}
                          style={{ ...inp, width: 180 }}
                          autoFocus
                        />
                        <button onClick={() => handleRenameRole(role.id)} style={{ ...sbt, background: $.ac + "22", color: $.ac }}>Сохранить</button>
                        <button onClick={() => setEditingRoleId(null)} style={{ ...sbt, background: $.brd, color: $.txS }}>Отмена</button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{role.displayName}</span>
                        <span style={{ fontSize: 12, color: $.txM }}>({role.name})</span>
                        {role.isSystem && <span style={{ fontSize: 10, background: $.ac + "22", color: $.ac, padding: "2px 7px", borderRadius: 4, fontWeight: 600 }}>СИСТЕМА</span>}
                        <button onClick={() => { setEditingRoleId(role.id); setEditingRoleDisplay(role.displayName); }} style={{ ...sbt, background: "transparent", color: $.txM }}>✏️</button>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {pendingRoleChanges[role.id] && (
                      <button onClick={() => handleSaveRolePerms(role.id)} style={bt("ac")}>Сохранить</button>
                    )}
                    {!role.isSystem && (
                      <button onClick={() => handleDeleteRole(role.id)} style={{ ...sbt, background: $.dn + "22", color: $.dn }}>Удалить</button>
                    )}
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: $.txM, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Разделы</div>
                <div style={{ overflowX: "auto", marginBottom: 14 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "4px 10px", textAlign: "left", color: $.txM, fontWeight: 600 }}>Раздел</th>
                        <th style={{ padding: "4px 10px", textAlign: "center", color: $.txM, fontWeight: 600 }}>Чтение</th>
                        <th style={{ padding: "4px 10px", textAlign: "center", color: $.txM, fontWeight: 600 }}>Запись</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ALL_SECTIONS.map(sec => (
                        <tr key={sec} style={{ borderBottom: `1px solid ${$.brd}` }}>
                          <td style={{ padding: "5px 10px" }}>{SECTION_LABELS[sec]}</td>
                          <td style={{ padding: "5px 10px", textAlign: "center" }}>
                            <input type="checkbox" checked={getRoleSectionVal(role, sec, "read")} onChange={e => setRoleSectionPerm(role.id, sec, "read", e.target.checked)} />
                          </td>
                          <td style={{ padding: "5px 10px", textAlign: "center" }}>
                            <input type="checkbox" checked={getRoleSectionVal(role, sec, "write")} onChange={e => setRoleSectionPerm(role.id, sec, "write", e.target.checked)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: $.txM, textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Права</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {ALL_PERMISSIONS.map(perm => (
                    <label key={perm} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={getRolePermVal(role, perm)} onChange={e => setRolePermission(role.id, perm, e.target.checked)} />
                      {PERM_LABELS[perm]}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== DOCTORS TAB ===== */}
        {tab === "doctors" && (
          <div>
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Добавить врача</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Имя</div>
                  <input value={doctorForm.name} onChange={e => setDoctorForm(f => ({ ...f, name: e.target.value }))} style={{ ...inp, width: 220 }} placeholder="Иванов Иван Иванович" />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: $.txM, marginBottom: 4 }}>Специальность</div>
                  <input value={doctorForm.role} onChange={e => setDoctorForm(f => ({ ...f, role: e.target.value }))} style={{ ...inp, width: 180 }} placeholder="Эндокринолог" />
                </div>
                <button onClick={handleCreateDoctor} style={bt("ac")}>+ Добавить</button>
              </div>
              {doctorFormErr && <div style={{ marginTop: 8, color: $.dn, fontSize: 12 }}>{doctorFormErr}</div>}
            </div>

            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Список врачей</div>
              {doctors.length === 0 ? (
                <div style={{ color: $.txM, fontSize: 13 }}>Нет врачей</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${$.brd}` }}>
                      {["Имя", "Специальность", "Аккаунт", ""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: $.txM, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doctors.map((doc) => (
                      <tr key={doc.id} style={{ borderBottom: `1px solid ${$.brd}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>
                          {editingDoctor && editingDoctor.id === doc.id ? (
                            <input
                              value={editingDoctor.name}
                              onChange={e => setEditingDoctor(d => ({ ...d, name: e.target.value }))}
                              style={{ ...inp, width: 200 }}
                            />
                          ) : doc.name}
                        </td>
                        <td style={{ padding: "8px 10px", color: $.txS }}>
                          {editingDoctor && editingDoctor.id === doc.id ? (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input
                                value={editingDoctor.role}
                                onChange={e => setEditingDoctor(d => ({ ...d, role: e.target.value }))}
                                style={{ ...inp, width: 160 }}
                              />
                              <button onClick={handleSaveDoctor} style={{ ...sbt, background: $.ac + "22", color: $.ac }}>✓</button>
                              <button onClick={() => setEditingDoctor(null)} style={{ ...sbt, background: $.brd, color: $.txS }}>✕</button>
                            </div>
                          ) : (
                            <span>{doc.role || "—"}</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <select
                            value={doc.user_id ?? ""}
                            onChange={e => handleSetDoctorUser(doc, e.target.value)}
                            style={{ ...inp, fontSize: 12, padding: "3px 7px" }}
                          >
                            <option value="">— не привязан —</option>
                            {(users || []).filter(u => u.role !== "admin").map(u => (
                              <option key={u.id} value={u.id}>{u.username}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button
                              onClick={() => setEditingDoctor({ id: doc.id, name: doc.name, role: doc.role, user_id: doc.user_id })}
                              style={{ ...sbt, background: $.brd, color: $.txS }}
                            >✏️</button>
                            <button
                              onClick={() => handleDeleteDoctor(doc)}
                              style={{ ...sbt, background: $.dn + "22", color: $.dn }}
                            >✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ===== REFERENCES TAB ===== */}
        {tab === "references" && (
          <div>
            <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
              {[
                { id: "deficit_preset", label: "Пресеты дефицитов" },
                { id: "lab_order_item", label: "Анализы на направление" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setRefSubTab(t.id)}
                  style={{
                    ...sbt,
                    padding: "7px 14px",
                    background: refSubTab === t.id ? $.ac : $.bgI,
                    color: refSubTab === t.id ? "#fff" : $.txS,
                    border: `1px solid ${$.brd}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                {refSubTab === "deficit_preset" ? "Пресеты дефицитов" : "Анализы на направление"}
              </div>
              {refSubTab === "deficit_preset" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 8, marginBottom: 12, alignItems: "center" }}>
                  <input
                    list="deficit-marker-options"
                    value={defPresetForm.markerSearch}
                    onChange={e => handleDefPresetMarkerInput(e.target.value, setDefPresetForm)}
                    onKeyDown={e => e.key === "Enter" && handleAddRef()}
                    style={{ ...inp, width: "100%" }}
                    placeholder="Начните вводить анализ..."
                  />
                  <input
                    value={defPresetForm.label}
                    onChange={e => setDefPresetForm(v => ({ ...v, label: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleAddRef()}
                    style={{ ...inp, width: "100%" }}
                    placeholder="Название дефицита"
                  />
                  <select value={defPresetForm.triggerMode} onChange={e => setDefPresetForm(v => ({ ...v, triggerMode: e.target.value }))} style={{ ...inp, width: 210 }}>
                    <option value="auto">{DEFICIT_TRIGGER_LABELS.auto}</option>
                    <option value="ref">{DEFICIT_TRIGGER_LABELS.ref}</option>
                    <option value="optimal">{DEFICIT_TRIGGER_LABELS.optimal}</option>
                  </select>
                  <button onClick={handleAddRef} style={bt("ac")}>+ Добавить</button>
                </div>
              ) : refSubTab === "lab_order_item" ? (
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                    <input
                      value={labOrderForm.name}
                      onChange={e => setLabOrderForm(v => ({ ...v, name: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAddRef()}
                      style={{ ...inp, width: "100%" }}
                      placeholder="Название раздела (например, Нутриенты)"
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: $.txS, whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={!!labOrderForm.simple} onChange={e => setLabOrderForm(v => ({ ...v, simple: e.target.checked }))} />
                      Раздел целиком
                    </label>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: $.txS }}>Маркеры раздела</span>
                    <button
                      onClick={() => setLabOrderFormCollapsed(v => !v)}
                      style={{ ...sbt, background: $.bgI, color: $.txS, border: `1px solid ${$.brd}` }}
                    >
                      {labOrderFormCollapsed ? "Развернуть маркеры" : "Свернуть маркеры"}
                    </button>
                  </div>
                  {!labOrderFormCollapsed && (
                    <textarea
                      value={labOrderForm.markersText}
                      onChange={e => setLabOrderForm(v => ({ ...v, markersText: e.target.value }))}
                      style={{ ...inp, minHeight: 110, resize: "vertical" }}
                      placeholder="Маркеры по одному в строке"
                    />
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={handleAddRef} style={bt("ac")}>+ Добавить раздел</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <input
                    value={refInput}
                    onChange={e => setRefInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddRef()}
                    style={{ ...inp, flex: 1 }}
                    placeholder="Введите значение..."
                  />
                  <button onClick={handleAddRef} style={bt("ac")}>+ Добавить</button>
                </div>
              )}
              {refErr && <div style={{ marginBottom: 8, color: $.dn, fontSize: 12 }}>{refErr}</div>}
              <div>
                {refItems.length === 0 ? (
                  <div style={{ color: $.txM, fontSize: 13, padding: "8px 0" }}>Нет записей</div>
                ) : (
                  refItems.map(item => {
                    const isEditing = editingRefId === item.id;
                    const preset = refSubTab === "deficit_preset" ? parseDeficitPresetPayload(item.value) : null;
                    const labItem = refSubTab === "lab_order_item" ? parseLabOrderItemPayload(item.value) : null;
                    const markerLabel = preset?.markerKey ? (deficitMarkerLabelByKey[preset.markerKey] || preset.markerKey) : "";
                    const title = refSubTab === "deficit_preset"
                      ? (preset?.label || markerLabel || String(item.value || ""))
                      : refSubTab === "lab_order_item"
                        ? (labItem?.name || String(item.value || ""))
                        : (preset?.label || String(item.value || ""));
                    const triggerLabel = preset?.triggerMode ? (DEFICIT_TRIGGER_LABELS[preset.triggerMode] || DEFICIT_TRIGGER_LABELS.auto) : "";
                    const labMarkersCount = labItem?.markers?.length || 0;
                    return (
                    <div key={item.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px solid ${$.brd}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          refSubTab === "deficit_preset" ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                                <input
                                  list="deficit-marker-options"
                                  value={editingDefPresetForm.markerSearch}
                                  onChange={e => handleDefPresetMarkerInput(e.target.value, setEditingDefPresetForm)}
                                  onKeyDown={e => e.key === "Enter" && handleSaveRefEdit(item.id)}
                                  style={{ ...inp, width: "100%" }}
                                  placeholder="Начните вводить анализ..."
                                />
                                <input
                                  value={editingDefPresetForm.label}
                                  onChange={e => setEditingDefPresetForm(v => ({ ...v, label: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && handleSaveRefEdit(item.id)}
                                  style={{ ...inp, width: "100%" }}
                                  placeholder="Название дефицита"
                                />
                                <select value={editingDefPresetForm.triggerMode} onChange={e => setEditingDefPresetForm(v => ({ ...v, triggerMode: e.target.value }))} style={{ ...inp, width: 210 }}>
                                  <option value="auto">{DEFICIT_TRIGGER_LABELS.auto}</option>
                                  <option value="ref">{DEFICIT_TRIGGER_LABELS.ref}</option>
                                  <option value="optimal">{DEFICIT_TRIGGER_LABELS.optimal}</option>
                                </select>
                              </div>
                            </div>
                          ) : refSubTab === "lab_order_item" ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                                <input
                                  value={editingLabOrderForm.name}
                                  onChange={e => setEditingLabOrderForm(v => ({ ...v, name: e.target.value }))}
                                  onKeyDown={e => e.key === "Enter" && handleSaveRefEdit(item.id)}
                                  style={{ ...inp, width: "100%" }}
                                  placeholder="Название раздела"
                                />
                                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: $.txS, whiteSpace: "nowrap" }}>
                                  <input type="checkbox" checked={!!editingLabOrderForm.simple} onChange={e => setEditingLabOrderForm(v => ({ ...v, simple: e.target.checked }))} />
                                  Раздел целиком
                                </label>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: $.txS }}>Маркеры раздела</span>
                                <button
                                  onClick={() => setEditingLabOrderMarkersCollapsed(v => !v)}
                                  style={{ ...sbt, background: $.bgI, color: $.txS, border: `1px solid ${$.brd}` }}
                                >
                                  {editingLabOrderMarkersCollapsed ? "Развернуть маркеры" : "Свернуть маркеры"}
                                </button>
                              </div>
                              {!editingLabOrderMarkersCollapsed && (
                                <textarea
                                  value={editingLabOrderForm.markersText}
                                  onChange={e => setEditingLabOrderForm(v => ({ ...v, markersText: e.target.value }))}
                                  style={{ ...inp, minHeight: 96, resize: "vertical" }}
                                  placeholder="Маркеры по одному в строке"
                                />
                              )}
                            </div>
                          ) : (
                            <input
                              value={editingRefInput}
                              onChange={e => setEditingRefInput(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && handleSaveRefEdit(item.id)}
                              style={{ ...inp, width: "100%" }}
                            />
                          )
                        ) : (
                          <div style={{ display: "grid", gap: 2 }}>
                            <span style={{ fontSize: 13 }}>{title}</span>
                            {refSubTab === "deficit_preset" && markerLabel && <span style={{ fontSize: 11, color: $.txM }}>{markerLabel} • {triggerLabel}</span>}
                            {refSubTab === "lab_order_item" && (
                              <span style={{ fontSize: 11, color: $.txM }}>
                                {labItem?.simple ? "Раздел целиком" : `${labMarkersCount} марк.`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {isEditing ? (
                          <>
                            <button onClick={() => handleSaveRefEdit(item.id)} style={{ ...sbt, background: $.ac + "22", color: $.ac }}>Сохранить</button>
                            <button onClick={handleCancelRefEdit} style={{ ...sbt, background: $.bgI, color: $.txS, border: `1px solid ${$.brd}` }}>Отмена</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => handleStartRefEdit(item)} style={{ ...sbt, background: $.ac + "22", color: $.ac }}>Изменить</button>
                            <button onClick={() => handleDeleteRef(item.id)} style={{ ...sbt, background: $.dn + "22", color: $.dn }}>Удалить</button>
                          </>
                        )}
                      </div>
                    </div>
                  )})
                )}
              </div>
              {refSubTab === "deficit_preset" && (
                <datalist id="deficit-marker-options">
                  {deficitMarkerOptions.map(opt => <option key={opt.key} value={opt.label} />)}
                </datalist>
              )}
            </div>
          </div>
        )}

        {/* ===== ACTIVITY TAB ===== */}
        {tab === "activity" && (
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Журнал активности</div>
              <button onClick={fetchActivity} style={bt("g")}>Обновить</button>
            </div>
            {activityLoading ? (
              <div style={{ color: $.txM, fontSize: 13, padding: 20, textAlign: "center" }}>Загрузка...</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${$.brd}` }}>
                    {["Время", "Действие", "Сотрудник", "Клиент", "Этап"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: $.txM, fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.map((row, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${$.brd}` }}>
                      <td style={{ padding: "7px 10px", color: $.txM, whiteSpace: "nowrap" }}>{row.ts?.replace("T", " ").slice(0, 19) || "—"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 500 }}>{row.action}</td>
                      <td style={{ padding: "7px 10px" }}>{row.actor || "—"}</td>
                      <td style={{ padding: "7px 10px" }}>{row.clientName || "—"}</td>
                      <td style={{ padding: "7px 10px", color: $.txS }}>{row.stageTitle || "—"}</td>
                    </tr>
                  ))}
                  {activity.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: $.txM }}>Нет записей</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
