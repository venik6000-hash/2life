import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { calculateBmiValue } from "../utils/helpers";
import { useAuth } from "./AuthContext";
import { fetchJournalBadges } from "../utils/journalApi";
import { withTimeout } from "../utils/requestTimeout";

export const SECTIONS = [
  {id:"overview",ic:"◉",lb:"Обзор"},{id:"questionnaire",ic:"📋",lb:"Анкета"},
  {id:"nutrition",ic:"🥗",lb:"Питание"},{id:"menu",ic:"☰",lb:"Меню"},{id:"protocol",ic:"💊",lb:"Протокол"},
  {id:"injections",ic:"💉",lb:"Инъекции"},
  {id:"analytics",ic:"📊",lb:"Анализы"},{id:"lab",ic:"🔬",lb:"Направление"},{id:"journal",ic:"📓",lb:"Журнал"},
  {id:"messenger",ic:"💬",lb:"Мессенджер"},
];

export const isClientRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "viewer" || normalized === "client";
};

const DashboardContext = createContext(null);
const BOOTSTRAP_REQUEST_TIMEOUT_MS = 8000;

const isPlainObject = (value) =>
  value != null &&
  typeof value === "object" &&
  !Array.isArray(value);

const deepEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;

  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const aObj = isPlainObject(a);
  const bObj = isPlainObject(b);
  if (aObj || bObj) {
    if (!aObj || !bObj) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
};

const buildClientIdentity = (name = "", fallbackAvatar = "Н") => {
  const cleaned = String(name || "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return {
    shortName: parts.slice(0, 2).join(" ") || cleaned,
    avatar: parts.slice(0, 2).map(w => (w[0] || "").toUpperCase()).join("") || fallbackAvatar
  };
};

const buildPatchOps = (prevValue, nextValue, path = []) => {
  const ops = [];

  const walk = (prevNode, nextNode, currentPath) => {
    if (deepEqual(prevNode, nextNode)) return;

    const prevObj = isPlainObject(prevNode);
    const nextObj = isPlainObject(nextNode);
    if (prevObj && nextObj) {
      const keys = new Set([...Object.keys(prevNode), ...Object.keys(nextNode)]);
      keys.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(nextNode, key)) {
          ops.push({ op: "delete", path: [...currentPath, key] });
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(prevNode, key)) {
          ops.push({ op: "set", path: [...currentPath, key], value: nextNode[key] });
          return;
        }
        walk(prevNode[key], nextNode[key], [...currentPath, key]);
      });
      return;
    }

    const prevArr = Array.isArray(prevNode);
    const nextArr = Array.isArray(nextNode);
    if (prevArr || nextArr) {
      if (!prevArr || !nextArr) {
        ops.push({ op: "set", path: [...currentPath], value: nextNode });
        return;
      }
      const minLen = Math.min(prevNode.length, nextNode.length);
      for (let i = 0; i < minLen; i += 1) {
        walk(prevNode[i], nextNode[i], [...currentPath, i]);
      }
      if (nextNode.length > prevNode.length) {
        for (let i = prevNode.length; i < nextNode.length; i += 1) {
          ops.push({ op: "set", path: [...currentPath, i], value: nextNode[i] });
        }
      } else if (prevNode.length > nextNode.length) {
        for (let i = prevNode.length - 1; i >= nextNode.length; i -= 1) {
          ops.push({ op: "delete", path: [...currentPath, i] });
        }
      }
      return;
    }

    ops.push({ op: "set", path: [...currentPath], value: nextNode });
  };

  walk(prevValue, nextValue, path);
  return ops;
};

const collapsePatchOps = (ops = []) => {
  const seen = new Set();
  const compact = [];
  const pathKey = (path = []) => path.map(String).join(".");
  for (let i = ops.length - 1; i >= 0; i -= 1) {
    const op = ops[i];
    const key = pathKey(op?.path || []);
    if (seen.has(key)) continue;
    seen.add(key);
    compact.push(op);
  }
  return compact.reverse();
};

