import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Button from "./Button";
import Wrapper from "./Wrapper";
import SectionTitle from "./SectionTitle";
import JournalItemCard from "./JournalItemCard";

const isChecklistItem = (item) =>
  Boolean(item?.sourceTemplateItemId) || Boolean(item?.metadata?.checklist);

export default function JournalChecklistPanel({
  stages = [],
  items = [],
  readOnly = false,
  onInitialize,
  onAdd,
  onEdit,
  onDelete,
  onComment,
}) {
  const { $ } = useTheme();

  return (
    <Card size="md">
      <SectionTitle>Чек-листы этапов</SectionTitle>
      <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
        {stages.length === 0 && (
          <div style={{ color: $.txM, fontSize: 12 }}>У клиента ещё нет этапов.</div>
        )}
        {stages.map((stage) => {
          const stageItems = items.filter(
            (i) => Number(i.stageId) === Number(stage.id) && isChecklistItem(i),
          );
          return (
            <div
              key={stage.id}
              style={{
                padding: 12,
                border: `1px solid ${$.brd}`,
                borderRadius: 8,
                display: "grid",
                gap: 8,
              }}
            >
              <Wrapper dir="row" justify="space-between" align="center" gap="sm" wrap>
                <div style={{ fontSize: 13, fontWeight: 700, color: $.tx }}>
                  {stage.title || `Этап ${stage.id}`}
                  {stage.subtitle && (
                    <span style={{ marginLeft: 8, fontWeight: 400, color: $.txS, fontSize: 12 }}>
                      {stage.subtitle}
                    </span>
                  )}
                </div>
                {!readOnly && (
                  <Wrapper dir="row" gap="xs" wrap>
                    {stageItems.length === 0 && (
                      <Button
                        size="xs"
                        variant="soft"
                        tone="info"
                        onClick={() => onInitialize && onInitialize(stage.id)}
                      >
                        + Инициализировать чек-лист
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="soft"
                      tone="accent"
                      onClick={() => onAdd && onAdd(stage)}
                    >
                      + Добавить
                    </Button>
                  </Wrapper>
                )}
              </Wrapper>
              {stageItems.length === 0 ? (
                <div style={{ color: $.txM, fontSize: 12 }}>Чек-лист пуст.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {stageItems.map((item) => (
                    <JournalItemCard
                      key={item.id}
                      item={item}
                      stages={stages}
                      readOnly={readOnly}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onComment={onComment}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
