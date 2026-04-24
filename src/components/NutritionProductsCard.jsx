import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import Ed from "./Ed";
import Wrapper from "./Wrapper";

const HEADERS = ["Категория", "Продукты", "Инструкция", "Примеч.", ""];

export default function NutritionProductsCard({
  categories = [],
  revisionIndex,
  readOnly = false,
  onSaveField,
  onDelete,
  onAdd,
}) {
  const { $ } = useTheme();

  return (
    <Wrapper marginBottom={14}>
      <Card scrollX>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>🥗 Продукты</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header} style={{ padding: "7px 8px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, color: $.ac, fontSize: 11 }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category, index) => (
              <tr key={index} style={{ borderBottom: `1px solid ${$.brd}` }}>
                <td style={{ padding: "7px 8px", fontWeight: 600 }}>
                  <Ed readOnly={readOnly} value={category.name} editKey={`ncn-${revisionIndex}-${index}`} onSave={(value) => onSaveField(index, "name", value)} />
                </td>
                <td style={{ padding: "7px 8px", maxWidth: 280 }}>
                  <Ed readOnly={readOnly} value={category.products} editKey={`ncp-${revisionIndex}-${index}`} multiline onSave={(value) => onSaveField(index, "products", value)} />
                </td>
                <td style={{ padding: "7px 8px", color: $.ac }}>
                  <Ed readOnly={readOnly} value={category.instruction} editKey={`nci-${revisionIndex}-${index}`} onSave={(value) => onSaveField(index, "instruction", value)} />
                </td>
                <td style={{ padding: "7px 8px", color: $.txS }}>
                  <Ed readOnly={readOnly} value={category.notes} editKey={`ncnt-${revisionIndex}-${index}`} onSave={(value) => onSaveField(index, "notes", value)} />
                </td>
                <td>
                  {!readOnly && <Button variant="bare" tone="danger" size="xs" onClick={() => onDelete(index)}>✕</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!readOnly && (
          <Wrapper marginTop={8}>
            <Button variant="ghost" size="sm" onClick={onAdd}>+ Категория</Button>
          </Wrapper>
        )}
      </Card>
    </Wrapper>
  );
}
