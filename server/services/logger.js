const { sameJson } = require("./storage");
const { withTransaction } = require("./db");

const toMapById = (list = []) => {
  const map = new Map();
  list.forEach(item => {
    if (!item || item.id == null) return;
    map.set(String(item.id), item);
  });
  return map;
};

const pickActor = (req, nextClient, nextStage) => {
  const headerActor = req.headers["x-actor"] || req.headers["x-doctor"];
  if (headerActor && String(headerActor).trim()) return String(headerActor).trim();
  if (nextStage?.doctor && String(nextStage.doctor).trim()) return String(nextStage.doctor).trim();
  if (nextClient?.name && String(nextClient.name).trim()) return `${String(nextClient.name).trim()} (карточка)`;
  return "Не указан";
};

const buildActionLogs = (prevClients = [], nextClients = [], req) => {
  const logs = [];
  const now = new Date().toISOString();
  const prevMap = toMapById(prevClients);
  const nextMap = toMapById(nextClients);

  const pushLog = (entry) => logs.push({ ts: now, ...entry });

  nextMap.forEach((nextClient, clientId) => {
    const prevClient = prevMap.get(clientId);
    if (!prevClient) {
      pushLog({ action: "client_created", actor: pickActor(req, nextClient), clientId, clientName: nextClient?.name || "Без имени" });
      return;
    }

    if ((prevClient.name || "") !== (nextClient.name || "")) {
      pushLog({ action: "client_renamed", actor: pickActor(req, nextClient), clientId, clientName: nextClient?.name || "Без имени", details: { from: prevClient.name || "", to: nextClient.name || "" } });
    }

    const profileKeys = ["dob", "sex", "age"];
    if (profileKeys.some(k => !sameJson(prevClient[k], nextClient[k]))) {
      pushLog({ action: "client_profile_updated", actor: pickActor(req, nextClient), clientId, clientName: nextClient?.name || "Без имени" });
    }

    const prevStages = toMapById(prevClient.stages || []);
    const nextStages = toMapById(nextClient.stages || []);

    nextStages.forEach((nextStage, stageId) => {
      const prevStage = prevStages.get(stageId);
      if (!prevStage) {
        pushLog({ action: "stage_created", actor: pickActor(req, nextClient, nextStage), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: nextStage?.title || `Этап ${stageId}` });
        return;
      }

      if ((prevStage.title || "") !== (nextStage.title || "")) {
        pushLog({ action: "stage_renamed", actor: pickActor(req, nextClient, nextStage), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: nextStage?.title || `Этап ${stageId}` });
      }

      if ((prevStage.doctor || "") !== (nextStage.doctor || "") || (prevStage.doctorRole || "") !== (nextStage.doctorRole || "")) {
        pushLog({ action: "doctor_changed", actor: pickActor(req, nextClient, nextStage), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: nextStage?.title || `Этап ${stageId}`, details: { doctor: nextStage?.doctor || "", role: nextStage?.doctorRole || "" } });
      }

      if ((prevStage.status || "") !== (nextStage.status || "")) {
        pushLog({ action: "stage_status_changed", actor: pickActor(req, nextClient, nextStage), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: nextStage?.title || `Этап ${stageId}`, details: { from: prevStage.status || "", to: nextStage.status || "" } });
      }

      const stageProfileKeys = ["email", "phone", "city", "height", "weightCurrent", "weightGoal", "waist", "bmi"];
      if (stageProfileKeys.some(k => !sameJson(prevStage[k], nextStage[k]))) {
        pushLog({ action: "overview_profile_updated", actor: pickActor(req, nextClient, nextStage), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: nextStage?.title || `Этап ${stageId}` });
      }

      const stageAreas = [
        ["tasks", "tasks_updated"], ["syndromes", "syndromes_updated"], ["diagnoses", "diagnoses_updated"], ["deficits", "deficits_updated"],
        ["nutrition", "nutrition_updated"], ["protocolRevisions", "protocol_updated"],
        ["injections", "injections_updated"], ["analyticsCategories", "analytics_updated"],
        ["questionnaire", "questionnaire_updated"], ["journal", "journal_updated"]
      ];

      stageAreas.forEach(([key, action]) => {
        if (!sameJson(prevStage[key], nextStage[key])) {
          pushLog({ action, actor: pickActor(req, nextClient, nextStage), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: nextStage?.title || `Этап ${stageId}` });
        }
      });
    });

    prevStages.forEach((prevStage, stageId) => {
      if (nextStages.has(stageId)) return;
      pushLog({ action: "stage_deleted", actor: pickActor(req, nextClient), clientId, clientName: nextClient?.name || "Без имени", stageId, stageTitle: prevStage?.title || `Этап ${stageId}` });
    });
  });

  prevMap.forEach((prevClient, clientId) => {
    if (nextMap.has(clientId)) return;
    pushLog({ action: "client_deleted", actor: "Не указан", clientId, clientName: prevClient?.name || "Без имени" });
  });

  return logs;
};

const appendActivityLog = async (entries = []) => {
  if (!entries.length) return;
  try {
    await withTransaction(async (pgClient) => {
      for (const e of entries) {
        await pgClient.query(
          `INSERT INTO activity_log (ts, action, actor, client_id, client_name, stage_id, stage_title, details_json)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            e.ts || new Date().toISOString(),
            e.action || "",
            e.actor || "",
            e.clientId || null,
            e.clientName || "",
            e.stageId != null ? String(e.stageId) : null,
            e.stageTitle || "",
            e.details ? JSON.stringify(e.details) : null
          ]
        );
      }
    });
  } catch (err) {
    console.error("appendActivityLog error:", err.message);
  }
};

module.exports = { buildActionLogs, appendActivityLog };
