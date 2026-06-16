import { useState, useEffect, useCallback } from "react";
import { useDashboard, isClientRole } from "../context/DashboardContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { toPolylinePoints, deltaVsFirstWeek, METRIC_LABELS } from "../utils/waveCurve";

const METRICS = ["energy", "sleep", "mood", "focus", "calm"];
const CONTEXT_CHIPS = ["плохо спал", "перелёт", "тренировка", "стресс"];
const DISCLAIMER = "Это как ты себя чувствуешь, не диагноз. Срочное — в мессенджер или звонок врачу.";
const OBJ_LINES = [
  { key: "recovery", label: "Восстановление", min: 0, max: 100 },
  { key: "sleep_perf", label: "Сон %", min: 0, max: 100 },
  { key: "rhr_bpm", label: "Пульс покоя", min: 40, max: 90 },
  { key: "hrv_ms", label: "ВСР", min: 0, max: 150 },
  { key: "strain", label: "Нагрузка", min: 0, max: 21 },
];
const MOODS = [{ e: "😣", v: 1 }, { e: "😕", v: 2 }, { e: "😐", v: 3 }, { e: "🙂", v: 4 }, { e: "😀", v: 5 }];

export default function WaveSection() {
  const { cid } = useDashboard();
  const { user, authFetch } = useAuth();
  const { $ } = useTheme();
  const isClient = isClientRole(user);

  const [series, setSeries] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [today, setToday] = useState(null);
  const [draft, setDraft] = useState({ energy: 3, sleep: 3, mood: 3, focus: 3, calm: 3 });
  const [tags, setTags] = useState([]);
  const [saving, setSaving] = useState(false);
  const [whoopConnected, setWhoopConnected] = useState(false);
  const [metric, setMetric] = useState("recovery");

  const load = useCallback(async () => {
    if (!cid) return;
    const [sRes, tRes] = await Promise.all([
      authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/series`).catch(() => null),
      authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/today`).catch(() => null),
    ]);
    if (sRes && sRes.ok) { const d = await sRes.json(); setSeries(d.series || []); setReactions(d.reactions || []); }
    if (tRes && tRes.ok) { const d = await tRes.json(); setToday(d);
      if (d.checkin?.scores) setDraft((p) => ({ ...p, ...d.checkin.scores }));
      if (d.checkin?.contextTags) setTags(d.checkin.contextTags); }
    if (isClient) {
      const wRes = await authFetch(`/api/wave/whoop/status?cid=${encodeURIComponent(cid)}`).catch(() => null);
      if (wRes && wRes.ok) setWhoopConnected(!!(await wRes.json()).connected);
    }
  }, [cid, authFetch, isClient]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!cid) return;
    setSaving(true);
    const res = await authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/checkin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: draft, contextTags: tags }) }).catch(() => null);
    setSaving(false);
    if (res && res.ok) await load();
  };
  const tapMood = async (v) => {
    if (!cid) return;
    setSaving(true);
    const res = await authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/checkin`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scores: { mood: v } }) }).catch(() => null);
    setSaving(false);
    if (res && res.ok) await load();
  };
  const react = async (pinnedDate, kind, text) => {
    if (!cid) return;
    const res = await authFetch(`/api/clients/${encodeURIComponent(cid)}/wave/reaction`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinnedDate, kind, text: text || "" }) }).catch(() => null);
    if (res && res.ok) await load();
  };
  const connectWhoop = async () => {
    if (!cid) return;
    const r = await authFetch(`/api/wave/whoop/connect?cid=${encodeURIComponent(cid)}`).catch(() => null);
    if (r && r.ok) { const d = await r.json().catch(() => null); if (d && d.url) window.location.href = d.url; }
  };
  const disconnectWhoop = async () => {
    if (!cid || !window.confirm("Отключить WHOOP?")) return;
    const purge = window.confirm("Также удалить уже собранные данные WHOOP? OK — удалить, Отмена — оставить.");
    await authFetch(`/api/wave/whoop/disconnect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cid, purge }) }).catch(() => null);
    await load();
  };

  const W = 640, H = 180;
  const hasObjective = series.some((d) => d.objective && Object.keys(d.objective).length);
  const activeLine = hasObjective
    ? (OBJ_LINES.find((l) => l.key === metric) || OBJ_LINES[0])
    : { key: "momentum", label: "Самочувствие", min: 1, max: 5 };
  const curveSeries = (hasObjective
    ? series.map((d) => ({ date: d.date, value: d.objective?.[activeLine.key], mood: d.scores?.mood }))
    : series.map((d) => ({ date: d.date, value: d.momentum, mood: d.scores?.mood }))
  ).filter((d) => Number.isFinite(Number(d.value)));
  const points = toPolylinePoints(curveSeries, { width: W, height: H, pad: 16, minScore: activeLine.min, maxScore: activeLine.max });
  const normY = (v) => 16 + (H - 32) * (1 - Math.max(0, Math.min(1, (Number(v) - activeLine.min) / ((activeLine.max - activeLine.min) || 1))));
  const deltas = deltaVsFirstWeek(series);
  const card = { background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 14, padding: 16, marginBottom: 14 };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: $.tx, marginBottom: 4 }}>🌊 Моя волна</div>
      <div style={{ fontSize: 12, color: $.txM, marginBottom: 14 }}>{DISCLAIMER}</div>

      {isClient && !whoopConnected && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: $.tx, marginBottom: 6 }}>Подключи WHOOP — волна заполнится сама</div>
          <div style={{ fontSize: 12, color: $.txM, lineHeight: 1.5, marginBottom: 12 }}>
            Мы будем получать из твоего WHOOP: сон, пульс покоя, ВСР, восстановление, нагрузку и вес (если он есть).
            Эти данные видит только твой врач. Отключить WHOOP и удалить собранные данные можно в любой момент — кнопкой ниже после подключения.
          </div>
          <button onClick={connectWhoop} disabled={!cid}
            style={{ padding: "10px 16px", background: $.ac, color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}>Подключить WHOOP</button>
        </div>
      )}
      {isClient && whoopConnected && (
        <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: $.ac }}>✓ WHOOP подключён</span>
          <button onClick={disconnectWhoop}
            style={{ padding: "8px 12px", background: "transparent", color: $.txM, border: `1px solid ${$.brd}`, borderRadius: 8, cursor: "pointer" }}>Отключить</button>
        </div>
      )}

      {deltas.length > 0 && series.length > 1 && !hasObjective && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {deltas.map((d) => (
            <div key={d.key} style={{ background: $.bgI, borderRadius: 10, padding: "8px 12px", minWidth: 86 }}>
              <div style={{ fontSize: 12, color: $.txS }}>{d.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: d.delta >= 0 ? $.ac : $.dn }}>
                {d.delta >= 0 ? "↑ +" : "↓ "}{Math.abs(d.delta).toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: $.tx, marginBottom: 10 }}>
          {activeLine.label}{hasObjective ? " (WHOOP)" : ""}
        </div>
        {hasObjective && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {OBJ_LINES.map((l) => (
              <button key={l.key} onClick={() => setMetric(l.key)}
                style={{ fontSize: 12, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                  color: metric === l.key ? "#fff" : $.txS, background: metric === l.key ? $.ac : "transparent",
                  border: `1px solid ${metric === l.key ? $.ac : $.brd}` }}>{l.label}</button>
            ))}
          </div>
        )}
        {series.length === 0 ? (
          <div style={{ fontSize: 14, color: $.txM, textAlign: "center", padding: "24px 0" }}>
            Пока нет отметок. {isClient ? "Сделай первый чек-ин ниже — и твоя кривая начнёт расти." : "Клиент ещё не отмечался."}
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Кривая самочувствия">
            <polyline points={points} fill="none" stroke={$.ac} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {curveSeries.map((d, i) => {
              const n = curveSeries.length;
              const x = n === 1 ? 16 : 16 + ((W - 32) * i) / (n - 1);
              const pin = reactions.find((r) => r.pinnedDate === d.date);
              return (<g key={d.date}>
                <circle cx={x} cy={normY(d.value)} r={pin ? 6 : 3} fill={pin ? $.ac : $.acD} stroke={$.ac} strokeWidth="1.5">
                  {pin && <title>{pin.text || "Отметка врача"}</title>}
                </circle>
                {Number.isFinite(Number(d.mood)) && (
                  <circle cx={x} cy={normY(d.value)} r="2.5" fill={d.mood >= 4 ? $.ac : d.mood <= 2 ? $.dn : $.txM} />
                )}
              </g>);
            })}
          </svg>
        )}
      </div>

      {reactions.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: $.tx, marginBottom: 8 }}>Заметки врача</div>
          {reactions.map((r) => (
            <div key={r.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderTop: `1px solid ${$.brd}` }}>
              <span style={{ fontSize: 12, color: $.txM, minWidth: 88 }}>{r.pinnedDate}</span>
              <span style={{ fontSize: 13, color: $.tx }}>{r.kind === "ack" ? "👍 отметил вашу неделю" : r.text}</span>
            </div>
          ))}
        </div>
      )}

      {isClient && whoopConnected && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, color: $.tx, marginBottom: 10 }}>Как настроение сегодня?</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
            {MOODS.map((m) => (
              <button key={m.v} onClick={() => tapMood(m.v)} disabled={saving}
                style={{ flex: 1, fontSize: 28, padding: "10px 0", borderRadius: 12, cursor: "pointer",
                  border: `2px solid ${today?.checkin?.scores?.mood === m.v ? $.ac : $.brd}`,
                  background: today?.checkin?.scores?.mood === m.v ? $.acD : "transparent" }}>{m.e}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: $.txM, marginTop: 8 }}>Тело подтянулось из WHOOP автоматически.</div>
        </div>
      )}

      {isClient && !whoopConnected && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: $.tx }}>Как ты сегодня?</span>
            <span style={{ fontSize: 12, color: $.txM }}>⏱ 60 секунд{today?.checkin ? " · уже отмечено" : ""}</span>
          </div>
          {METRICS.map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ flex: "0 0 96px", fontSize: 13, color: $.txS }}>{METRIC_LABELS[key]}</span>
              <input type="range" min="1" max="5" step="1" value={draft[key]}
                onChange={(e) => setDraft((p) => ({ ...p, [key]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: $.ac, height: 28 }} aria-label={METRIC_LABELS[key]} />
              <span style={{ flex: "0 0 18px", fontSize: 14, fontWeight: 700, color: $.tx, textAlign: "right" }}>{draft[key]}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 12px" }}>
            {CONTEXT_CHIPS.map((c) => { const on = tags.includes(c);
              return (<button key={c} onClick={() => setTags((p) => (on ? p.filter((x) => x !== c) : [...p, c]))}
                style={{ fontSize: 12, color: on ? $.ac : $.txS, background: on ? $.acD : "transparent", border: `1px solid ${on ? $.ac : $.brd}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}>
                {on ? "✓ " : "+ "}{c}</button>); })}
          </div>
          <button onClick={submit} disabled={saving || !cid}
            style={{ width: "100%", padding: "12px", fontSize: 15, fontWeight: 700, color: "#fff", background: $.ac, border: "none", borderRadius: 10, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Сохраняю…" : today?.checkin ? "Обновить" : "Отметить"}</button>
        </div>
      )}

      {!isClient && (
        <DoctorReactionBar onReact={react} $={$} />
      )}
    </div>
  );
}

function DoctorReactionBar({ onReact, $ }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const card = { background: $.bgC, border: `1px solid ${$.brd}`, borderRadius: 14, padding: 16, marginBottom: 14 };
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: $.tx, marginBottom: 8 }}>Отметить волну клиента</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          style={{ padding: "8px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx }} />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Короткая заметка (необязательно)"
          style={{ flex: 1, minWidth: 160, padding: "8px", borderRadius: 8, border: `1px solid ${$.brd}`, background: $.bgI, color: $.tx }} />
        <button onClick={() => onReact(date, "ack", "")} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${$.ac}`, background: "transparent", color: $.ac, cursor: "pointer" }}>👍 Отметить неделю</button>
        <button onClick={() => { if (text.trim()) { onReact(date, "note", text.trim()); setText(""); } }}
          style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: $.ac, color: "#fff", cursor: "pointer" }}>Закрепить заметку</button>
      </div>
    </div>
  );
}
