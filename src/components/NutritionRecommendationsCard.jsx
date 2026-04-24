import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import Ed from "./Ed";
import Wrapper from "./Wrapper";

export default function NutritionRecommendationsCard({
  rules = [],
  revisionIndex,
  readOnly = false,
  onSaveTitle,
  onSaveDescription,
  onAdd,
}) {
  const { $ } = useTheme();

  return (
    <Wrapper marginBottom={14}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📌 Рекомендации</div>
        {rules.map((rule, index) => (
          <div
            key={index}
            style={{
              padding: "8px 0",
              borderBottom: `1px solid ${$.brd}`,
              display: "grid",
              gridTemplateColumns: "130px 1fr",
              gap: 12,
              fontSize: 13,
            }}
          >
            <span style={{ fontWeight: 600, color: $.ac }}>
              <Ed
                readOnly={readOnly}
                value={rule.title}
                editKey={`nrt-${revisionIndex}-${index}`}
                onSave={(value) => onSaveTitle(index, value)}
              />
            </span>
            <Ed
              readOnly={readOnly}
              value={rule.desc}
              editKey={`nrd-${revisionIndex}-${index}`}
              multiline
              onSave={(value) => onSaveDescription(index, value)}
            />
          </div>
        ))}
        {!readOnly && (
          <Wrapper marginTop={8}>
            <Button variant="ghost" size="sm" onClick={onAdd}>+ Рекомендация</Button>
          </Wrapper>
        )}
      </Card>
    </Wrapper>
  );
}
