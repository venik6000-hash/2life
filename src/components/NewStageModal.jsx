import Button from "./Button";
import FormField from "./FormField";
import Input from "./Input";
import Modal from "./Modal";
import { ModalTitle } from "./ModalText";
import SelectInput from "./SelectInput";

export default function NewStageModal({
  title,
  doctor,
  doctors,
  date,
  onChangeDoctor,
  onCreate,
  onClose,
}) {
  return (
    <Modal onClose={onClose}>
      <ModalTitle>+ Новый этап</ModalTitle>
      <FormField label="Название этапа">
        <Input readOnly value={title} />
      </FormField>
      <FormField label="Врач">
        <SelectInput value={doctor} onChange={(event) => onChangeDoctor(event.target.value)}>
          <option value="">— выбрать врача этапа —</option>
          {doctors.filter(d => d?.name).map((item, index) => (
            <option key={`${item.name}-${index}`} value={item.name}>{item.name}{item.role ? ` — ${item.role}` : ""}</option>
          ))}
        </SelectInput>
      </FormField>
      <FormField label="Дата создания этапа">
        <Input readOnly value={date} />
      </FormField>
      <Button fullWidth size="lg" onClick={onCreate}>Создать этап</Button>
    </Modal>
  );
}
