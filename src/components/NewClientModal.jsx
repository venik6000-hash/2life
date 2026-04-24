import Button from "./Button";
import FormField from "./FormField";
import Input from "./Input";
import Modal from "./Modal";
import { ModalTitle } from "./ModalText";

export default function NewClientModal({ name, onChangeName, onCreate, onClose }) {
  return (
    <Modal onClose={onClose}>
      <ModalTitle>+ Новый клиент</ModalTitle>
      <FormField label="ФИО">
        <Input value={name} onChange={(event) => onChangeName(event.target.value)} />
      </FormField>
      <Button fullWidth size="lg" onClick={onCreate}>Создать</Button>
    </Modal>
  );
}
