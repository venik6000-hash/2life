import { useRef, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useEditor } from "../context/EditorContext";
import SelectInput from "./SelectInput";
import Wrapper from "./Wrapper";

export default function SexEd({
  value,
  editKey,
  options,
  onSave,
  readOnly = false,
  f,
  save,
}) {
  const { $ } = useTheme();
  const { ef, setEf } = useEditor();
  const selectRef = useRef(null);
  const resolvedEditKey = editKey ?? f;
  const resolvedSave = onSave ?? save;
  const resolvedValue = String(value || "");

  useEffect(() => {
    if (ef !== resolvedEditKey || !selectRef.current) return;
    const node = selectRef.current;
    requestAnimationFrame(() => {
      try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
      if (typeof node.showPicker === "function") {
        try { node.showPicker(); return; } catch (_) {}
      }
      try { node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window })); } catch (_) {}
      try { node.click(); } catch (_) {}
    });
  }, [ef, resolvedEditKey]);

  if (readOnly) {
    return (
      <span style={{ color: resolvedValue ? $.tx : $.txM, fontStyle: resolvedValue ? "normal" : "italic" }}>
        {resolvedValue || "—"}
      </span>
    );
  }

  if (ef === resolvedEditKey) {
    return (
      <Wrapper as="span" minWidth={140}>
        <SelectInput
          inputRef={selectRef}
          size="sm"
          value={resolvedValue}
          onChange={e => { resolvedSave(e.target.value); setEf(null); }}
          onBlur={() => setEf(null)}
        >
          {!options.includes(resolvedValue) && <option value={resolvedValue}>{resolvedValue || "—"}</option>}
          {options.map(opt => <option key={opt || "empty"} value={opt}>{opt || "—"}</option>)}
        </SelectInput>
      </Wrapper>
    );
  }

  return (
    <span
      style={{ cursor: "pointer", borderBottom: `1px dashed ${$.brd}`, display: "inline-block", color: value ? $.tx : $.txM, fontStyle: value ? "normal" : "italic" }}
      onMouseDown={e => { e.preventDefault(); setEf(resolvedEditKey); }}
      title="Редактировать"
    >
      {resolvedValue || "—"}
    </span>
  );
}
