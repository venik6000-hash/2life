import { useEffect, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { packWaveform, resampleWaveform } from "../utils/voiceWaveform";

const LOCK_PIXELS = 80;            // drag up to lock
const CANCEL_PIXELS_X = 120;       // swipe left to cancel
const WAVEFORM_BARS = 32;
const SAMPLE_INTERVAL_MS = 50;

export default function MessengerVoiceRecorder({ onSend, disabled, onActiveChange }) {
  const { $ } = useTheme();
  const [state, setState] = useState("idle"); // idle | recording | locked | preview | error
  const [elapsed, setElapsed] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [recordingExpanded, setRecordingExpanded] = useState(false);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const samplesRef = useRef([]);
  const startTimeRef = useRef(0);
  const tickerRef = useRef(null);
  const sampleTimerRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const previewRef = useRef(null); // { blob, mime, duration, waveform: Uint8Array, url }
  const pointerOriginRef = useRef(null); // { id, x, y }
  const pointerDownRef = useRef(false);
  const stateRef = useRef("idle");
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    if (state !== "recording" && state !== "locked") return undefined;
    const body = document.body;
    const root = document.documentElement;
    const prev = {
      bodyUserSelect: body.style.userSelect,
      bodyWebkitUserSelect: document.body.style.webkitUserSelect,
      bodyWebkitTouchCallout: body.style.webkitTouchCallout,
      rootUserSelect: root.style.userSelect,
      rootWebkitUserSelect: root.style.webkitUserSelect,
      rootWebkitTouchCallout: root.style.webkitTouchCallout,
      rootTouchAction: root.style.touchAction,
    };
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
    body.style.webkitTouchCallout = "none";
    root.style.userSelect = "none";
    root.style.webkitUserSelect = "none";
    root.style.webkitTouchCallout = "none";
    root.style.touchAction = "none";
    document.getSelection?.()?.removeAllRanges?.();
    document.addEventListener("selectstart", preventSelection);
    return () => {
      body.style.userSelect = prev.bodyUserSelect;
      document.body.style.webkitUserSelect = prev.bodyWebkitUserSelect;
      body.style.webkitTouchCallout = prev.bodyWebkitTouchCallout;
      root.style.userSelect = prev.rootUserSelect;
      root.style.webkitUserSelect = prev.rootWebkitUserSelect;
      root.style.webkitTouchCallout = prev.rootWebkitTouchCallout;
      root.style.touchAction = prev.rootTouchAction;
      document.removeEventListener("selectstart", preventSelection);
      document.getSelection?.()?.removeAllRanges?.();
    };
  }, [state]);

  function preventSelection(e) {
    e.preventDefault?.();
  }

  const detachPointer = () => {
    window.removeEventListener("pointermove", onWindowPointerMove);
    window.removeEventListener("pointerup", onWindowPointerUp);
    window.removeEventListener("pointercancel", onWindowPointerUp);
    pointerOriginRef.current = null;
  };

  const cleanup = () => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    if (sampleTimerRef.current) clearInterval(sampleTimerRef.current);
    if (analyserRef.current) try { analyserRef.current.disconnect(); } catch {}
    if (audioCtxRef.current) try { audioCtxRef.current.close(); } catch {}
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    tickerRef.current = null;
    sampleTimerRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current = null;
    streamRef.current = null;
    detachPointer();
  };

  useEffect(() => cleanup, []);

  useEffect(() => {
    if (state !== "recording") {
      setRecordingExpanded(false);
      return undefined;
    }
    const raf = requestAnimationFrame(() => setRecordingExpanded(true));
    return () => cancelAnimationFrame(raf);
  }, [state]);

  // Notify parent when recorder leaves idle (so the composer can hide other inputs).
  useEffect(() => {
    if (typeof onActiveChange === "function") onActiveChange(state !== "idle");
  }, [state, onActiveChange]);

  const startRecording = async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mime = pickMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      chunksRef.current = [];
      samplesRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recorder.start(250);

      // Waveform tap.
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.fftSize);

      sampleTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const d = Math.abs(buf[i] - 128);
          if (d > peak) peak = d;
        }
        samplesRef.current.push(peak * 2); // 0..255
      }, SAMPLE_INTERVAL_MS);

      startTimeRef.current = Date.now();
      setElapsed(0);
      tickerRef.current = setInterval(() => setElapsed((Date.now() - startTimeRef.current) / 1000), 100);

      // If pointer was released during the permission prompt or stream init,
      // go straight to "locked" — that state has explicit ✓ / 🗑 buttons.
      if (!pointerDownRef.current) {
        detachPointer();
        setDragY(0);
        setDragX(0);
        setState("locked");
      } else {
        setState("recording");
      }
    } catch (e) {
      setErrorMsg(humanizeMicError(e));
      setState("error");
      cleanup();
    }
  };

  const stopAndPreview = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      try { recorder.stop(); } catch { resolve(); }
    });
    const duration = Math.max(0, (Date.now() - startTimeRef.current) / 1000);
    const mime = recorder.mimeType || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    const wave = resampleWaveform(samplesRef.current, WAVEFORM_BARS);
    cleanup();
    if (blob.size === 0) { setState("idle"); return; }
    const url = URL.createObjectURL(blob);
    previewRef.current = { blob, mime, duration, waveform: wave, url };
    setState("preview");
  };

  const cancel = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try { recorderRef.current.stop(); } catch {}
    }
    cleanup();
    if (previewRef.current?.url) URL.revokeObjectURL(previewRef.current.url);
    previewRef.current = null;
    setState("idle");
    setElapsed(0);
    setDragY(0);
    setDragX(0);
  };

  const send = async () => {
    const p = previewRef.current;
    if (!p) return;
    setState("idle");
    await onSend({
      blob: p.blob,
      mime: p.mime,
      duration: p.duration,
      waveformB64: packWaveform(p.waveform),
    });
    URL.revokeObjectURL(p.url);
    previewRef.current = null;
  };

  function onWindowPointerMove(e) {
    if (stateRef.current !== "recording") return;
    const origin = pointerOriginRef.current;
    if (!origin || (e.pointerId != null && origin.id != null && e.pointerId !== origin.id)) return;
    e.preventDefault?.();
    document.getSelection?.()?.removeAllRanges?.();
    const dy = Math.max(0, origin.y - e.clientY);            // up = positive
    const dx = Math.max(0, origin.x - e.clientX);            // left = positive
    setDragY(Math.min(LOCK_PIXELS, dy));
    setDragX(Math.min(CANCEL_PIXELS_X, dx));
    if (dy >= LOCK_PIXELS) {
      detachPointer();
      setDragY(0);
      setDragX(0);
      setState("locked");
      return;
    }
    if (dx >= CANCEL_PIXELS_X) {
      detachPointer();
      cancel();
    }
  }

  function onWindowPointerUp(e) {
    pointerDownRef.current = false;
    if (stateRef.current !== "recording") {
      // Pointer released before recording actually started (e.g. during the
      // mic-permission prompt). startRecording() will see pointerDownRef=false
      // and switch to "locked" itself — just drop the window listeners here.
      detachPointer();
      return;
    }
    detachPointer();
    setDragY(0);
    setDragX(0);
    stopAndPreview();
  }

  const onPointerDown = async (e) => {
    if (disabled || state !== "idle") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointerDownRef.current = true;
    pointerOriginRef.current = { id: e.pointerId ?? null, x: e.clientX, y: e.clientY };
    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerUp);
    await startRecording();
  };

  if (state === "idle" || state === "error") {
    return (
      <button
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        title={errorMsg || "Голосовое (зажмите)"}
        disabled={disabled}
        style={iconBtn($, disabled)}
        aria-label="Записать голосовое"
      >
        🎤
      </button>
    );
  }

  if (state === "recording") {
    const cancelOpacity = Math.max(0, 1 - dragX / CANCEL_PIXELS_X);
    const liftProgress = dragY / LOCK_PIXELS;
    const micScale = recordingExpanded ? 2.72 - liftProgress * 0.16 : 1;
    return (
      <div style={{ ...recordingWrapStyle, flex: 1 }}>
        <div style={{ ...recordingPanelStyle($), paddingRight: 154 }}>
          <span style={{ color: $.dn, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
            ● {fmtDuration(elapsed)}
          </span>
          <div style={{
            flex: 1,
            minWidth: 0,
            color: $.txM,
            fontSize: 12,
            textAlign: "center",
            opacity: cancelOpacity,
            transform: `translateX(-${dragX}px)`,
            transition: dragX === 0 ? "transform 120ms ease, opacity 120ms ease" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            ← Влево — отмена
          </div>
        </div>

        <div
          aria-hidden="true"
          style={{
            ...lockHintStyle($),
            opacity: 0.72 + liftProgress * 0.28,
            transform: `translateY(${-8 - liftProgress * 12}px) scale(${0.96 + liftProgress * 0.04})`,
          }}
        >
          <LockIcon />
          <span style={{ fontSize: 20, lineHeight: 1 }}>⌃</span>
        </div>

        <div style={{
          ...recordingMicStyle($),
          transform: `translate(-${dragX}px, -${dragY}px) scale(${micScale})`,
          transition: (dragX === 0 && dragY === 0) ? "transform 260ms cubic-bezier(.18,.92,.2,1)" : "none",
        }}>
          <div style={micHaloStyle($, recordingExpanded ? 0.34 : 0, 1.16)} />
          <div style={micHaloStyle($, recordingExpanded ? 0.2 : 0, 1.34)} />
          <MicIcon />
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div style={{ ...gestureSurfaceStyle, display: "flex", alignItems: "center", gap: 12, padding: "6px 10px", flex: 1 }}>
        <button onClick={cancel} style={{ ...iconBtn($), color: $.dn }}>🗑</button>
        <span style={{ color: $.dn, fontSize: 12 }}>● {fmtDuration(elapsed)}</span>
        <div style={{ flex: 1 }} />
        <button onClick={stopAndPreview} style={{ ...iconBtn($), background: $.ac, color: "#fff" }}>✓</button>
      </div>
    );
  }

  if (state === "preview") {
    const p = previewRef.current;
    return (
      <div style={{ ...gestureSurfaceStyle, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", flex: 1 }}>
        <button onClick={cancel} style={{ ...iconBtn($), color: $.dn }}>🗑</button>
        <audio key={p.url} src={p.url} controls preload="auto"
               style={{ flex: 1, height: 32 }} />
        <span style={{ color: $.txM, fontSize: 12 }}>{fmtDuration(p.duration)}</span>
        <button onClick={send} style={{ ...iconBtn($), background: $.ac, color: "#fff" }}>→</button>
      </div>
    );
  }

  return null;
}

const gestureSurfaceStyle = {
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  WebkitTapHighlightColor: "transparent",
  touchAction: "none",
};

const recordingWrapStyle = {
  ...gestureSurfaceStyle,
  position: "relative",
  minHeight: 56,
  overflow: "visible",
  display: "flex",
  alignItems: "center",
};

function recordingPanelStyle($) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minWidth: 0,
    minHeight: 48,
    padding: "7px 12px",
    borderRadius: 24,
    background: $.bgI,
    border: `1px solid ${$.brd}`,
    boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
    boxSizing: "border-box",
  };
}

function lockHintStyle($) {
  return {
    position: "absolute",
    right: 58,
    bottom: 144,
    width: 44,
    minHeight: 76,
    borderRadius: 24,
    background: $.bgI,
    border: `1px solid ${$.brd}`,
    color: $.tx,
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    pointerEvents: "none",
    transformOrigin: "center bottom",
    zIndex: 2,
  };
}

function recordingMicStyle($) {
  return {
    position: "absolute",
    right: 58,
    bottom: 58,
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: $.ac,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 12px 32px rgba(0,0,0,0.32)",
    transformOrigin: "center",
    pointerEvents: "none",
    zIndex: 3,
  };
}

function micHaloStyle($, opacity, scale) {
  return {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    background: $.ac,
    opacity,
    transform: `scale(${scale})`,
    pointerEvents: "none",
  };
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ position: "relative", zIndex: 1 }}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function pickMime() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const m of cands) if (window.MediaRecorder?.isTypeSupported?.(m)) return m;
  return "";
}

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function humanizeMicError(e) {
  if (e?.name === "NotAllowedError") return "Нет доступа к микрофону";
  if (e?.name === "NotFoundError") return "Микрофон не найден";
  return "Не удалось начать запись";
}

function iconBtn($, disabled = false) {
  return {
    width: 36, height: 36, borderRadius: 8, background: $.bgI, color: $.tx,
    border: `1px solid ${$.brd}`, cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: disabled ? 0.5 : 1, fontSize: 18,
    ...gestureSurfaceStyle,
  };
}
