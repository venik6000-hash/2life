// Single source of truth: which client/stage field belongs to which permission section.
// Used both for read-filtering API responses (so a role only receives sections it may read)
// and for write-granularity checks (so a role can only modify sections it may write).

// Top-level client fields are all part of the "overview" section.
const CLIENT_OVERVIEW_FIELDS = [
  "name", "shortName", "dob", "age", "sex", "avatar", "color"
];
const CLIENT_OVERVIEW_FIELD_SET = new Set(CLIENT_OVERVIEW_FIELDS);

// Stage field → section. Any stage field not listed here is treated as "overview".
const STAGE_FIELD_SECTION_MAP = {
  id: "overview",
  title: "overview",
  subtitle: "overview",
  doctor: "overview",
  doctorRole: "overview",
  dateStart: "overview",
  dateEnd: "overview",
  status: "overview",
  email: "overview",
  phone: "overview",
  city: "overview",
  height: "overview",
  weightCurrent: "overview",
  weightGoal: "overview",
  bmi: "overview",
  waist: "overview",
  tasks: "overview",
  syndromes: "overview",
  diagnoses: "overview",
  deficits: "overview",
  autoDeficitSelection: "overview",
  questionnaire: "questionnaire",
  nutrition: "nutrition",
  nutritionRevisions: "nutrition",
  protocolRevisions: "protocol",
  injections: "injections",
  injectionSchedule: "injections",
  analyticsCategories: "analytics",
  labOrderSelected: "lab",
  labOrderGroupOrder: "lab",
  journal: "journal"
};

// Sections that actually carry client/stage data (excludes UI-only "menu"/"messenger").
const PROTECTED_SECTIONS = [
  "overview", "questionnaire", "nutrition", "protocol", "injections", "analytics", "lab", "journal"
];

// Reverse map: section → [stage fields]
const STAGE_FIELDS_BY_SECTION = PROTECTED_SECTIONS.reduce((acc, sectionId) => {
  acc[sectionId] = [];
  return acc;
}, {});
for (const [field, sectionId] of Object.entries(STAGE_FIELD_SECTION_MAP)) {
  if (STAGE_FIELDS_BY_SECTION[sectionId]) STAGE_FIELDS_BY_SECTION[sectionId].push(field);
}

// Read is granted by either an explicit read flag OR a write flag (write implies read).
const isSectionReadable = (permissions, sectionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  const section = permissions.sections?.[sectionId];
  return !!(section?.read || section?.write);
};

const isSectionWritable = (permissions, sectionId) => {
  if (!permissions) return false;
  if (permissions.isAdmin) return true;
  return !!permissions.sections?.[sectionId]?.write;
};

const hasMeaningfulValue = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true; // numbers, booleans
};

// Which sections does a single stage object touch (only counting populated fields)?
const sectionsForStageObject = (stage) => {
  const sections = new Set();
  if (!stage || typeof stage !== "object") return sections;
  for (const [field, value] of Object.entries(stage)) {
    const section = STAGE_FIELD_SECTION_MAP[field];
    if (!section) continue;
    if (hasMeaningfulValue(value)) sections.add(section);
  }
  return sections;
};

// Which sections does a whole client (its stages) touch?
const sectionsForClient = (client) => {
  const sections = new Set(["overview"]); // creating/owning a client is always an overview-level act
  const stages = Array.isArray(client?.stages) ? client.stages : [];
  for (const stage of stages) {
    for (const section of sectionsForStageObject(stage)) sections.add(section);
  }
  return sections;
};

// Strip from a client every section the role may not read.
// Returns null if the client must not be visible at all (no "overview" read).
const filterClientForPermissions = (client, permissions) => {
  if (!client) return null;
  if (permissions?.isAdmin) return client;
  // Per product decision: a client is only visible when "overview" is readable.
  if (!isSectionReadable(permissions, "overview")) return null;

  const next = { ...client };
  const stages = Array.isArray(client.stages) ? client.stages : [];
  next.stages = stages.map((stage) => {
    const safeStage = { ...stage };
    for (const sectionId of PROTECTED_SECTIONS) {
      if (sectionId === "overview") continue; // overview is readable (guarded above)
      if (isSectionReadable(permissions, sectionId)) continue;
      for (const field of STAGE_FIELDS_BY_SECTION[sectionId] || []) {
        delete safeStage[field];
      }
    }
    return safeStage;
  });
  return next;
};

module.exports = {
  CLIENT_OVERVIEW_FIELD_SET,
  STAGE_FIELD_SECTION_MAP,
  STAGE_FIELDS_BY_SECTION,
  PROTECTED_SECTIONS,
  isSectionReadable,
  sectionsForStageObject,
  sectionsForClient,
  filterClientForPermissions,
};
