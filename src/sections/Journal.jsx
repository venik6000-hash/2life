import Button from "../components/Button";
import JournalEntryCard from "../components/JournalEntryCard";

export default function JournalSection({ st, uS }) {
  const jAuthors = ["2life", st.doctor || "Врач"].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div>
      {st.journal?.map((e, i) => (
        <JournalEntryCard
          key={`${e.date || "entry"}-${i}`}
          entry={e}
          authorOptions={jAuthors}
          onChangeType={ev2 => uS(s => { s.journal[i].type = ev2.target.value; })}
          onChangeDate={v => uS(s => { s.journal[i].date = v; })}
          onChangeText={v => uS(s => { s.journal[i].text = v; })}
          onChangeAuthor={ev2 => uS(s => { s.journal[i].author = ev2.target.value; })}
          onDelete={() => uS(s => { s.journal.splice(i, 1); })}
        />
      ))}
      <Button
        onClick={() => {
          const now = new Date();
          const d = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
          uS(s => { s.journal.push({ date: d, type: "Заметка", text: "", author: "2life" }); });
        }}
      >
        + Запись
      </Button>
    </div>
  );
}