export function DashboardProvider({ children }) {
  const { authFetch, user, permissions } = useAuth();
  const [cls, setCls] = useState([]);
  const [cid, setCid] = useState(()=>localStorage.getItem("dash_cid") || null);
  const [si, setSi] = useState(()=>Number(localStorage.getItem("dash_si") || 0));
  const [sec, setSec] = useState(()=>localStorage.getItem("dash_sec") || "overview");
  const [so, setSo] = useState(true);
  const [pk, setPk] = useState(false);
  const [md, setMd] = useState(null);
  const [pri, setPri] = useState(0);
  const [nri, setNri] = useState(0);
  const [doctors, setDoctors] = useState([]);
  const [deficitPresets, setDeficitPresets] = useState([]);
  const [labOrderTemplates, setLabOrderTemplates] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [journalBadges, setJournalBadges] = useState({});

  const isAdmin = useMemo(() => !!(permissions?.isAdmin || user?.role === "admin"), [permissions, user?.role]);
  const canReadSection = useCallback((sectionId) => {
    if (isAdmin) return true;
    if (sectionId === "messenger" && isClientRole(user?.role)) return true;
    const p = permissions?.sections?.[sectionId];
    return !!(p?.read || p?.write);
  }, [isAdmin, permissions, user?.role]);
  const canWriteSection = useCallback((sectionId) => {
    if (isAdmin) return true;
    if (sectionId === "messenger" && isClientRole(user?.role)) return true;
    return !!permissions?.sections?.[sectionId]?.write;
  }, [isAdmin, permissions, user?.role]);
  const canCreateClient = useMemo(() => !!(isAdmin || permissions?.canCreateClient), [isAdmin, permissions]);
  const canDeleteClient = useMemo(() => !!(isAdmin || permissions?.canDeleteClient), [isAdmin, permissions]);
  const canImportData = useMemo(() => !!(isAdmin || permissions?.canImportData), [isAdmin, permissions]);
  const visibleSections = useMemo(
    () => SECTIONS.filter((section) => canReadSection(section.id)),
    [canReadSection]
  );
  const canWriteActiveSection = useMemo(
    () => sec === "admin" ? isAdmin : canWriteSection(sec),
    [canWriteSection, sec, isAdmin]
  );

  const reloadJournalBadges = useCallback(async () => {
    if (!canReadSection("journal")) {
      setJournalBadges({});
      return {};
    }
    try {
      const data = await fetchJournalBadges(authFetch);
      const badges = data?.badges && typeof data.badges === "object" ? data.badges : {};
      setJournalBadges(badges);
      return badges;
    } catch (_) {
      return {};
    }
  }, [authFetch, canReadSection]);

  const normalizeDoctors = useCallback((items = []) => {
    const byKey = new Map();
    items.forEach(doc => {
      const name = String(doc?.name || "").trim();
      const role = String(doc?.role || "").trim();
      if (!name && !role) return;
      const key = name.toLowerCase();
      const userIdNum = Number(doc?.user_id);
      const user_id = Number.isInteger(userIdNum) && userIdNum > 0 ? userIdNum : null;
      if (!byKey.has(key)) {
        byKey.set(key, { name, role, user_id });
        return;
      }
      const prev = byKey.get(key);
      byKey.set(key, {
        ...prev,
        role: prev.role || role,
        user_id: prev.user_id ?? user_id
      });
    });
    return Array.from(byKey.values());
  }, []);

  const reloadDoctors = useCallback(async () => {
    try {
      const res = await authFetch("/api/doctors");
      if (!res.ok) return;
      const list = await res.json().catch(() => null);
      if (Array.isArray(list)) setDoctors(normalizeDoctors(list));
    } catch (_) {
      // ignore transient errors
    }
  }, [authFetch, normalizeDoctors]);

  const fetchReferenceItems = useCallback(async (type) => {
    const tryFetch = async (url) => {
      try {
        const res = await authFetch(url);
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        if (data?.ok && Array.isArray(data.items)) return data.items;
        return null;
      } catch (_) {
        return null;
      }
    };

    // Main read endpoint for all authenticated users.
    const publicItems = await tryFetch(`/api/references?type=${type}`);
    if (publicItems) return publicItems;

    // Fallback for admin sessions if public endpoint is temporarily unavailable.
    const adminItems = await tryFetch(`/api/admin/references?type=${type}`);
    return adminItems || [];
  }, [authFetch]);

  const fetchJsonArray = useCallback(async (request) => {
    const res = await request;
    if (!res?.ok) return [];
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? data : [];
  }, []);

  useEffect(()=>{ if(cid!==null) localStorage.setItem("dash_cid", cid); },[cid]);
  useEffect(()=>{ localStorage.setItem("dash_si", String(si)); },[si]);
  useEffect(()=>{ setNri(0); },[cid, si]);
  useEffect(()=>{ if(sec) localStorage.setItem("dash_sec", sec); },[sec]);
  useEffect(()=>{ try { localStorage.removeItem("dash_doctors"); } catch (_) {} },[]);
  useEffect(() => {
    if (sec === "admin") return;
    if (visibleSections.some(section => section.id === sec)) return;
    if (visibleSections[0]?.id) setSec(visibleSections[0].id);
  }, [sec, visibleSections]);

  useEffect(() => {
    let cancelled = false;

    const applyClients = (data) => {
      if (!Array.isArray(data) || data.length === 0) {
        setCls([]);
        return;
      }
      setCls(data);
      const saved = localStorage.getItem("dash_cid");
      const exists = saved && data.find(c => c.id === saved);
      setCid(exists ? saved : data[0].id);
    };

    const loadOptionalData = async () => {
      const deficitPresetsPromise = canReadSection("overview")
        ? fetchReferenceItems("deficit_preset")
        : Promise.resolve([]);
      const labOrderPromise = canReadSection("lab")
        ? fetchReferenceItems("lab_order_item")
        : Promise.resolve([]);

      const [doctorsList, deficitItems, labItems] = await Promise.all([
        withTimeout(fetchJsonArray(authFetch("/api/doctors")).catch(() => []), [], BOOTSTRAP_REQUEST_TIMEOUT_MS),
        withTimeout(deficitPresetsPromise, [], BOOTSTRAP_REQUEST_TIMEOUT_MS),
        withTimeout(labOrderPromise, [], BOOTSTRAP_REQUEST_TIMEOUT_MS),
      ]);

      if (cancelled) return;
      setDoctors(normalizeDoctors(doctorsList));
      setDeficitPresets(deficitItems || []);
      setLabOrderTemplates(labItems || []);
    };

    const loadInitialData = async () => {
      try {
        const clients = await withTimeout(
          fetchJsonArray(authFetch("/api/clients")).catch(() => []),
          [],
          BOOTSTRAP_REQUEST_TIMEOUT_MS
        );
        if (cancelled) return;
        applyClients(clients);
      } finally {
        if (!cancelled) setLoaded(true);
      }

      try {
        await loadOptionalData();
      } catch (_) {
        if (!cancelled) {
          setDoctors([]);
          setDeficitPresets([]);
          setLabOrderTemplates([]);
        }
      }
    };

    loadInitialData().catch(() => {
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [authFetch, fetchReferenceItems, fetchJsonArray, normalizeDoctors, canReadSection]);

  useEffect(() => {
    if (!loaded) return;
    const deficitPresetsPromise = canReadSection("overview")
      ? fetchReferenceItems("deficit_preset")
      : Promise.resolve([]);
    const labOrderPromise = canReadSection("lab")
      ? fetchReferenceItems("lab_order_item")
      : Promise.resolve([]);

    Promise.all([
      deficitPresetsPromise,
      labOrderPromise
    ]).then(([deficitItems, labItems]) => {
      setDeficitPresets(Array.isArray(deficitItems) ? deficitItems : []);
      setLabOrderTemplates(Array.isArray(labItems) ? labItems : []);
    }).catch(() => {});
  }, [sec, loaded, fetchReferenceItems, canReadSection]);

  useEffect(() => {
    const reloadLabOrderTemplates = () => {
      if (!canReadSection("lab")) {
        setLabOrderTemplates([]);
        return;
      }
      fetchReferenceItems("lab_order_item")
        .then(items => setLabOrderTemplates(Array.isArray(items) ? items : []))
        .catch(() => {});
    };
    window.addEventListener("lab-order-templates-changed", reloadLabOrderTemplates);
    return () => window.removeEventListener("lab-order-templates-changed", reloadLabOrderTemplates);
  }, [fetchReferenceItems, canReadSection]);

  useEffect(() => {
    const handleDoctorsChanged = () => {
      reloadDoctors().catch(() => {});
    };
    window.addEventListener("doctors-changed", handleDoctorsChanged);
    return () => window.removeEventListener("doctors-changed", handleDoctorsChanged);
  }, [reloadDoctors]);

  useEffect(() => {
    if (!loaded) return;
    reloadJournalBadges();
  }, [loaded, reloadJournalBadges, cid]);

  // Track which client IDs were modified (for granular saves)
  const dirtyClientsRef = useRef(new Set());
  const pendingClientOpsRef = useRef(new Map());
  const clientSaveChainRef = useRef(new Map());
  const newClientIdsRef = useRef(new Set());

  const queueClientPatchOps = useCallback((clientId, prevClient, nextClient) => {
    if (!clientId || !prevClient || !nextClient) return;
    const ops = buildPatchOps(prevClient, nextClient);
    if (!ops.length) return;
    const prevOps = pendingClientOpsRef.current.get(clientId) || [];
    pendingClientOpsRef.current.set(clientId, prevOps.concat(ops));
    dirtyClientsRef.current.add(clientId);
  }, []);

  // Analytics ops have path ["stages", N, "analyticsCategories", ...]
  const isAnalyticsOp = (op) => {
    const p = op?.path;
    return Array.isArray(p) && p[0] === "stages" && p[2] === "analyticsCategories";
  };

  const saveAnalytics = useCallback(async (clientId, clientSnapshot) => {
    const analytics = clientSnapshot?.stages?.[0]?.analyticsCategories;
    if (!Array.isArray(analytics)) return;
    await authFetch(`/api/clients/${clientId}/analytics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: analytics })
    });
  }, [authFetch]);

  const enqueueClientSave = useCallback((clientId, clientSnapshot) => {
    if (!clientId) return;
    const prevChain = clientSaveChainRef.current.get(clientId) || Promise.resolve();
    const nextChain = prevChain.then(async () => {
      const isNewClient = newClientIdsRef.current.has(clientId);
      if (isNewClient) {
        if (!clientSnapshot) return;
        try {
          // Analytics are managed by their own endpoint — strip them from PUT body
          const strippedStages = (clientSnapshot.stages || []).map(({ analyticsCategories: _ac, ...s }) => s);
          const res = await authFetch(`/api/clients/${clientId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...clientSnapshot, stages: strippedStages })
          });
          if (!res.ok) throw new Error(`Create save failed (${res.status})`);
          newClientIdsRef.current.delete(clientId);
          pendingClientOpsRef.current.delete(clientId);
          // Save analytics separately after client is created
          await saveAnalytics(clientId, clientSnapshot);
        } catch (e) {
          console.error("Create save error:", e);
          newClientIdsRef.current.add(clientId);
          dirtyClientsRef.current.add(clientId);
        }
        return;
      }

      const queuedOps = pendingClientOpsRef.current.get(clientId) || [];
      if (!queuedOps.length) return;
      pendingClientOpsRef.current.delete(clientId);
      const ops = collapsePatchOps(queuedOps);

      // Split analytics ops from regular ops
      const analyticsOps = ops.filter(isAnalyticsOp);
      const regularOps   = ops.filter(op => !isAnalyticsOp(op));

      try {
        // Analytics: send full current state to the concurrent-safe endpoint
        if (analyticsOps.length > 0) {
          await saveAnalytics(clientId, clientSnapshot);
        }
        // Everything else: regular granular PATCH
        if (regularOps.length > 0) {
          const res = await authFetch(`/api/clients/${clientId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ops: regularOps })
          });
          if (!res.ok) {
            if (res.status === 400 || res.status === 403) {
              // Access/schema violations should not be retried forever.
              const errData = await res.json().catch(() => null);
              console.warn("Patch rejected by server:", errData || { status: res.status });
              const freshRes = await authFetch(`/api/clients/${clientId}`);
              if (freshRes.ok) {
                const fresh = await freshRes.json().catch(() => null);
                if (fresh?.id) {
                  setCls(prev => prev.map(c => c.id === fresh.id ? fresh : c));
                }
              }
              return;
            }
            throw new Error(`Patch save failed (${res.status})`);
          }
        }
      } catch (e) {
        console.error("Patch save error:", e);
        const existing = pendingClientOpsRef.current.get(clientId) || [];
        pendingClientOpsRef.current.set(clientId, ops.concat(existing));
        dirtyClientsRef.current.add(clientId);
      }
    });
    clientSaveChainRef.current.set(clientId, nextChain);
  }, [authFetch, saveAnalytics]);

  const saveTimer = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const dirty = [...dirtyClientsRef.current];
      dirtyClientsRef.current.clear();
      if (!dirty.length) return;
      const clsMap = new Map(cls.map(c => [c.id, c]));
      dirty.forEach(id => {
        const client = clsMap.get(id);
        if (!client && !newClientIdsRef.current.has(id)) return; // deleted — handled by removeClient directly
        enqueueClientSave(id, client);
      });
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [cls, loaded, enqueueClientSave]);

  // ─── Реальное время: SSE-подписка на обновления от других пользователей ───────
  // Когда другой сотрудник сохраняет изменения — сервер присылает событие "client-updated".
  // Если у нас нет несохранённых правок по этому клиенту — тихо обновляем данные на экране.
  useEffect(() => {
    if (!loaded) return;
    const token = localStorage.getItem("dash_token");
    if (!token) return;

    let es = null;
    let cancelled = false;

    const connect = async () => {
      try {
        const r = await fetch("/api/auth/sse-ticket", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || !r.ok) return;
        const { ticket } = await r.json();
        if (cancelled) return;
        es = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
        es.addEventListener("client-updated", async (e) => {
          try {
            const { clientId } = JSON.parse(e.data);
            // Не трогаем если у пользователя есть несохранённые правки по этому клиенту
            if (dirtyClientsRef.current.has(clientId)) return;
            if (pendingClientOpsRef.current.has(clientId)) return;
            const res = await authFetch(`/api/clients/${clientId}`);
            if (!res.ok) return;
            const fresh = await res.json().catch(() => null);
            if (!fresh || !fresh.id) return;
            setCls(prev => prev.map(c => c.id === fresh.id ? fresh : c));
          } catch (_) {}
        });
        es.onerror = () => {};
      } catch (_) {}
    };

    connect();

    return () => {
      cancelled = true;
      es?.close();
    };
  }, [loaded, authFetch]);

  const doctorsSaveTimer = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (user?.role !== "admin") return;
    clearTimeout(doctorsSaveTimer.current);
    doctorsSaveTimer.current = setTimeout(() => {
      authFetch("/api/doctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doctors)
      }).catch(e => console.error("Doctors save error:", e));
    }, 600);
    return () => clearTimeout(doctorsSaveTimer.current);
  }, [doctors, loaded, authFetch, user?.role]);

  const cl = useMemo(() => cls.find(c=>c.id===cid), [cls, cid]);
  const st = cl?.stages?.[si];
  const stageHeight = st?.height ?? cl?.height ?? "";
  const stageWeightCurrent = st?.weightCurrent ?? cl?.weightCurrent ?? "";
  const autoBmiValue = calculateBmiValue(stageHeight, stageWeightCurrent);
  const stageProfile = useMemo(() => ({
    email: st?.email ?? cl?.email ?? "",
    phone: st?.phone ?? cl?.phone ?? "",
    city: st?.city ?? cl?.city ?? "",
    height: stageHeight,
    weightCurrent: stageWeightCurrent,
    weightGoal: st?.weightGoal ?? cl?.weightGoal ?? "",
    bmi: autoBmiValue == null ? "" : String(autoBmiValue),
    waist: st?.waist ?? cl?.waist ?? ""
  }), [st, cl, stageHeight, stageWeightCurrent, autoBmiValue]);

  const uC = useCallback(fn=>{
    if (!canWriteActiveSection) return;
    if (!cid) return;
    setCls(p=>p.map(c=>{
      if (c.id !== cid) return c;
      const prevClient = structuredClone(c);
      const draftClient = structuredClone(c);
      const nextClient = fn(draftClient);
      const resolvedClient = nextClient && typeof nextClient === "object" ? nextClient : draftClient;
      queueClientPatchOps(cid, prevClient, resolvedClient);
      return resolvedClient;
    }));
  },[cid, queueClientPatchOps, canWriteActiveSection]);
  const uS = useCallback(fn=>{uC(c=>{fn(c.stages[si]);return c})},[uC,si]);

  useEffect(()=>{
    if(!st) return;
    const storedBmi = st?.bmi;
    if (autoBmiValue == null) {
      if (storedBmi === "" || storedBmi == null) return;
      uS(s=>{s.bmi = ""});
      return;
    }
    if (Number.isFinite(+storedBmi) && Math.abs(+storedBmi - autoBmiValue) < 0.05) return;
    uS(s=>{s.bmi = autoBmiValue});
  }, [st, autoBmiValue, uS]);

  const updateClientName = useCallback((value) => {
    if (!canWriteSection("overview")) return;
    const nextName = String(value || "").trim();
    if (!nextName) return;
    uC(c => {
      const identity = buildClientIdentity(nextName, c.avatar);
      c.name = nextName;
      c.shortName = identity.shortName || nextName;
      c.avatar = identity.avatar || c.avatar;
      return c;
    });
  }, [uC, canWriteSection]);

  const renameClientById = useCallback((clientId, value) => {
    if (!isAdmin) return;
    const targetId = String(clientId || "").trim();
    if (!targetId) return;
    const nextName = String(value || "").trim();
    if (!nextName) return;
    setCls(prev => prev.map(c => {
      if (String(c.id) !== targetId) return c;
      const prevClient = structuredClone(c);
      const nextClient = structuredClone(c);
      const identity = buildClientIdentity(nextName, nextClient.avatar);
      nextClient.name = nextName;
      nextClient.shortName = identity.shortName || nextName;
      nextClient.avatar = identity.avatar || nextClient.avatar;
      queueClientPatchOps(targetId, prevClient, nextClient);
      return nextClient;
    }));
  }, [isAdmin, queueClientPatchOps]);

  const removeStage = useCallback((stageIndex) => {
    if (!canWriteSection("overview")) return;
    const stages = cl?.stages || [];
    const target = stages[stageIndex];
    if (!target) return;
    if (stages.length <= 1) { alert("Нельзя удалить единственный этап"); return; }
    if (!confirm(`Удалить этап «${target.title}»?`)) return;
    uC(c => {
      c.stages.splice(stageIndex, 1);
      c.stages.forEach((s, idx) => { s.id = idx + 1; });
      if (!c.stages.some(s => s.status === "active")) {
        const idx = Math.min(stageIndex, c.stages.length - 1);
        c.stages.forEach((s, i) => { s.status = i === idx ? "active" : "completed"; });
      }
      return c;
    });
    setSi(prev => {
      const nextLen = stages.length - 1;
      if (stageIndex < prev) return prev - 1;
      if (stageIndex === prev) return Math.min(prev, nextLen - 1);
      return prev;
    });
    setPri(0);
  }, [cl?.stages, uC, canWriteSection]);

  const removeClient = useCallback(() => {
    if (!canDeleteClient) return;
    if (!cl) return;
    if (!confirm(`Удалить клиента «${cl.name}»? Это действие нельзя отменить.`)) return;
    const clientId = cl.id;
    const nextClients = cls.filter(c => c.id !== clientId);
    const removedIndex = cls.findIndex(c => c.id === clientId);
    const nextIndex = Math.max(0, Math.min(removedIndex, nextClients.length - 1));
    const nextClientId = nextClients[nextIndex]?.id ?? null;
    // Remove from dirty set (no need to PUT a deleted client)
    dirtyClientsRef.current.delete(clientId);
    pendingClientOpsRef.current.delete(clientId);
    newClientIdsRef.current.delete(clientId);
    setCls(nextClients);
    setCid(nextClientId);
    if (nextClientId === null) localStorage.removeItem("dash_cid");
    setSi(0);
    setSec("overview");
    setPri(0);
    setPk(false);
    // Direct DELETE — don't rely on autosave
    authFetch(`/api/clients/${clientId}`, { method: "DELETE" })
      .catch(e => console.error("Delete error:", e));
  }, [cl, cls, authFetch, canDeleteClient]);

  const createClient = useCallback(({name="",dob="",email="",phone="",city=""}={}) => {
    if (!canCreateClient) return;
    const id = "c-"+Date.now();
    const nm = String(name || "").trim() || "Новый клиент";
    const av = nm.split(" ").slice(0,2).map(w=>(w[0]||"").toUpperCase()).join("") || "Н";
    dirtyClientsRef.current.add(id);
    newClientIdsRef.current.add(id);
    setCls(p=>[...p,{
      id, name:nm, shortName:nm.split(" ").slice(0,2).join(" "),
      dob:String(dob||""), age:0, sex:"", avatar:av,
      color:`hsl(${Math.random()*360},55%,55%)`,
      stages:[{
        id:1,title:"Этап 1",subtitle:"",doctor:"",doctorRole:"",dateStart:"",dateEnd:"",status:"active",
        email:String(email||""),phone:String(phone||""),city:String(city||""),
        height:0,weightCurrent:0,weightGoal:0,bmi:0,waist:0,tasks:[],syndromes:[],diagnoses:[],deficits:[],
        nutrition:{generalRules:[],categories:[],instructions:[]},
        nutritionRevisions:[{id:1,date:"",label:"Стартовый",comment:"",generalRules:[],categories:[],instructions:[]}],
        protocolRevisions:[{id:1,date:"",label:"Стартовый",groups:[]}],
        injections:null,analyticsCategories:[],journal:[],questionnaire:{}
      }]
    }]);
    setCid(id);
    setSi(0);
    setSec("overview");
    setPri(0);
    setMd(null);
  }, [canCreateClient]);

  const importStageExcel = useCallback(async (file, kind = "auto") => {
    if (!canImportData) {
      alert("У вас нет прав на импорт данных");
      return;
    }
    const requiresSection = kind === "analytics" ? "analytics" : kind === "questionnaire" ? "questionnaire" : sec;
    if (requiresSection && !canWriteSection(requiresSection)) {
      alert("У вас нет прав на редактирование этого раздела");
      return;
    }
    if (!file) return;
    const sendFile = async (url) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authFetch(url, { method: "POST", body: fd });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      return { ok: res.ok, data };
    };
    const applyQuestionnaire = (questionnaireAttempt) => {
      uC(c=>{
        const stg=c.stages[si];
        const qq=questionnaireAttempt.data.questionnaire;
        stg.questionnaire=qq;
        const sex=qq.gender==="male"?"Мужской":qq.gender==="female"?"Женский":"";
        if(sex)c.sex=sex;
        const meta=qq.meta||{};
        if(meta.fullName)c.name=meta.fullName;
        if(meta.fullName&&!c.shortName)c.shortName=meta.fullName.split(" ").slice(0,2).join(" ");
        if(meta.email)stg.email=meta.email;
        if(meta.phone)stg.phone=meta.phone;
        if(meta.city)stg.city=meta.city;
        if(meta.height!=null&&meta.height!=="")stg.height=isNaN(+meta.height)?meta.height:+meta.height;
        if(meta.weight!=null&&meta.weight!=="")stg.weightCurrent=isNaN(+meta.weight)?meta.weight:+meta.weight;
        if(meta.weightGoal!=null&&meta.weightGoal!=="")stg.weightGoal=isNaN(+meta.weightGoal)?meta.weightGoal:+meta.weightGoal;
        if(meta.waist!=null&&meta.waist!=="")stg.waist=isNaN(+meta.waist)?meta.waist:+meta.waist;
        const goals=(qq.goals||[]).filter(Boolean);
        if(goals.length){
          stg.tasks=Array.isArray(stg.tasks)?stg.tasks:[];
          const seen=new Set(stg.tasks.map(x=>String(x).trim().toLowerCase()));
          goals.forEach(goal=>{
            const key=String(goal).trim().toLowerCase();
            if(key&&!seen.has(key)){seen.add(key);stg.tasks.push(goal)}
          })
        }
        return c
      });
      setSec("questionnaire");
      alert(`Импортирована анкета: ${questionnaireAttempt.data.sectionsCount} разделов, ${questionnaireAttempt.data.answersCount} ответов`);
    };
    if (kind === "analytics") {
      const analyticsAttempt = await sendFile("/api/import-analytics");
      if (analyticsAttempt.ok && analyticsAttempt.data?.ok && analyticsAttempt.data?.analyticsCategories) {
        uS(s=>{ s.analyticsCategories = analyticsAttempt.data.analyticsCategories; });
        alert(`Импортировано анализов: ${analyticsAttempt.data.categoriesCount} категорий, ${analyticsAttempt.data.markersCount} маркеров, ${analyticsAttempt.data.dates.length} дат`);
        return;
      }
      alert("Ошибка импорта: " + (analyticsAttempt.data?.error || "Файл не удалось распознать как карту анализов"));
      return;
    }
    if (kind === "questionnaire") {
      const questionnaireAttempt = await sendFile("/api/import-questionnaire");
      if (questionnaireAttempt.ok && questionnaireAttempt.data?.ok && questionnaireAttempt.data?.questionnaire) {
        applyQuestionnaire(questionnaireAttempt);
        return;
      }
      alert("Ошибка импорта: " + (questionnaireAttempt.data?.error || "Файл не удалось распознать как анкету"));
      return;
    }
    const analyticsAttempt = await sendFile("/api/import-analytics");
    if (analyticsAttempt.ok && analyticsAttempt.data?.ok && analyticsAttempt.data?.analyticsCategories) {
      uS(s=>{ s.analyticsCategories = analyticsAttempt.data.analyticsCategories; });
      alert(`Импортировано анализов: ${analyticsAttempt.data.categoriesCount} категорий, ${analyticsAttempt.data.markersCount} маркеров, ${analyticsAttempt.data.dates.length} дат`);
      return;
    }
    const questionnaireAttempt = await sendFile("/api/import-questionnaire");
    if (questionnaireAttempt.ok && questionnaireAttempt.data?.ok && questionnaireAttempt.data?.questionnaire) {
      applyQuestionnaire(questionnaireAttempt);
      return;
    }
    alert("Ошибка импорта: " + (questionnaireAttempt.data?.error || analyticsAttempt.data?.error || "Файл не удалось распознать как анализы или анкету"));
  }, [canImportData, canWriteSection, sec, si, uC, uS, setSec, authFetch]);

  const contextValue = useMemo(() => ({
    cls, setCls, cid, setCid, si, setSi, sec, setSec,
    so, setSo, pk, setPk, md, setMd, pri, setPri, nri, setNri,
    doctors, setDoctors, deficitPresets, labOrderTemplates, loaded,
    visibleSections, canReadSection, canWriteSection, canWriteActiveSection,
    canCreateClient, canDeleteClient, canImportData, isAdmin,
    cl, st, stageProfile, autoBmiValue,
    uC, uS, updateClientName, renameClientById, removeStage, removeClient, createClient, importStageExcel,
    journalBadges, reloadJournalBadges,
  }), [
    cls, cid, si, sec, so, pk, md, pri, nri,
    doctors, deficitPresets, labOrderTemplates, loaded,
    visibleSections, canReadSection, canWriteSection, canWriteActiveSection,
    canCreateClient, canDeleteClient, canImportData, isAdmin,
    cl, st, stageProfile, autoBmiValue,
    uC, uS, updateClientName, renameClientById, removeStage, removeClient, createClient, importStageExcel,
    journalBadges, reloadJournalBadges,
  ]);

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
}

export const useDashboard = () => useContext(DashboardContext);
