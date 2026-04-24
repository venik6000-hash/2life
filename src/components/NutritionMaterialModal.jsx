import Button from "./Button";
import FormField from "./FormField";
import Input from "./Input";
import Modal from "./Modal";
import Wrapper from "./Wrapper";

export default function NutritionMaterialModal({
  draft,
  onChange,
  onClose,
  onSave,
}) {
  return (
    <Modal onClose={onClose}>
      <Wrapper gap="md">
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          {draft.index >= 0 ? "Редактировать материал" : "Новый материал"}
        </h3>
        <FormField label="Текст ссылки">
          <Input
            value={draft.text}
            onChange={(event) => onChange({ ...draft, text: event.target.value })}
            placeholder="Например: Тарелка здорового питания (50/25/25)"
          />
        </FormField>
        <FormField label="Ссылка на материал">
          <Input
            value={draft.url}
            onChange={(event) => onChange({ ...draft, url: event.target.value })}
            placeholder="https://..."
          />
        </FormField>
        <Wrapper dir="row" gap="sm">
          <Button fullWidth onClick={onSave}>Сохранить</Button>
          <Button variant="ghost" fullWidth onClick={onClose}>Отмена</Button>
        </Wrapper>
      </Wrapper>
    </Modal>
  );
}
