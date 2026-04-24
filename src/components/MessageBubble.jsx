import { useTheme } from "../context/ThemeContext";
import ReadReceipt from "./ReadReceipt";
import FileMessageBubble from "./FileMessageBubble";
import FileBundleBubble from "./FileBundleBubble";
import { fmtTime } from "../utils/messengerUiUtils";

export default function MessageBubble({
  msg, isMine, chatReceipts, participants, currentUserId,
  chatId, downloadFile, downloadFiles, getFileUrl, onOpenImage, onContextMenu,
}) {
  const { $ } = useTheme();
  const isFile = msg.msg_type === "file" || msg.msg_type === "image";
  const isBundle = msg.msg_type === "files_bundle";
  const bubbleBg = isMine ? $.ac : $.bgC;
  const textColor = isMine ? "#fff" : $.tx;

  return (
    <div
      onContextMenu={(e) => onContextMenu?.(e, msg)}
      style={{ display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", marginBottom: 6 }}
    >
      {!isMine && (
        <span style={{ fontSize: 10, color: $.txM, marginLeft: 8, marginBottom: 2 }}>{msg.sender_username}</span>
      )}
      <div style={{
        maxWidth: "72%", padding: "8px 12px",
        borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: bubbleBg, color: textColor,
        boxShadow: "0 1px 3px rgba(0,0,0,.12)", wordBreak: "break-word",
      }}>
        {isBundle ? (
          <FileBundleBubble msg={msg} chatId={chatId} downloadFile={downloadFile} downloadFiles={downloadFiles} getFileUrl={getFileUrl} onOpenImage={onOpenImage} />
        ) : isFile ? (
          <FileMessageBubble msg={msg} chatId={chatId} downloadFile={downloadFile} getFileUrl={getFileUrl} onOpenImage={onOpenImage} />
        ) : (
          <span style={{ fontSize: 14, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{msg.text}</span>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
          {msg.edited_at && <span style={{ fontSize: 10, opacity: .55 }}>ред.</span>}
          <span style={{ fontSize: 10, opacity: .6 }}>{fmtTime(msg.created_at)}</span>
          {isMine && (
            <ReadReceipt
              messageId={msg.id}
              chatReceipts={chatReceipts}
              currentUserId={currentUserId}
              participants={participants}
            />
          )}
        </div>
      </div>
    </div>
  );
}
