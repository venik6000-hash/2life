import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import { ModalDescription, ModalInfoBlock, ModalTitle } from "./ModalText";
import Wrapper from "./Wrapper";

export default function DoctorAccessModal({ clientId, onClose }) {
  const url = `https://app.2life.health/${clientId}`;

  return (
    <Modal onClose={onClose}>
      <ModalTitle>🔗 Доступ для врача</ModalTitle>
      <ModalDescription>
        После деплоя врач получает ссылку — работает в браузере без ПО.
      </ModalDescription>
      <ModalInfoBlock>
        🌐 Ссылка | 🔒 Пароль (опц.) | 👁 Просмотр | ✏️ Полный
      </ModalInfoBlock>
      <Wrapper dir="row" gap={6}>
        <Wrapper flex={1}>
          <Input readOnly value={url} />
        </Wrapper>
        <Button onClick={() => navigator.clipboard?.writeText(url)}>📋</Button>
      </Wrapper>
      <Wrapper marginTop={14}>
        <Button variant="ghost" fullWidth onClick={onClose}>Закрыть</Button>
      </Wrapper>
    </Modal>
  );
}
