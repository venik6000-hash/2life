import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import RevisionPills from "./RevisionPills";
import Wrapper from "./Wrapper";

export default function ProtocolRevisionHeader({
  revisions,
  activeIndex,
  mode,
  readOnly,
  onSelectRevision,
  onDeleteRevision,
  onAddRevision,
  onSetMode,
}) {
  const { $ } = useTheme();

  return (
    <Card size="md">
      <Wrapper dir="row" justify="space-between" align="center" gap="sm" wrap>
        <Wrapper gap="xs">
          <div style={{ fontSize: 11, color: $.txM, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
            Версия
          </div>
          <RevisionPills
            revisions={revisions}
            activeIndex={activeIndex}
            onSelect={onSelectRevision}
            onDelete={onDeleteRevision}
            onAdd={mode === "builder" ? onAddRevision : undefined}
            readOnly={mode !== "builder"}
          />
        </Wrapper>

        {!readOnly && (
          <Wrapper dir="row" gap="sm" align="center">
            <Button variant="pill" active={mode === "builder"} onClick={() => onSetMode("builder")}>Редактировать</Button>
            <Button variant="pill" active={mode === "client"} tone="info" onClick={() => onSetMode("client")}>Вид клиента</Button>
          </Wrapper>
        )}
      </Wrapper>
    </Card>
  );
}
