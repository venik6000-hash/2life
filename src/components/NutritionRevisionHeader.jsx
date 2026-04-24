import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import RevisionPills from "./RevisionPills";
import Wrapper from "./Wrapper";

export default function NutritionRevisionHeader({
  revisions,
  activeIndex,
  readOnly = false,
  onSelect,
  onDelete,
  onAdd,
}) {
  const { $ } = useTheme();

  return (
    <Wrapper marginBottom={12}>
      <Card size="md">
        <Wrapper gap="sm">
          <div style={{ fontSize: 11, color: $.txM, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Версия питания
          </div>
          <RevisionPills
            revisions={revisions}
            activeIndex={activeIndex}
            onSelect={onSelect}
            onDelete={onDelete}
            onAdd={onAdd}
            readOnly={readOnly}
          />
        </Wrapper>
      </Card>
    </Wrapper>
  );
}
