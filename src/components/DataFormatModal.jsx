import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Modal from "./Modal";
import { ModalCodeLabel, ModalInfoBlock, ModalTitle } from "./ModalText";
import Wrapper from "./Wrapper";

export default function DataFormatModal({ onClose }) {
  const { $ } = useTheme();

  return (
    <Modal onClose={onClose}>
      <ModalTitle>📖 Формат данных</ModalTitle>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: $.txS }}>
        <p>Данные из карт клиентов (Sheets/Excel/PDF). Структура:</p>
        <ModalInfoBlock mono>
          <ModalCodeLabel>Профиль:</ModalCodeLabel>
          <div>ФИО | ДР | Email | Телефон | Город | Рост | Вес</div>
          <ModalCodeLabel offset>Этап (+ врач):</ModalCodeLabel>
          <div>Задачи | Синдромы | Дефициты | Питание | Протокол</div>
          <ModalCodeLabel offset>Анализы (как в PDF):</ModalCodeLabel>
          <div>Категория → Показатель | Норма | Оптимум | Дата1 | Дата2...</div>
          <ModalCodeLabel offset>Протокол — версионность:</ModalCodeLabel>
          <div>Каждая корректировка сохраняется как отдельная версия</div>
        </ModalInfoBlock>
        <p>Кликайте на <span style={{ borderBottom: `1px dashed ${$.ac}` }}>подчёркнутые</span> для редактирования.</p>
      </div>
      <Wrapper marginTop={14}>
        <Button variant="ghost" fullWidth onClick={onClose}>Закрыть</Button>
      </Wrapper>
    </Modal>
  );
}
