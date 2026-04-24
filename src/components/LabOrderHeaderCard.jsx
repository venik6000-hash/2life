import Button from "./Button";
import Card from "./Card";
import Wrapper from "./Wrapper";
import { useTheme } from "../context/ThemeContext";

export default function LabOrderHeaderCard({
  totalSelected,
  onClear,
  onExportPdf,
}) {
  const { $ } = useTheme();

  return (
    <Wrapper marginBottom={14}>
      <Card>
        <Wrapper dir="row" align="center" justify="space-between" gap="md" wrap>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🔬 Направление на анализы</div>
            <div style={{ fontSize: 11, color: $.txM, marginTop: 3 }}>
              {totalSelected > 0 ? `Выбрано ${totalSelected} анализов` : "Отметьте нужные анализы — клиент получит PDF со списком"}
            </div>
          </div>
          <Wrapper dir="row" gap="sm" align="center">
            {totalSelected > 0 && <Button variant="ghost" size="sm" tone="danger" onClick={onClear}>Очистить</Button>}
            <Button onClick={onExportPdf} disabled={!totalSelected}>📄 Выгрузить PDF</Button>
          </Wrapper>
        </Wrapper>
      </Card>
    </Wrapper>
  );
}
