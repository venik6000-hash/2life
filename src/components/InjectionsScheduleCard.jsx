import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import Wrapper from "./Wrapper";
import { formatLocalIsoDate } from "../utils/injectionSchedule";

const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const MONTH_NAMES = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const TYPE_LABELS = { daily: "Каждый день", weekdays: "По дням недели", interval: "Каждые N дней" };

const formatDateRu = (iso) => iso ? iso.split("-").reverse().join(".") : "";

function InjectionPhaseRow({
  phase,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 7,
        border: `1px solid ${$.brd}`,
        background: $.bgI,
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 5,
          background: $.acD,
          color: $.ac,
          fontSize: 12,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>
          {phase.drug || "—"}
          {phase.dosage && <span style={{ fontWeight: 400, color: $.txS, fontSize: 12 }}> {phase.dosage}</span>}
        </div>
        <div style={{ fontSize: 11, color: $.txS, marginTop: 2 }}>
          {phase.startDate && <span style={{ color: $.ac, marginRight: 8, fontWeight: 600 }}>{formatDateRu(phase.startDate)}</span>}
          {TYPE_LABELS[phase.type] || phase.type}
          {phase.type === "weekdays" && ` (${(phase.daysOfWeek || []).map((day) => DOW[day]).join(", ")})`}
          {phase.type === "interval" && ` (каждые ${phase.intervalDays || 2} дн.)`}
          {" · "}
          <b>{phase.durationDays || 0}</b> дн. · {(phase.times || ["09:00"]).join(", ")}
        </div>
        {phase.instruction && (
          <div
            style={{
              fontSize: 11,
              color: $.txM,
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {phase.instruction}
          </div>
        )}
      </div>
      <Wrapper dir="row" gap={3} shrink={0}>
        <Button variant="ghost" size="xs" disabled={index === 0} onClick={onMoveUp}>↑</Button>
        <Button variant="ghost" size="xs" disabled={index === total - 1} onClick={onMoveDown}>↓</Button>
        <Button variant="ghost" size="xs" onClick={onEdit}>✎</Button>
        <Button variant="bare" tone="danger" size="xs" onClick={onDelete}>✕</Button>
      </Wrapper>
    </div>
  );
}

function InjectionsCalendar({
  calendarMonth,
  weeks,
  todayIso,
  eventsByDate,
  eventCount,
  onChangeMonth,
}) {
  const { $ } = useTheme();

  return (
    <div style={{ paddingTop: 16, borderTop: `1px solid ${$.brd}` }}>
      <Wrapper gap="sm">
        <Wrapper dir="row" align="center" gap="sm" wrap>
          <Button variant="ghost" size="sm" onClick={() => onChangeMonth(-1)}>‹</Button>
          <span style={{ fontWeight: 700, fontSize: 14, minWidth: 170, textAlign: "center" }}>
            {MONTH_NAMES[calendarMonth.m]} {calendarMonth.y}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onChangeMonth(1)}>›</Button>
          <span style={{ marginLeft: "auto", fontSize: 11, color: $.txS }}>{eventCount} инъекц. всего</span>
        </Wrapper>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {DAY_NAMES.map((day) => (
            <div key={day} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: $.txS, padding: "3px 0" }}>
              {day}
            </div>
          ))}
          {weeks.flat().map((date, index) => {
            const iso = formatLocalIsoDate(date);
            const events = eventsByDate[iso] || [];
            const currentMonth = date.getMonth() === calendarMonth.m;
            const isToday = iso === todayIso;
            return (
              <div
                key={`${iso}-${index}`}
                style={{
                  minHeight: 56,
                  border: `1px solid ${isToday ? $.ac : $.brd}`,
                  borderRadius: 5,
                  padding: "3px 4px",
                  opacity: currentMonth ? 1 : 0.22,
                  background: isToday ? $.acD : $.bgI,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: isToday ? 700 : 400, color: isToday ? $.ac : $.txM, marginBottom: 2 }}>
                  {date.getDate()}
                </div>
                {events.map((event, eventIndex) => (
                  <div
                    key={`${event.drug}-${eventIndex}`}
                    title={`${event.drug}${event.dosage ? ` ${event.dosage}` : ""}\n${event.instruction}\nВремя: ${(event.times || []).join(", ")}`}
                    style={{
                      fontSize: 9,
                      background: $.acD,
                      color: $.ac,
                      borderRadius: 3,
                      padding: "1px 4px",
                      marginBottom: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: "14px",
                      cursor: "default",
                    }}
                  >
                    {event.drug}{event.dosage ? ` ${event.dosage}` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Wrapper>
    </div>
  );
}

export default function InjectionsScheduleCard({
  phases,
  events,
  eventsByDate,
  calendarMonth,
  calendarWeeks,
  todayIso,
  hasCalendar,
  onShiftAll,
  onExportCalendar,
  onAddPhase,
  onEditPhase,
  onMovePhase,
  onDeletePhase,
  onChangeMonth,
}) {
  const { $ } = useTheme();

  return (
    <Card>
      <Wrapper gap={20}>
        <Wrapper dir="row" align="center" justify="space-between" gap="sm" wrap>
          <div style={{ fontWeight: 700, fontSize: 15 }}>💉 График инъекций</div>
          <Wrapper dir="row" align="center" gap={6} wrap>
            <span style={{ fontSize: 12, color: $.txS }}>Сдвинуть все фазы:</span>
            <Button variant="ghost" size="sm" onClick={() => onShiftAll(-1)} title="−1 день">◀</Button>
            <Button variant="ghost" size="sm" onClick={() => onShiftAll(1)} title="+1 день">▶</Button>
            <Button variant="ghost" size="sm" tone={events.length ? "accent" : "neutral"} disabled={!events.length} onClick={onExportCalendar}>
              ↓ Экспорт .ics
            </Button>
          </Wrapper>
        </Wrapper>

        <Wrapper gap="sm">
          <div style={{ fontSize: 11, fontWeight: 700, color: $.txS, textTransform: "uppercase", letterSpacing: ".5px" }}>Фазы курса</div>
          {!phases.length && (
            <div style={{ fontSize: 13, color: $.txM, padding: "10px 0" }}>
              Фазы не добавлены. Нажмите «+ Добавить фазу»
            </div>
          )}
          {phases.map((phase, index) => (
            <InjectionPhaseRow
              key={`${phase.drug || "phase"}-${index}`}
              phase={phase}
              index={index}
              total={phases.length}
              onMoveUp={() => onMovePhase(index, -1)}
              onMoveDown={() => onMovePhase(index, 1)}
              onEdit={() => onEditPhase(index, phase)}
              onDelete={() => onDeletePhase(index)}
            />
          ))}
          <div>
            <Button variant="ghost" size="sm" tone="accent" onClick={onAddPhase}>
              + Добавить фазу
            </Button>
          </div>
        </Wrapper>

        {hasCalendar && (
          <InjectionsCalendar
            calendarMonth={calendarMonth}
            weeks={calendarWeeks}
            todayIso={todayIso}
            eventsByDate={eventsByDate}
            eventCount={events.length}
            onChangeMonth={onChangeMonth}
          />
        )}
      </Wrapper>
    </Card>
  );
}
