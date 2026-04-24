import Button from "./Button";

export default function FileUploadButton({
  accept,
  onSelect,
  tone = "accent",
  variant = "ghost",
  size = "sm",
  disabled = false,
  children,
}) {
  return (
    <label
      style={{
        display: "inline-flex",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        style={{ display: "none" }}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || disabled) return;
          await onSelect(file);
        }}
      />
      <span style={{ pointerEvents: "none" }}>
        <Button variant={variant} tone={tone} size={size} disabled={disabled}>
          {children}
        </Button>
      </span>
    </label>
  );
}
