import { useSectionState } from "./useSectionState";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Input from "../../components/Input";
import Wrapper from "../../components/Wrapper";

// Template section:
// - receives minimum contract from dashboard
// - uses local hook for section behavior
export default function SectionTemplate({
  stage,
  updateStage,
  todayLabel,
}) {
  const {
    isEditMode,
    setIsEditMode,
    sectionItems,
    addItem,
    updateItemTitle,
  } = useSectionState({ stage, updateStage, todayLabel });

  return (
    <Card>
      <Wrapper dir="row" align="center" gap="sm" marginBottom="md">
        <strong>Новая секция</strong>
        <Wrapper marginLeft="auto">
          <Button variant="ghost" size="sm" onClick={() => setIsEditMode((v) => !v)}>
            {isEditMode ? "Готово" : "Редактировать"}
          </Button>
        </Wrapper>
      </Wrapper>

      <Wrapper gap="sm">
        {sectionItems.map((item, index) => (
          <Card key={index} size="sm">
            {isEditMode ? (
              <Input
                value={item.title || ""}
                onChange={(e) => updateItemTitle(index, e.target.value)}
              />
            ) : (
              <span>{item.title || "—"}</span>
            )}
          </Card>
        ))}
      </Wrapper>

      <Wrapper marginTop="md">
        <Button variant="ghost" size="sm" onClick={addItem}>
          + Добавить
        </Button>
      </Wrapper>
    </Card>
  );
}
