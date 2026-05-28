import { useMemo } from "react";
import { summarizeJournalItems, getTodayIso } from "../utils/journalRules";
import StatCard from "./StatCard";
import Wrapper from "./Wrapper";

export default function JournalSummary({ items = [], today = getTodayIso() }) {
  const summary = useMemo(() => summarizeJournalItems(items, { today }), [items, today]);

  return (
    <Wrapper columns="repeat(auto-fill,minmax(160px,1fr))" gap={10}>
      <StatCard
        label="Открытых"
        value={summary.open}
        description="активных задач"
        tone="info"
      />
      <StatCard
        label="На сегодня"
        value={summary.today}
        description="срок сегодня"
        tone="warning"
      />
      <StatCard
        label="Просрочено"
        value={summary.overdue}
        description="нужно внимание"
        tone="danger"
      />
    </Wrapper>
  );
}
