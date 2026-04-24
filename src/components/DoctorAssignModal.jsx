import Button from "./Button";
import FormField from "./FormField";
import Modal from "./Modal";
import { ModalDescription, ModalTitle } from "./ModalText";
import SelectInput from "./SelectInput";
import Wrapper from "./Wrapper";

export default function DoctorAssignModal({
  doctor,
  doctors,
  onChangeDoctor,
  onClearDoctor,
  onClose,
}) {
  return (
    <Modal onClose={onClose}>
      <ModalTitle>👨‍⚕️ Врач этапа</ModalTitle>
      <ModalDescription>
        Выберите врача для текущего этапа. Управление списком врачей доступно в админ-панели.
      </ModalDescription>
      <Wrapper gap={10}>
        <FormField label="Текущий врач">
          <SelectInput value={doctor || ""} onChange={(event) => onChangeDoctor(event.target.value)}>
            <option value="">— выбрать врача этапа —</option>
            {doctors.filter(d => d?.name).map((item, index) => (
              <option key={`${item.name}-${index}`} value={item.name}>{item.name}{item.role ? ` — ${item.role}` : ""}</option>
            ))}
          </SelectInput>
        </FormField>
        <Wrapper dir="row" gap="sm" wrap>
          {doctor && (
            <Button variant="ghost" tone="danger" onClick={onClearDoctor}>Снять врача</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Закрыть</Button>
        </Wrapper>
      </Wrapper>
    </Modal>
  );
}
