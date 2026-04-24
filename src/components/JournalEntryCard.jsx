import { useTheme } from "../context/ThemeContext";
import { jColors } from "../styles/theme";
import Card from "./Card";
import Button from "./Button";
import Ed from "./Ed";
import JournalTypeSelect from "./JournalTypeSelect";
import SelectInput from "./SelectInput";
import Wrapper from "./Wrapper";

export default function JournalEntryCard({
  entry,
  authorOptions,
  onChangeType,
  onChangeDate,
  onChangeText,
  onChangeAuthor,
  onDelete,
}) {
  const { $ } = useTheme();

  return (
    <div
      style={{
        marginBottom: 10,
        borderLeft: `4px solid ${jColors[entry.type] || $.txM}`,
      }}
    >
      <Card>
        <Wrapper gap="sm">
          <Wrapper dir="row" justify="space-between" align="center" gap="sm" wrap>
            <Wrapper dir="row" gap="sm" align="center" wrap>
              <JournalTypeSelect value={entry.type} onChange={onChangeType} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                <Ed value={entry.date} editKey={entry.date ? `jd-${entry.date}-${entry.type}` : `jd-${entry.type}`} onSave={onChangeDate} />
              </span>
            </Wrapper>
            <Button variant="bare" tone="danger" onClick={onDelete}>✕</Button>
          </Wrapper>

          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <Ed multiline value={entry.text} editKey={`jt-${entry.date}-${entry.type}-${entry.author || "2life"}`} onSave={onChangeText} />
          </div>

          <Wrapper dir="row" align="center" gap="xs" wrap>
            <span style={{ fontSize: 11, color: $.txM }}>—</span>
            <Wrapper as="span" width={160}>
              <SelectInput size="xs" value={entry.author || "2life"} onChange={onChangeAuthor}>
                {authorOptions.map(author => <option key={author} value={author}>{author}</option>)}
              </SelectInput>
            </Wrapper>
          </Wrapper>
        </Wrapper>
      </Card>
    </div>
  );
}
