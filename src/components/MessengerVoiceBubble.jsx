import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useMessenger } from "../context/MessengerContext";
import { unpackWaveform } from "../utils/voiceWaveform";

const BARS = 32;
const SPEEDS = [1, 1.5, 2];

// NOTE: This messenger stores message `text` as server-side-encrypted-at-rest plaintext on the wire
// (no client-side E2E). The plan assumed an `decryptForChat(chatId, text)` helper exists, but the
// real context only exposes `getFileUrl(chatId, fileId, iv, mimeType)` for blob retrieval. Audio is
// fetched via that same helper — identical pattern to images/files (see MessengerContext.sendFile +
// FileMessageBubble).
export default function MessengerVoiceBubble({ chatId, message }) {
  const { $ } = useTheme();
  const { getFileUrl } = useMessenger();
  const audioRef = useRef(null);
  const [meta, setMeta] = useState(null); // { duration, waveform: Uint8Array, fileId }
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Parse the JSON payload from message.text. (Server already decrypted the at-rest layer.)
  useEffect(() => {
    let alive = true;
    try {
      const raw = String(message?.text || "");
      if (!raw) {
        if (alive) setError("пустое сообщение");
        return;
      }
      const parsed = JSON.parse(raw);
      if (!alive) return;
      const fileId = parsed.fileId || message?.file_id || null;
      setMeta({
        duration: Number(parsed.duration) || 0,
        waveform: unpackWaveform(parsed.waveform || ""),
        fileId,
      });
    } catch (e) {
      if (alive) setError(e.message);
    }
    return () => { alive = false; };
  }, [message?.id, message?.text, message?.file_id]);

  const ensureAudio = async () => {
    if (audioUrl || !meta?.fileId || loadingAudio) return;
    setLoadingAudio(true);
    try {
      const url = await getFileUrl(chatId, meta.fileId, null, "audio/webm");
      if (!url) throw new Error("не удалось загрузить аудио");
      setAudioUrl(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingAudio(false);
    }
  };

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const togglePlay = async () => {
    await ensureAudio();
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.playbackRate = SPEEDS[speedIdx]; try { await el.play(); setPlaying(true); } catch { setPlaying(false); } }
  };

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !meta?.duration) return;
    setProgress(el.currentTime / meta.duration);
  };

  const onEnded = () => { setPlaying(false); setProgress(0); };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el || !meta?.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * meta.duration;
    setProgress(pct);
  };

  const bars = useMemo(() => {
    if (!meta) return new Uint8Array(BARS);
    return meta.waveform.length === BARS ? meta.waveform : new Uint8Array(BARS);
  }, [meta]);

  if (error) return <div style={{ color: $.dn, fontSize: 12, padding: 4 }}>🎤 ошибка: {error}</div>;
  if (!meta)  return <div style={{ color: $.txM, fontSize: 12, padding: 4 }}>🎤 …</div>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", minWidth: 220 }}>
      <button onClick={togglePlay}
              style={{ width: 36, height: 36, borderRadius: "50%", background: $.ac, color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>
        {playing ? "❚❚" : "▶"}
      </button>
      <svg width="160" height="28" viewBox="0 0 160 28" preserveAspectRatio="none"
           onClick={seek} style={{ cursor: "pointer", flex: 1 }}>
        {Array.from(bars).map((v, i) => {
          const h = Math.max(2, (v / 255) * 24);
          const active = i / BARS < progress;
          return (
            <rect key={i}
                  x={i * (160 / BARS) + 1}
                  y={(28 - h) / 2}
                  width={(160 / BARS) - 2}
                  height={h}
                  rx={1.5}
                  fill={active ? $.ac : $.txM} />
          );
        })}
      </svg>
      <span style={{ color: $.txM, fontSize: 11, minWidth: 34, textAlign: "right" }}>
        {fmt(meta.duration * (1 - progress))}
      </span>
      <button onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
              style={{ fontSize: 11, color: $.txS, background: "none", border: `1px solid ${$.brd}`, borderRadius: 6, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit" }}>
        {SPEEDS[speedIdx]}x
      </button>
      <audio ref={audioRef} src={audioUrl || undefined} onTimeUpdate={onTimeUpdate} onEnded={onEnded} preload="none" />
      {loadingAudio && <span style={{ color: $.txM, fontSize: 10 }}>…</span>}
    </div>
  );
}

function fmt(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
