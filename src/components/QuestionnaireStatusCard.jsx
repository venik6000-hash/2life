import { useTheme } from "../context/ThemeContext";
import Card from "./Card";
import Wrapper from "./Wrapper";

export default function QuestionnaireStatusCard({
  actions,
  empty = false,
  warning,
}) {
  const { $ } = useTheme();

  return (
    <Card>
      <Wrapper gap={empty ? "md" : "sm"}>
        <Wrapper dir="row" justify="space-between" align="center" gap="md" wrap>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📋 Анкета здоровья</div>
          {!empty && actions}
        </Wrapper>
        {empty ? (
          <>
            <div style={{ fontSize: 12, color: $.txM }}>Не заполнено</div>
            {actions}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: $.txM }}>
              Во вкладке отображается только медицинская часть анкеты. Контакты и антропометрия находятся в обзоре.
            </div>
            {warning && <div style={{ fontSize: 12, color: $.txM }}>{warning}</div>}
          </>
        )}
      </Wrapper>
    </Card>
  );
}
