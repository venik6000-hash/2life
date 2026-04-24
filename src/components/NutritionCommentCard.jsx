import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Ed from "./Ed";
import Wrapper from "./Wrapper";

export default function NutritionCommentCard({
  value,
  revisionIndex,
  readOnly = false,
  onSave,
}) {
  const { $ } = useTheme();

  return (
    <Wrapper marginBottom={14}>
      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📝 Комментарий врача к версии</div>
        <div style={{ fontSize: 11, color: $.txM, marginBottom: 10 }}>
          Здесь можно описать, что изменили в корректировке, на чем сделали акцент и что добавили.
        </div>
        <Ed
          readOnly={readOnly}
          value={value || ""}
          editKey={`ncm-${revisionIndex}`}
          multiline
          size="sm"
          onSave={onSave}
        />
      </Card>
    </Wrapper>
  );
}
