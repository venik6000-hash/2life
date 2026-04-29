import { useTheme } from "../context/ThemeContext";
import Button from "./Button";
import Card from "./Card";
import Ed from "./Ed";
import MiniDatePicker from "./MiniDatePicker";
import Wrapper from "./Wrapper";

export default function AnalyticsFilesPanel({
  files = [],
  loading = false,
  readOnly = false,
  onUpload,
  onUpdateField,
  onDelete,
  onDownload,
}) {
  const { $ } = useTheme();

  return (
    <div>
      {!readOnly && (
        <Wrapper marginBottom={12} dir="row" gap="sm" align="center">
          <label style={{ display: "inline-flex", cursor: "pointer" }}>
            <input
              type="file"
              accept=".pdf,image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onUpload(file);
              }}
            />
            <span style={{ pointerEvents: "none" }}>
              <Button variant="ghost" tone="accent" size="sm">📎 Загрузить файл</Button>
            </span>
          </label>
          <span style={{ fontSize: 11, color: $.txM }}>PDF, PNG, JPG и другие изображения</span>
        </Wrapper>
      )}

      {loading ? (
        <div style={{ color: $.txM, fontSize: 13, padding: "20px 0" }}>Загрузка...</div>
      ) : files.length === 0 ? (
        <div style={{ color: $.txM, fontSize: 13, padding: "20px 0" }}>
          {readOnly
            ? "Файлы анализов не загружены."
            : "Нет загруженных файлов. Загрузите PDF или скриншот анализа."}
        </div>
      ) : (
        <Card size="none" clip>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: "9px 14px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, fontWeight: 700, minWidth: 200 }}>Название</th>
                  <th style={{ padding: "9px 14px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, fontWeight: 700, minWidth: 130 }}>Дата анализа</th>
                  <th style={{ padding: "9px 14px", textAlign: "left", borderBottom: `2px solid ${$.ac}`, fontWeight: 700, minWidth: 220 }}>Комментарий</th>
                  <th style={{ padding: "9px 8px", borderBottom: `2px solid ${$.ac}`, minWidth: 72 }} />
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id} style={{ borderBottom: `1px solid ${$.brd}` }}>
                    <td style={{ padding: "8px 14px", fontWeight: 600 }}>
                      <Ed
                        readOnly={readOnly}
                        value={file.display_name || file.original_name}
                        editKey={`af-name-${file.id}`}
                        onSave={(v) => onUpdateField(file.id, "display_name", v)}
                        emptyLabel={file.original_name || "—"}
                      />
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <MiniDatePicker
                        readOnly={readOnly}
                        value={file.analysis_date || ""}
                        onChange={(v) => onUpdateField(file.id, "analysis_date", v)}
                      />
                    </td>
                    <td style={{ padding: "8px 14px", color: $.txS }}>
                      <Ed
                        readOnly={readOnly}
                        value={file.comment || ""}
                        editKey={`af-comment-${file.id}`}
                        onSave={(v) => onUpdateField(file.id, "comment", v)}
                        emptyLabel="Добавить комментарий..."
                      />
                    </td>
                    <td style={{ padding: "8px 8px" }}>
                      <Wrapper dir="row" gap={4} align="center">
                        <Button
                          variant="ghost"
                          size="xs"
                          tone="accent"
                          onClick={() => onDownload(file.id, file.display_name || file.original_name)}
                          title="Скачать"
                        >
                          ↓
                        </Button>
                        {!readOnly && (
                          <Button
                            variant="bare"
                            tone="danger"
                            size="xs"
                            onClick={() => onDelete(file.id)}
                            title="Удалить"
                          >
                            ✕
                          </Button>
                        )}
                      </Wrapper>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
