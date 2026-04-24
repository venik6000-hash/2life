import { useRef, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { useEditor } from "../context/EditorContext";
import Button from "./Button";
import Input from "./Input";
import TextArea from "./TextArea";
import Wrapper from "./Wrapper";

const SIZE_MAP = {
  sm: { input: "sm", button: "xs" },
  md: { input: "md", button: "sm" },
};

export default function Ed({
  value,
  editKey,
  onSave,
  multiline = false,
  size = "md",
  readOnly = false,
  emptyLabel = "—",
  v,
  f,
  save,
  ml,
  fontSize,
  ro,
}) {
  const { $ } = useTheme();
  const { ef, ev, setEf, setEv } = useEditor();
  const editorRef = useRef(null);
  const resolvedValue = value ?? v ?? "";
  const resolvedEditKey = editKey ?? f;
  const resolvedSave = onSave ?? save;
  const resolvedMultiline = multiline || !!ml;
  const resolvedReadOnly = readOnly || !!ro;
  const resolvedSize = size === "sm" || fontSize === 12 ? "sm" : "md";
  const sizeConfig = SIZE_MAP[resolvedSize] || SIZE_MAP.md;
  const hasValue = String(resolvedValue || "").trim().length > 0;

  const closeEditor = () => setEf(null);
  const commit = () => {
    if (!resolvedSave) return;
    resolvedSave(ev);
    closeEditor();
  };

  useEffect(() => {
    if (ef === resolvedEditKey && editorRef.current) {
      try { editorRef.current.focus({ preventScroll: true }); } catch (_) { editorRef.current.focus(); }
    }
  }, [ef, resolvedEditKey]);

  if (resolvedReadOnly) {
    return (
      <span
        style={{
          fontFamily: "inherit",
          fontSize: fontSize == null ? "inherit" : fontSize,
          fontWeight: "inherit",
          color: "inherit",
          lineHeight: "inherit",
        }}
      >
        {hasValue ? resolvedValue : <i style={{ color: $.txM }}>{emptyLabel}</i>}
      </span>
    );
  }

  if (ef === resolvedEditKey) {
    return (
      <Wrapper as="span" dir="row" gap="xs" align="center" wrap>
        <Wrapper as="span" grow={1} minWidth={resolvedMultiline ? 220 : 140}>
          {resolvedMultiline ? (
            <TextArea
              inputRef={editorRef}
              rows={3}
              value={ev}
              onChange={e => setEv(e.target.value)}
              onBlur={() => {}}
            />
          ) : (
            <Input
              inputRef={editorRef}
              size={sizeConfig.input}
              value={ev}
              onChange={e => setEv(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") closeEditor();
              }}
            />
          )}
        </Wrapper>
        <Button size={sizeConfig.button} onClick={commit}>OK</Button>
        <Button variant="ghost" size={sizeConfig.button} onClick={closeEditor}>X</Button>
      </Wrapper>
    );
  }

  return (
    <span
      style={{
        cursor: "pointer",
        borderBottom: `1px dashed ${$.brd}`,
        fontFamily: "inherit",
        fontSize: fontSize == null ? "inherit" : fontSize,
        fontWeight: "inherit",
        color: "inherit",
        display: "inline-block",
        maxWidth: "100%",
        whiteSpace: resolvedMultiline ? "pre-wrap" : "normal",
        overflowWrap: "anywhere",
        lineHeight: "inherit",
      }}
      onClick={() => { setEf(resolvedEditKey); setEv(resolvedValue ?? ""); }}
      title="Редактировать"
    >
      {hasValue ? resolvedValue : <i style={{ color: $.txM }}>{emptyLabel}</i>}
    </span>
  );
}
