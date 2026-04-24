import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import Wrapper from "./Wrapper";

const normalizeMaterial = (instruction) => {
  if (typeof instruction === "string") return { text: instruction, url: "" };
  return { text: String(instruction?.text || ""), url: String(instruction?.url || "") };
};

export default function NutritionMaterialsCard({
  instructions = [],
  readOnly = false,
  onOpen,
  onDelete,
}) {
  const { $ } = useTheme();

  return (
    <Card>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📚 Материалы</div>
      {instructions.map((instruction, index) => {
        const material = normalizeMaterial(instruction);
        return (
          <div key={index} style={{ padding: "7px 0", borderBottom: `1px solid ${$.brd}`, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: $.ac, flexShrink: 0 }}>📎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a
                href={material.url || "#"}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (!material.url) {
                    event.preventDefault();
                    if (!readOnly) onOpen(index);
                  }
                }}
                style={{ color: material.url ? $.in : $.txM, textDecoration: "underline", textUnderlineOffset: 2, fontWeight: 500, wordBreak: "break-word" }}
                title={material.url || "Добавьте ссылку через редактирование"}
              >
                {material.text || "Материал без названия"}
              </a>
            </div>
            {!readOnly && (
              <Wrapper dir="row" align="center" gap={4} shrink={0}>
                <Button variant="soft" tone="info" size="xs" onClick={() => onOpen(index)}>✎</Button>
                <Button variant="bare" tone="danger" size="xs" onClick={() => onDelete(index)}>✕</Button>
              </Wrapper>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <Wrapper marginTop={8}>
          <Button variant="ghost" size="sm" onClick={() => onOpen()}>+ Материал</Button>
        </Wrapper>
      )}
    </Card>
  );
}
