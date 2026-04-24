import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import { ModalTitle } from "./ModalText";
import Wrapper from "./Wrapper";

export default function DoctorsListModal({
  doctors,
  onChangeDoctor,
  onDeleteDoctor,
  onAddDoctor,
  onSave,
  onClose,
}) {
  const { $ } = useTheme();

  return (
    <Modal onClose={onClose}>
      <ModalTitle>👨‍⚕️ Врачи этапов</ModalTitle>
      <Wrapper gap={10}>
        {doctors.map((doctor, index) => (
          <div key={index} style={{ background: $.bgI, border: `1px solid ${$.brd}`, borderRadius: 8, padding: 10 }}>
            <Wrapper columns="1fr 1fr auto" gap="sm" align="center">
              <Input
                defaultValue={doctor.name || ""}
                placeholder="Имя врача"
                onBlur={(event) => onChangeDoctor(index, { ...doctor, name: event.target.value })}
              />
              <Input
                defaultValue={doctor.role || ""}
                placeholder="Специализация"
                onBlur={(event) => onChangeDoctor(index, { ...doctor, role: event.target.value })}
              />
              <Button variant="ghost" tone="danger" size="sm" onClick={() => onDeleteDoctor(index)}>
                Удалить
              </Button>
            </Wrapper>
          </div>
        ))}
      </Wrapper>
      <Wrapper marginTop={12}>
        <Button variant="ghost" size="sm" onClick={onAddDoctor}>+ Врач</Button>
      </Wrapper>
      <Wrapper marginTop={14}>
        <Button fullWidth size="lg" onClick={onSave}>Сохранить список врачей</Button>
      </Wrapper>
    </Modal>
  );
}
