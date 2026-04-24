import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import FormField from "./FormField";
import Input from "./Input";
import Modal from "./Modal";
import TextArea from "./TextArea";
import Wrapper from "./Wrapper";

const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const TYPE_OPTIONS = [
  { value: "daily", label: "Каждый день" },
  { value: "weekdays", label: "По дням недели" },
  { value: "interval", label: "Каждые N дней" },
];

export default function InjectionPhaseModal({
  draft,
  onChangeDraft,
  onClose,
  onSave,
}) {
  const { $ } = useTheme();
  const patchDraft = (patch) => onChangeDraft((current) => ({ ...current, ...patch }));

  return (
    <Modal onClose={onClose} size="lg">
      <Wrapper gap="md">
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {draft._idx === -1 ? "Новая фаза" : "Редактировать фазу"}
        </div>

        <Wrapper columns="1fr 1fr" gap="md">
          <FormField label="Препарат">
            <Input value={draft.drug || ""} onChange={(event) => patchDraft({ drug: event.target.value })} placeholder="Название препарата" />
          </FormField>
          <FormField label="Дозировка">
            <Input value={draft.dosage || ""} onChange={(event) => patchDraft({ dosage: event.target.value })} placeholder="250mcg" />
          </FormField>
        </Wrapper>

        <FormField label="Инструкция / примечание">
          <TextArea value={draft.instruction || ""} onChange={(event) => patchDraft({ instruction: event.target.value })} rows={3} placeholder="Подкожно, область живота..." />
        </FormField>

        <Wrapper gap="sm">
          <div style={{ fontSize: 11, color: $.txS }}>Периодичность</div>
          <Wrapper dir="row" gap="sm" wrap>
            {TYPE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant="pill"
                active={draft.type === option.value}
                onClick={() => patchDraft({ type: option.value })}
              >
                {option.label}
              </Button>
            ))}
          </Wrapper>

          {draft.type === "weekdays" && (
            <Wrapper dir="row" gap={6} wrap>
              {DOW.map((dayLabel, dayIndex) => (
                <Button
                  key={dayIndex}
                  variant="pill"
                  size="sm"
                  active={(draft.daysOfWeek || []).includes(dayIndex)}
                  onClick={() => {
                    const selected = draft.daysOfWeek || [];
                    patchDraft({
                      daysOfWeek: selected.includes(dayIndex)
                        ? selected.filter((item) => item !== dayIndex)
                        : [...selected, dayIndex],
                    });
                  }}
                >
                  {dayLabel}
                </Button>
              ))}
            </Wrapper>
          )}

          {draft.type === "interval" && (
            <Wrapper dir="row" gap="sm" align="center" wrap>
              <span style={{ fontSize: 12, color: $.txS }}>Каждые</span>
              <Wrapper width={64}>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={draft.intervalDays || 2}
                  onChange={(event) => patchDraft({ intervalDays: parseInt(event.target.value, 10) || 1 })}
                />
              </Wrapper>
              <span style={{ fontSize: 12, color: $.txS }}>дней</span>
            </Wrapper>
          )}
        </Wrapper>

        <Wrapper columns="1fr 1fr 1fr" gap="md">
          <FormField label="Дата начала">
            <Input type="date" value={draft.startDate || ""} onChange={(event) => patchDraft({ startDate: event.target.value })} />
          </FormField>
          <FormField label="Длительность (дней)">
            <Input
              type="number"
              min={1}
              max={365}
              value={draft.durationDays || 1}
              onChange={(event) => patchDraft({ durationDays: parseInt(event.target.value, 10) || 1 })}
            />
          </FormField>
          <FormField label="Время инъекции">
            <Input
              type="time"
              value={(draft.times || ["09:00"])[0] || "09:00"}
              onChange={(event) => patchDraft({ times: [event.target.value] })}
            />
          </FormField>
        </Wrapper>

        <Wrapper dir="row" gap="sm" justify="flex-end">
          <Button variant="ghost" onClick={onClose}>Отмена</Button>
          <Button variant="ghost" tone="accent" onClick={onSave}>Сохранить</Button>
        </Wrapper>
      </Wrapper>
    </Modal>
  );
}
