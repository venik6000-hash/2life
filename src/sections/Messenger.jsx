import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useMessenger } from "../context/MessengerContext";
import { useDashboard } from "../context/DashboardContext";

// ─── Emoji data (common subset, no external dep) ─────────────────────────────
const EMOJIS = [
  "😀","😂","🥰","😍","🤔","😊","😎","🥹","😢","😡","🤯","🥳","😴","🤒","💪",
  "👍","👎","👏","🙏","🤝","❤️","🔥","⭐","✅","❌","⚠️","💊","💉","🏥","🩺",
  "📋","📊","📅","📝","📎","🔗","📂","🗂️","📤","📥","🔒","🔓","💬","📞","✉️",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTime = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

const fmtDate = (ts) => {
  const d = new Date(ts);
  return d.toLocaleDateString("ru-RU", { day:"2-digit", month:"2-digit", year:"2-digit" });
};

const fmtSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const IMAGE_NAME_RE = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif|svg)$/i;
const isImageLike = (type, name, thumb) => {
  if (thumb) return true;
  const normalizedType = String(type || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return IMAGE_NAME_RE.test(String(name || ""));
};

const parseBundleMeta = (text) => {
  try {
    const parsed = JSON.parse(text || "{}");
    const items = Array.isArray(parsed?.files) ? parsed.files : [];
    return {
      bundleType: typeof parsed?.bundleType === "string" ? parsed.bundleType : null,
      files: items
        .map((item) => ({
          fileId: item?.fileId || item?.id || null,
          iv: item?.iv || null,
          name: item?.name || "Файл",
          type: item?.type || "application/octet-stream",
          size: Number(item?.size) || 0,
          thumb: item?.thumb || null,
        }))
        .filter((item) => item.fileId && item.iv),
    };
  } catch {
    return { bundleType: null, files: [] };
  }
};

const parseBundleFiles = (text) => parseBundleMeta(text).files;

const getPhotoBundleLayout = (count) => {
  const normalized = Math.max(1, Math.min(10, Number(count) || 1));
  const tiles = Array.from({ length: normalized }, () => ({ colSpan: 1, rowSpan: 1 }));
  let cols = 2;
  let rowHeight = 96;

  switch (normalized) {
    case 1:
      cols = 1;
      rowHeight = 220;
      break;
    case 2:
      cols = 2;
      rowHeight = 120;
      break;
    case 3:
      cols = 2;
      rowHeight = 96;
      tiles[0] = { colSpan: 1, rowSpan: 2 };
      break;
    case 4:
      cols = 2;
      rowHeight = 95;
      break;
    case 5:
      cols = 3;
      rowHeight = 80;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      break;
    case 6:
      cols = 3;
      rowHeight = 78;
      break;
    case 7:
      cols = 4;
      rowHeight = 66;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      break;
    case 8:
      cols = 4;
      rowHeight = 64;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      tiles[1] = { colSpan: 2, rowSpan: 2 };
      break;
    case 9:
      cols = 3;
      rowHeight = 74;
      break;
    default:
      cols = 4;
      rowHeight = 62;
      tiles[0] = { colSpan: 2, rowSpan: 2 };
      break;
  }

  return { cols, rowHeight, tiles };
};

const isClientRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "viewer" || normalized === "client";
};

const formatRoleLabel = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "viewer" || normalized === "client") return "Клиент";
  if (normalized === "admin") return "Администратор";
  if (normalized === "doctor") return "Врач";
  if (normalized === "nutritionist") return "Нутрициолог";
  return String(role || "").trim() || "Пользователь";
};

// ─── ReadReceipt ─────────────────────────────────────────────────────────────
function ReadReceipt({ messageId, chatReceipts, currentUserId, participants }) {
  const otherParticipants = (participants || []).filter((p) => p.user_id !== currentUserId);
  if (otherParticipants.length === 0) return <span style={{fontSize:10,opacity:.6}}>✓</span>;

  const readCount = otherParticipants.filter((p) => {
    const receipt = (chatReceipts || []).find((r) => r.user_id === p.user_id);
    return receipt && receipt.last_read_message_id >= messageId;
  }).length;

  const color = readCount === otherParticipants.length ? "#4fc3f7" : undefined;
  return (
    <span style={{fontSize:10,opacity:.8,color}}>
      {readCount > 0 ? "✓✓" : "✓"}
    </span>
  );
}

// ─── FileMessageBubble ────────────────────────────────────────────────────────
function FileMessageBubble({ msg, chatId, $, downloadFile, getFileUrl, onOpenImage }) {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const previewUrlRef = useRef("");
  const meta = useMemo(() => {
    try { return JSON.parse(msg.text); } catch { return { name: "Файл", type: "", size: 0 }; }
  }, [msg.text]);

  const isImage = msg.msg_type === "image" || isImageLike(meta?.type, meta?.name, meta?.thumb);

  const handleDownload = async () => {
    if (!meta?.iv) {
      setError("Не удалось открыть файл: отсутствуют данные шифрования");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const ok = await downloadFile(chatId, msg.file_id, meta.iv, meta.name, meta.type);
      if (!ok) setError("Не удалось расшифровать или скачать файл");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const revoke = () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = "";
      }
      setPreviewUrl("");
    };
    revoke();

    if (!isImage) return revoke;
    if (meta?.thumb) return revoke;
    if (!msg?.file_id || !meta?.iv) return revoke;

    let cancelled = false;
    setPreviewLoading(true);
    getFileUrl(chatId, msg.file_id, meta.iv, meta.type || "image/*")
      .then((url) => {
        if (!url) return;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        previewUrlRef.current = url;
        setPreviewUrl(url);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      revoke();
    };
  }, [chatId, getFileUrl, isImage, meta?.iv, meta?.thumb, meta?.type, msg?.file_id]);

  if (isImage) {
    const previewSrc = meta?.thumb || previewUrl;
    return (
      <div
        style={{cursor:"pointer",maxWidth:240,display:"flex",flexDirection:"column",gap:4}}
        onClick={() => onOpenImage?.({ fileId: msg.file_id, iv: meta?.iv, name: meta?.name, type: meta?.type || "image/*" })}
        title="Открыть изображение"
      >
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={meta?.name || "Изображение"}
            style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:8,display:"block",background:"rgba(255,255,255,.08)"}}
            loading="lazy"
          />
        ) : (
          <div style={{padding:"8px 10px",background:"rgba(255,255,255,.1)",borderRadius:6,fontSize:11,color:$.txS}}>
            🖼 Изображение<br/>
            <span style={{fontSize:10,opacity:.7}}>{meta?.size ? `${Math.round(meta.size/1024)} KB` : ""}</span>
          </div>
        )}
        {previewLoading && <div style={{fontSize:10,opacity:.6}}>Загрузка превью...</div>}
        {loading && <div style={{fontSize:10,opacity:.6,marginTop:2}}>Загрузка...</div>}
        {error && <div style={{fontSize:10,color:$.dn,marginTop:2}}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{cursor:"pointer"}} onClick={handleDownload}>
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:"rgba(255,255,255,.1)",borderRadius:6}}>
        <span style={{fontSize:16}}>📎</span>
        <div>
          <div style={{fontSize:12,fontWeight:600}}>{meta?.name || "Файл"}</div>
          <div style={{fontSize:10,opacity:.7}}>{meta?.size ? `${Math.round(meta.size/1024)} KB` : ""} {loading ? "· Загрузка..." : ""}</div>
        </div>
      </div>
      {error && <div style={{fontSize:10,color:$.dn,marginTop:2}}>{error}</div>}
    </div>
  );
}

function FileBundleBubble({ msg, chatId, $, downloadFile, downloadFiles, getFileUrl, onOpenImage }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previewMap, setPreviewMap] = useState({});
  const previewUrlsRef = useRef([]);
  const parsedBundle = useMemo(() => parseBundleMeta(msg.text), [msg.text]);
  const files = parsedBundle.files;
  const imageFiles = useMemo(() => (
    files.filter((file) => isImageLike(file.type, file.name, file.thumb))
  ), [files]);
  const nonImageFiles = useMemo(() => (
    files.filter((file) => !isImageLike(file.type, file.name, file.thumb))
  ), [files]);
  const isPhotoBundle = imageFiles.length > 0 && (
    parsedBundle.bundleType === "images" || nonImageFiles.length === 0
  );
  const visiblePhotos = useMemo(() => imageFiles.slice(0, 10), [imageFiles]);
  const photoLayout = useMemo(
    () => getPhotoBundleLayout(visiblePhotos.length || 1),
    [visiblePhotos.length]
  );

  useEffect(() => {
    const clearPreviewUrls = () => {
      for (const url of previewUrlsRef.current) URL.revokeObjectURL(url);
      previewUrlsRef.current = [];
      setPreviewMap({});
    };
    clearPreviewUrls();

    const candidates = imageFiles.filter((file) => !file.thumb);
    if (candidates.length === 0) return clearPreviewUrls;

    let cancelled = false;
    (async () => {
      const nextMap = {};
      for (const file of candidates) {
        try {
          const url = await getFileUrl(chatId, file.fileId, file.iv, file.type || "image/*");
          if (!url) continue;
          if (cancelled) {
            URL.revokeObjectURL(url);
            continue;
          }
          previewUrlsRef.current.push(url);
          nextMap[file.fileId] = url;
        } catch {
          // Ignore individual preview errors to keep rendering remaining files.
        }
      }
      if (!cancelled) setPreviewMap(nextMap);
    })();

    return () => {
      cancelled = true;
      clearPreviewUrls();
    };
  }, [chatId, imageFiles, getFileUrl]);

  const handleDownloadAll = async () => {
    if (files.length === 0) {
      setError("Не удалось прочитать список файлов");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await downloadFiles(chatId, files);
      if (!result?.ok) {
        if ((result?.downloaded || 0) === 0) {
          setError("Не удалось скачать файлы");
        } else {
          setError(`Скачано ${result.downloaded} из ${result.total}`);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadOne = async (file) => {
    setError("");
    const ok = await downloadFile(chatId, file.fileId, file.iv, file.name, file.type, { forceDownload: true });
    if (!ok) setError(`Не удалось скачать: ${file.name}`);
  };

  if (isPhotoBundle) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:230,maxWidth:340}}>
        <div
          style={{
            display:"grid",
            gridTemplateColumns:`repeat(${photoLayout.cols}, minmax(0, 1fr))`,
            gridAutoRows:`${photoLayout.rowHeight}px`,
            gridAutoFlow:"dense",
            gap:2,
            borderRadius:10,
            overflow:"hidden",
            background:"rgba(255,255,255,.08)",
          }}
        >
          {visiblePhotos.map((file, idx) => {
            const tile = photoLayout.tiles[idx] || { colSpan: 1, rowSpan: 1 };
            const previewSrc = file.thumb || previewMap[file.fileId];
            const hiddenTail = imageFiles.length - visiblePhotos.length;
            return (
              <button
                key={file.fileId}
                onClick={() => onOpenImage?.(file)}
                title="Открыть изображение"
                style={{
                  position:"relative",
                  border:"none",
                  cursor:"pointer",
                  padding:0,
                  margin:0,
                  background:"rgba(255,255,255,.08)",
                  color:"inherit",
                  gridColumn:`span ${tile.colSpan}`,
                  gridRow:`span ${tile.rowSpan}`,
                  minHeight:0,
                  minWidth:0,
                }}
              >
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="Фото"
                    loading="lazy"
                    style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
                  />
                ) : (
                  <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,opacity:.65}}>🖼</div>
                )}
                {idx === visiblePhotos.length - 1 && hiddenTail > 0 && (
                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.4)",color:"#fff",fontSize:16,fontWeight:700}}>
                    +{hiddenTail}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <div style={{fontSize:11,opacity:.75}}>🖼 Фото ({imageFiles.length})</div>
          <button
            onClick={handleDownloadAll}
            disabled={loading || files.length === 0}
            style={{
              border:"none",cursor:loading || files.length === 0 ? "default" : "pointer",
              fontSize:11,padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,.15)",color:"#fff",
              opacity:loading || files.length === 0 ? .65 : 1
            }}
          >
            {loading ? "..." : "Скачать все"}
          </button>
        </div>
        {error && <div style={{fontSize:10,color:$.dn}}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:230}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
        <div style={{fontSize:12,fontWeight:700}}>📎 Файлы ({files.length})</div>
        <button
          onClick={handleDownloadAll}
          disabled={loading || files.length === 0}
          style={{
            border:"none",cursor:loading || files.length === 0 ? "default" : "pointer",
            fontSize:11,padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,.15)",color:"#fff",
            opacity:loading || files.length === 0 ? .65 : 1
          }}
        >
          {loading ? "..." : "Скачать все"}
        </button>
      </div>

      {files.map((file) => (
        <button
          key={file.fileId}
          onClick={() => {
            if (isImageLike(file.type, file.name, file.thumb)) {
              onOpenImage?.(file);
            } else {
              handleDownloadOne(file);
            }
          }}
          style={{
            width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,
            padding:"6px 8px",border:"none",cursor:"pointer",borderRadius:6,
            background:"rgba(255,255,255,.1)",color:"inherit",textAlign:"left"
          }}
        >
          <span style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            {isImageLike(file.type, file.name, file.thumb) && (file.thumb || previewMap[file.fileId]) ? (
              <img
                src={file.thumb || previewMap[file.fileId]}
                alt={file.name}
                style={{width:42,height:42,objectFit:"cover",borderRadius:6,flexShrink:0,display:"block"}}
                loading="lazy"
              />
            ) : (
              <span style={{fontSize:15,opacity:.9,flexShrink:0}}>📄</span>
            )}
            <span style={{fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{file.name}</span>
          </span>
          <span style={{fontSize:10,opacity:.75,flexShrink:0}}>{fmtSize(file.size)}</span>
        </button>
      ))}
      {error && <div style={{fontSize:10,color:$.dn}}>{error}</div>}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine, $, chatReceipts, participants, currentUserId, chatId, downloadFile, downloadFiles, getFileUrl, onOpenImage, onContextMenu }) {
  const isFile = msg.msg_type === "file" || msg.msg_type === "image";
  const isBundle = msg.msg_type === "files_bundle";
  const bubbleBg = isMine ? $.ac : ($.bgC);
  const textColor = isMine ? "#fff" : $.tx;

  return (
    <div
      onContextMenu={(e) => onContextMenu?.(e, msg)}
      style={{display:"flex",flexDirection:"column",alignItems:isMine?"flex-end":"flex-start",marginBottom:6}}
    >
      {!isMine && (
        <span style={{fontSize:10,color:$.txM,marginLeft:8,marginBottom:2}}>{msg.sender_username}</span>
      )}
      <div style={{
        maxWidth:"72%", padding:"8px 12px", borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: bubbleBg, color: textColor,
        boxShadow:"0 1px 3px rgba(0,0,0,.12)", wordBreak:"break-word",
      }}>
        {isBundle ? (
          <FileBundleBubble msg={msg} chatId={chatId} $={$} downloadFile={downloadFile} downloadFiles={downloadFiles} getFileUrl={getFileUrl} onOpenImage={onOpenImage} />
        ) : isFile ? (
          <FileMessageBubble msg={msg} chatId={chatId} $={$} downloadFile={downloadFile} getFileUrl={getFileUrl} onOpenImage={onOpenImage} />
        ) : (
          <span style={{fontSize:14, lineHeight:1.45, whiteSpace:"pre-wrap"}}>{msg.text}</span>
        )}
        <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:4,marginTop:3}}>
          {msg.edited_at && (
            <span style={{fontSize:10,opacity:.55}}>ред.</span>
          )}
          <span style={{fontSize:10,opacity:.6}}>{fmtTime(msg.created_at)}</span>
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

// ─── EmojiPicker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onPick, $ }) {
  return (
    <div style={{
      position:"absolute", bottom:"100%", left:0, marginBottom:6, zIndex:10,
      background:$.bgC, border:`1px solid ${$.brd}`, borderRadius:10,
      padding:8, boxShadow:$.sh, display:"flex", flexWrap:"wrap",
      width:280, gap:4,
    }}>
      {EMOJIS.map((em) => (
        <button key={em} onClick={() => onPick(em)} style={{
          background:"none", border:"none", cursor:"pointer",
          fontSize:20, padding:"3px 4px", borderRadius:4,
          transition:"background .1s",
        }}
        onMouseEnter={(e)=>(e.currentTarget.style.background=$.acD)}
        onMouseLeave={(e)=>(e.currentTarget.style.background="none")}
        >{em}</button>
      ))}
    </div>
  );
}

// ─── ChatWindow ───────────────────────────────────────────────────────────────
function ChatWindow({
  chat, chats, $, user, messages,
  sendMsg, sendFiles, forwardMsg, editMsg, deleteMsg,
  markRead, downloadFile, downloadFiles, getFileUrl, showParticipants, setShowParticipants
}) {
  const [text, setText]               = useState("");
  const [showEmoji, setShowEmoji]     = useState(false);
  const [sending, setSending]         = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [editTarget, setEditTarget]   = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, msg }
  const [forwardTarget, setForwardTarget] = useState(null); // message object
  const [actionError, setActionError] = useState("");
  const [imageViewer, setImageViewer] = useState(null); // { items, index, url, name, loading, error }
  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);
  const imageViewerUrlRef = useRef("");
  const imageViewerReqRef = useRef(0);
  const imageViewerStateRef = useRef(null);
  const msgList    = messages[chat.id] || [];
  const chatReceipts = chat.receipts || [];
  const imageGallery = useMemo(() => {
    const items = [];

    for (const msg of msgList) {
      if (!msg) continue;

      if (msg.msg_type === "files_bundle") {
        const files = parseBundleFiles(msg.text).filter((file) => isImageLike(file.type, file.name, file.thumb));
        for (const file of files) {
          if (!file.fileId || !file.iv) continue;
          items.push({
            fileId: file.fileId,
            iv: file.iv,
            name: file.name || "Изображение",
            type: file.type || "image/*",
          });
        }
        continue;
      }

      if (msg.msg_type !== "image" && msg.msg_type !== "file") continue;
      if (!msg.file_id) continue;

      let meta = {};
      try {
        meta = JSON.parse(msg.text || "{}");
      } catch {
        meta = {};
      }

      const iv = meta?.iv;
      if (!iv) continue;

      const name = meta?.name || "Изображение";
      const type = meta?.type || (msg.msg_type === "image" ? "image/*" : "");
      if (!isImageLike(type, name, meta?.thumb)) continue;

      items.push({
        fileId: msg.file_id,
        iv,
        name,
        type: type || "image/*",
      });
    }

    return items;
  }, [msgList]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgList.length]);

  // Mark visible messages as read (last message)
  useEffect(() => {
    const last = msgList[msgList.length - 1];
    if (last && last.sender_id !== user.id) {
      markRead(chat.id, last.id);
    }
  }, [msgList.length, chat.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = () => setContextMenu(null);
    const closeOnEsc = (e) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setForwardTarget(null);
        closeImageViewer();
      }
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", closeOnEsc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", closeOnEsc);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    imageViewerStateRef.current = imageViewer;
  }, [imageViewer]);

  const closeImageViewer = useCallback(() => {
    imageViewerReqRef.current += 1;
    if (imageViewerUrlRef.current) {
      URL.revokeObjectURL(imageViewerUrlRef.current);
      imageViewerUrlRef.current = "";
    }
    setImageViewer(null);
  }, []);

  const loadImageViewerItem = useCallback(async (itemsInput, indexInput) => {
    const items = Array.isArray(itemsInput) ? itemsInput.filter(Boolean) : [];
    if (items.length === 0) {
      closeImageViewer();
      return;
    }

    const rawIndex = Number(indexInput) || 0;
    const index = ((rawIndex % items.length) + items.length) % items.length;
    const target = items[index];
    if (!target?.fileId || !target?.iv) {
      setImageViewer({
        items,
        index,
        url: "",
        name: target?.name || "Изображение",
        loading: false,
        error: "Не удалось открыть изображение",
      });
      return;
    }

    const reqId = imageViewerReqRef.current + 1;
    imageViewerReqRef.current = reqId;
    setImageViewer({
      items,
      index,
      url: "",
      name: target.name || "Изображение",
      loading: true,
      error: "",
    });

    let url = "";
    try {
      url = await getFileUrl(chat.id, target.fileId, target.iv, target.type || "image/*");
    } catch {
      url = "";
    }

    if (reqId !== imageViewerReqRef.current) {
      if (url) URL.revokeObjectURL(url);
      return;
    }

    if (imageViewerUrlRef.current) {
      URL.revokeObjectURL(imageViewerUrlRef.current);
      imageViewerUrlRef.current = "";
    }

    if (!url) {
      setImageViewer({
        items,
        index,
        url: "",
        name: target.name || "Изображение",
        loading: false,
        error: "Не удалось открыть изображение",
      });
      return;
    }

    imageViewerUrlRef.current = url;
    setImageViewer({
      items,
      index,
      url,
      name: target.name || "Изображение",
      loading: false,
      error: "",
    });
  }, [chat.id, getFileUrl, closeImageViewer]);

  useEffect(() => {
    return () => {
      imageViewerReqRef.current += 1;
      if (imageViewerUrlRef.current) {
        URL.revokeObjectURL(imageViewerUrlRef.current);
        imageViewerUrlRef.current = "";
      }
    };
  }, []);

  const openImageViewer = useCallback((fileMeta) => {
    const fileId = fileMeta?.fileId || fileMeta?.id;
    const iv = fileMeta?.iv;
    const name = fileMeta?.name || "Изображение";
    const type = fileMeta?.type || "image/*";
    if (!fileId || !iv) {
      setActionError("Не удалось открыть изображение");
      return;
    }

    let items = imageGallery;
    let startIndex = items.findIndex((item) => item.fileId === fileId && item.iv === iv);
    if (startIndex < 0) startIndex = items.findIndex((item) => item.fileId === fileId);

    if (startIndex < 0) {
      items = [{ fileId, iv, name, type }, ...items];
      startIndex = 0;
    }

    loadImageViewerItem(items, startIndex);
  }, [imageGallery, loadImageViewerItem]);

  const navigateImageViewer = useCallback((delta) => {
    const current = imageViewerStateRef.current;
    const items = current?.items || [];
    if (items.length <= 1) return;
    const nextIndex = ((current.index + delta) % items.length + items.length) % items.length;
    loadImageViewerItem(items, nextIndex);
  }, [loadImageViewerItem]);

  useEffect(() => {
    if (!imageViewer) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateImageViewer(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateImageViewer(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imageViewer, navigateImageViewer]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setActionError("");

    let ok = false;
    if (editTarget?.id) {
      ok = await editMsg(chat.id, editTarget.id, trimmed);
    } else {
      ok = await sendMsg(chat.id, trimmed);
    }

    if (ok) {
      setText("");
      setEditTarget(null);
    } else {
      setActionError(editTarget ? "Не удалось отредактировать сообщение" : "Не удалось отправить сообщение");
    }
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleFile = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setSending(true);
    setActionError("");
    const result = await sendFiles(chat.id, selected);
    if (!result?.ok) {
      if ((result?.sent || 0) === 0) {
        setActionError("Не удалось отправить файлы");
      } else {
        const shortFailed = (result.failed || []).slice(0, 3).join(", ");
        const tail = (result.failed || []).length > 3 ? "…" : "";
        setActionError(`Отправлено ${result.sent} из ${result.total}. Ошибка: ${shortFailed}${tail}`);
      }
    }
    setSending(false);
    e.target.value = "";
  };

  const handleEmojiPick = (em) => {
    setText((t) => t + em);
    setShowEmoji(false);
  };

  const handleMessageContext = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, msg });
  };

  const handleStartEdit = (msg) => {
    setEditTarget(msg);
    setText(msg.text || "");
    setShowEmoji(false);
    setContextMenu(null);
  };

  const handleDelete = async (msg, scope) => {
    setContextMenu(null);
    const title = scope === "all" ? "Удалить сообщение у всех?" : "Удалить сообщение только у себя?";
    if (!window.confirm(title)) return;
    const ok = await deleteMsg(chat.id, msg.id, scope);
    if (!ok) setActionError("Не удалось удалить сообщение");
  };

  const handleForward = (msg) => {
    setContextMenu(null);
    setForwardTarget(msg);
  };

  const handleForwardToChat = async (targetChatId) => {
    if (!forwardTarget) return;
    setSending(true);
    setActionError("");
    const ok = await forwardMsg(chat.id, forwardTarget.id, targetChatId);
    if (!ok) setActionError("Не удалось переслать сообщение");
    setSending(false);
    if (ok) setForwardTarget(null);
  };

  // Group messages by date for date separators
  const grouped = [];
  let lastDate = null;
  for (const msg of msgList) {
    const d = fmtDate(msg.created_at);
    if (d !== lastDate) { grouped.push({ type: "date", d }); lastDate = d; }
    grouped.push({ type: "msg", msg });
  }

  const canEdit = contextMenu?.msg && contextMenu.msg.sender_id === user.id && contextMenu.msg.msg_type === "text";
  const canDeleteForAll = contextMenu?.msg && (contextMenu.msg.sender_id === user.id || user.role === "admin");
  const forwardChats = (chats || []).filter((c) => c.id !== chat.id);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      {/* Header */}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${$.brd}`,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14}}>{chat.title}</div>
          <div style={{fontSize:11,color:$.txM}}>
            {(chat.participants||[]).map((p)=>p.username).join(", ")}
          </div>
        </div>
        <button
          onClick={()=>setShowParticipants(!showParticipants)}
          title="Участники"
          style={{background:$.acD,border:"none",borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:12,color:$.ac,fontWeight:600}}
        >
          👥 {(chat.participants||[]).length}
        </button>
      </div>

      {/* Messages */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column"}}>
        {msgList.length === 0 && (
          <div style={{margin:"auto",textAlign:"center",color:$.txM,fontSize:13}}>
            <div style={{fontSize:32,marginBottom:8}}>💬</div>
            Сообщений пока нет.<br/>Начните переписку!
          </div>
        )}
        {grouped.map((item, i) => item.type === "date"
          ? <div key={`d-${i}`} style={{textAlign:"center",fontSize:11,color:$.txM,margin:"8px 0"}}>
              <span style={{background:$.bgI,padding:"2px 10px",borderRadius:10}}>{item.d}</span>
            </div>
          : <MessageBubble
              key={item.msg.id}
              msg={item.msg}
              isMine={item.msg.sender_id === user.id}
              $={$}
              chatReceipts={chatReceipts}
              participants={chat.participants}
              currentUserId={user.id}
              chatId={chat.id}
              downloadFile={downloadFile}
              downloadFiles={downloadFiles}
              getFileUrl={getFileUrl}
              onOpenImage={openImageViewer}
              onContextMenu={handleMessageContext}
            />
        )}
        {typingUsers.length > 0 && (
          <div style={{fontSize:11,color:$.txM,marginLeft:4}}>
            {typingUsers.join(", ")} печатает...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{padding:"10px 14px",borderTop:`1px solid ${$.brd}`,flexShrink:0}}>
        {editTarget && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,padding:"6px 10px",borderRadius:8,background:$.bgI,border:`1px solid ${$.brd}`}}>
            <div style={{fontSize:11,color:$.txM,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              Редактирование: {editTarget.text?.slice(0, 80)}
            </div>
            <button
              onClick={() => { setEditTarget(null); setText(""); }}
              style={{background:"none",border:"none",cursor:"pointer",fontSize:11,color:$.dn}}
            >
              Отмена
            </button>
          </div>
        )}
        <div style={{display:"flex",gap:8,alignItems:"flex-end",position:"relative"}}>
          {showEmoji && <EmojiPicker onPick={handleEmojiPick} $={$} />}

          {/* Emoji button */}
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            style={{background:"none",border:"none",cursor:"pointer",fontSize:20,padding:"4px",color:$.txS,flexShrink:0,lineHeight:1}}
          >😊</button>

          {/* File attach */}
          <button
            onClick={() => fileRef.current?.click()}
            title="Прикрепить файлы"
            style={{background:"none",border:"none",cursor:"pointer",fontSize:18,padding:"4px",color:$.txS,flexShrink:0,lineHeight:1}}
          >📎</button>
          <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={handleFile} />

          {/* Text input */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder={editTarget ? "Измените сообщение..." : "Сообщение... (Enter — отправить, Shift+Enter — новая строка)"}
            style={{
              flex:1, resize:"none", minHeight:40, maxHeight:120,
              padding:"8px 12px", borderRadius:10,
              border:`1px solid ${$.brd}`, background:$.bgI,
              color:$.tx, fontSize:13, fontFamily:"inherit", outline:"none",
              lineHeight:1.5,
            }}
            rows={1}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              background:$.ac, color:"#fff", border:"none", borderRadius:10,
              width:40, height:40, cursor:text.trim()?"pointer":"default",
              fontSize:18, flexShrink:0, opacity:text.trim()?1:.4,
              display:"flex",alignItems:"center",justifyContent:"center",
            }}
          >{editTarget ? "✓" : "➤"}</button>
        </div>
        {actionError && (
          <div style={{fontSize:11,color:$.dn,marginTop:6,paddingLeft:4}}>{actionError}</div>
        )}
        <div style={{fontSize:10,color:$.txM,marginTop:4,paddingLeft:4}}>
          🔒 Сообщения зашифрованы
        </div>
      </div>

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position:"fixed",
            top:Math.min(contextMenu.y, window.innerHeight - 190),
            left:Math.min(contextMenu.x, window.innerWidth - 220),
            width:210,
            background:$.bgC,
            border:`1px solid ${$.brd}`,
            borderRadius:10,
            boxShadow:$.sh,
            zIndex:9999,
            padding:6,
          }}
        >
          <button onClick={() => handleForward(contextMenu.msg)} style={{width:"100%",textAlign:"left",padding:"8px 10px",background:"none",border:"none",cursor:"pointer",borderRadius:6,color:$.tx,fontSize:13}}>Переслать</button>
          {canEdit && (
            <button onClick={() => handleStartEdit(contextMenu.msg)} style={{width:"100%",textAlign:"left",padding:"8px 10px",background:"none",border:"none",cursor:"pointer",borderRadius:6,color:$.tx,fontSize:13}}>Редактировать</button>
          )}
          <button onClick={() => handleDelete(contextMenu.msg, "self")} style={{width:"100%",textAlign:"left",padding:"8px 10px",background:"none",border:"none",cursor:"pointer",borderRadius:6,color:$.tx,fontSize:13}}>Удалить у себя</button>
          {canDeleteForAll && (
            <button onClick={() => handleDelete(contextMenu.msg, "all")} style={{width:"100%",textAlign:"left",padding:"8px 10px",background:"none",border:"none",cursor:"pointer",borderRadius:6,color:$.dn,fontSize:13}}>Удалить у всех</button>
          )}
        </div>
      )}

      {forwardTarget && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.25)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9998}}>
          <div style={{width:360,maxWidth:"92vw",maxHeight:"70vh",overflowY:"auto",background:$.bgC,border:`1px solid ${$.brd}`,borderRadius:12,boxShadow:$.sh}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${$.brd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontWeight:700,fontSize:14}}>Переслать сообщение</div>
              <button onClick={() => setForwardTarget(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:$.txS}}>✕</button>
            </div>
            <div style={{padding:10}}>
              {forwardChats.length === 0 && (
                <div style={{fontSize:12,color:$.txM}}>Нет других чатов для пересылки</div>
              )}
              {forwardChats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleForwardToChat(c.id)}
                  style={{width:"100%",textAlign:"left",padding:"9px 10px",background:"none",border:`1px solid ${$.brd}`,borderRadius:8,cursor:"pointer",fontSize:13,color:$.tx,marginBottom:6}}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {imageViewer && (
        <div
          onClick={closeImageViewer}
          style={{position:"fixed",inset:0,background:"rgba(10,10,12,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10001,padding:24}}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closeImageViewer(); }}
            style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:18}}
            title="Закрыть"
          >
            ✕
          </button>
          {(imageViewer.items || []).length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); navigateImageViewer(-1); }}
              style={{
                position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",
                background:"rgba(255,255,255,.18)",border:"none",color:"#fff",width:42,height:42,
                borderRadius:"50%",cursor:"pointer",fontSize:22,lineHeight:1
              }}
              title="Предыдущее изображение"
            >
              ‹
            </button>
          )}
          {(imageViewer.items || []).length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); navigateImageViewer(1); }}
              style={{
                position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",
                background:"rgba(255,255,255,.18)",border:"none",color:"#fff",width:42,height:42,
                borderRadius:"50%",cursor:"pointer",fontSize:22,lineHeight:1
              }}
              title="Следующее изображение"
            >
              ›
            </button>
          )}
          <div onClick={(e) => e.stopPropagation()} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,maxWidth:"96vw",maxHeight:"90vh"}}>
            {imageViewer.loading && (
              <div style={{color:"rgba(255,255,255,.84)",fontSize:13}}>Загрузка изображения...</div>
            )}
            {!imageViewer.loading && imageViewer.url && (
              <img
                src={imageViewer.url}
                alt={imageViewer.name || "Изображение"}
                style={{maxWidth:"96vw",maxHeight:"84vh",objectFit:"contain",borderRadius:8,boxShadow:"0 6px 28px rgba(0,0,0,.35)"}}
              />
            )}
            {!imageViewer.loading && !imageViewer.url && (
              <div style={{color:"rgba(255,255,255,.84)",fontSize:13}}>{imageViewer.error || "Не удалось открыть изображение"}</div>
            )}
            {(imageViewer.items || []).length > 1 && (
              <div style={{color:"rgba(255,255,255,.92)",fontSize:12,textAlign:"center"}}>
                {imageViewer.index + 1}/{imageViewer.items.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ParticipantsPanel ────────────────────────────────────────────────────────
function ParticipantsPanel({ chat, $, user, addParticipant, removeParticipant, onClose }) {
  const { authFetch } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [adding, setAdding]     = useState(false);
  const [addError, setAddError] = useState("");

  const isOwner = (chat.participants || []).find((p) => p.user_id === user.id)?.role_in_chat === "owner"
    || user.role === "admin";
  const canManageParticipants = isOwner && !isClientRole(user.role);

  useEffect(() => {
    if (!canManageParticipants) {
      setAllUsers([]);
      setUsersError("");
      setUsersLoading(false);
      return;
    }

    let cancelled = false;
    const normalizeUsers = (rows = []) => rows
      .filter((u) => u && u.id != null && u.username)
      .filter((u) => u.active !== false)
      .map((u) => ({ id: Number(u.id), username: String(u.username), role: String(u.role || "") }));

    const fetchUsers = async () => {
      setUsersLoading(true);
      setUsersError("");
      try {
        // Для admin сначала используем /api/admin/users (основной источник user-management),
        // для остальных — /api/users. При сбое admin-эндпоинта fallback на /api/users.
        const preferred = user.role === "admin" ? "/api/admin/users" : "/api/users";
        const fallback  = user.role === "admin" ? "/api/users" : null;

        let res = await authFetch(preferred);
        if (!res.ok && fallback) res = await authFetch(fallback);
        if (!res.ok) throw new Error("Не удалось загрузить пользователей");

        const data = await res.json().catch(() => null);
        const users = normalizeUsers(data?.users || []);
        if (!cancelled) setAllUsers(users);
      } catch (e) {
        if (!cancelled) {
          setAllUsers([]);
          setUsersError(e.message || "Ошибка загрузки пользователей");
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    };

    fetchUsers();
    return () => { cancelled = true; };
  }, [authFetch, canManageParticipants, user.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const participantIds = new Set((chat.participants || []).map((p) => p.user_id));
  const available = allUsers.filter((u) => u.id !== user.id && !participantIds.has(u.id));

  const handleAdd = async (userId, username) => {
    setAdding(userId);
    setAddError("");
    const result = await addParticipant(chat.id, userId);
    if (result !== true) {
      setAddError(
        result === "no_key"
          ? `${username} ещё не открывал(а) мессенджер — попросите его войти в чат хотя бы раз`
          : result || "Не удалось добавить участника"
      );
    }
    setAdding(false);
  };

  const handleRemove = async (userId) => {
    if (!window.confirm("Удалить участника из чата?")) return;
    await removeParticipant(chat.id, userId);
  };

  return (
    <div style={{width:230,borderLeft:`1px solid ${$.brd}`,background:$.bgC,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"10px 12px",borderBottom:`1px solid ${$.brd}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:700,fontSize:13}}>Участники</span>
        <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:$.txS,fontSize:16}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:10}}>

        {/* Current participants */}
        {(chat.participants || []).map((p) => (
          <div key={p.user_id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",borderRadius:6,marginBottom:2}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:$.ac,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>
              {(p.username||"?")[0].toUpperCase()}
            </div>
            <div style={{flex:1,overflow:"hidden"}}>
              <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>{p.username}</div>
              <div style={{fontSize:10,color:$.txM}}>{formatRoleLabel(p.role)} · {p.role_in_chat === "owner" ? "владелец" : "участник"}</div>
            </div>
            {canManageParticipants && p.user_id !== user.id && (
              <button onClick={() => handleRemove(p.user_id)} title="Удалить" style={{background:"none",border:"none",cursor:"pointer",color:$.dn,fontSize:13}}>✕</button>
            )}
          </div>
        ))}

        {/* Error message */}
        {addError && (
          <div style={{margin:"8px 0",padding:"7px 10px",borderRadius:6,background:"rgba(239,83,80,.1)",border:`1px solid ${$.dn}44`,fontSize:11,color:$.dn,lineHeight:1.4}}>
            ⚠️ {addError}
          </div>
        )}

        {/* Add participants */}
        {canManageParticipants && (
          <>
            <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",color:$.txM,marginTop:12,marginBottom:6,letterSpacing:.6}}>
              Добавить в чат
            </div>
            {usersLoading && (
              <div style={{fontSize:12,color:$.txM}}>Загрузка пользователей...</div>
            )}
            {!usersLoading && usersError && (
              <div style={{fontSize:12,color:$.dn}}>{usersError}</div>
            )}
            {!usersLoading && !usersError && available.length === 0 && (
              <div style={{fontSize:12,color:$.txM}}>Все пользователи уже в чате</div>
            )}
            {!usersLoading && !usersError && available.map((u) => (
              <div key={u.id}
                style={{display:"flex",alignItems:"center",gap:8,padding:"6px 4px",borderRadius:6,marginBottom:2,cursor:adding===u.id?"default":"pointer",opacity:adding===u.id ? .6 : 1}}
                onClick={() => adding || handleAdd(u.id, u.username)}
              >
                <div style={{width:26,height:26,borderRadius:"50%",background:$.bgI,border:`1px solid ${$.brd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>
                  {u.username[0].toUpperCase()}
                </div>
                <div style={{flex:1,fontSize:12}}>
                  {u.username} <span style={{color:$.txM,fontSize:10}}>({formatRoleLabel(u.role)})</span>
                </div>
                <span style={{color:adding===u.id?$.txM:$.ac,fontSize:13,fontWeight:700}}>
                  {adding === u.id ? "…" : "+"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ChatList ─────────────────────────────────────────────────────────────────
function ChatList({ chats, activeChatId, setActiveChatId, $, user, createNewChat, clientId, messages, canCreateChat }) {
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!canCreateChat || !clientId || creating) return;
    const existing = chats.find((c) => c.client_id === clientId);
    if (existing) {
      setActiveChatId(existing.id);
      return;
    }
    setCreating(true);
    const created = await createNewChat(clientId, "Чат", []);
    if (created?.id) setActiveChatId(created.id);
    setCreating(false);
  };

  const getUnreadCount = (chat) => {
    const myReceipt = (chat.receipts || []).find((r) => r.user_id === user.id);
    const msgs = messages[chat.id] || [];
    const unread = msgs.filter((m) =>
      m.sender_id !== user.id &&
      (!myReceipt || m.id > myReceipt.last_read_message_id)
    );
    return unread.length;
  };

  const getLastMessagePreview = (last) => {
    if (!last) return "Нет сообщений";
    if (last.msg_type === "files_bundle") {
      const files = parseBundleFiles(last.text);
      if (files.length === 0) return "📎 Файлы";
      const allImages = files.every((file) => isImageLike(file.type, file.name, file.thumb));
      return allImages ? `🖼 Фото (${files.length})` : `📎 Файлы (${files.length})`;
    }
    if (last.msg_type === "image") return "🖼 Фото";
    if (last.msg_type === "file") return "📎 Файл";
    const text = String(last.text || "");
    if (!text) return "Нет сообщений";
    return text.length > 40 ? `${text.slice(0, 40)}…` : text;
  };

  return (
    <div style={{width:240,minWidth:240,borderRight:`1px solid ${$.brd}`,display:"flex",flexDirection:"column",background:$.bgC}}>
      <div style={{padding:"12px 14px",borderBottom:`1px solid ${$.brd}`,fontWeight:700,fontSize:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>💬 Чаты</span>
        {canCreateChat && (
          <button
            title="Новый чат"
            onClick={handleCreate}
            disabled={creating || !clientId}
            style={{
              background:$.ac,color:"#fff",border:"none",borderRadius:6,width:26,height:26,
              cursor:creating || !clientId ? "default" : "pointer",
              opacity:creating || !clientId ? .5 : 1,
              fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"
            }}
          >+</button>
        )}
      </div>

      <div style={{flex:1,overflowY:"auto"}}>
        {chats.length === 0 && (
          <div style={{padding:16,fontSize:12,color:$.txM,textAlign:"center"}}>
            Нет доступных чатов.
          </div>
        )}
        {chats.map((c) => {
          const unread = getUnreadCount(c);
          const msgs   = messages[c.id] || [];
          const last   = msgs[msgs.length - 1];
          return (
            <div
              key={c.id}
              onClick={() => setActiveChatId(c.id)}
              style={{
                padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${$.brd}`,
                background: c.id === activeChatId ? $.acD : "transparent",
                transition:"background .1s",
              }}
            >
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <span style={{fontWeight:600,fontSize:13,color:c.id===activeChatId?$.ac:$.tx}}>{c.title}</span>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                  {last && <span style={{fontSize:10,color:$.txM}}>{fmtTime(last.created_at)}</span>}
                  {unread > 0 && <span style={{background:$.ac,color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:18,textAlign:"center"}}>{unread}</span>}
                </div>
              </div>
              <div style={{fontSize:11,color:$.txM,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {getLastMessagePreview(last)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── UnlockScreen ────────────────────────────────────────────────────────────
function UnlockScreen({ $, unlockCrypto, cryptoError }) {
  const [pwd, setPwd]   = useState("");
  const [busy, setBusy] = useState(false);

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!pwd) return;
    setBusy(true);
    await unlockCrypto(pwd);
    setBusy(false);
  };

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",padding:40}}>
      <div style={{textAlign:"center",maxWidth:380}}>
        <div style={{fontSize:40,marginBottom:12}}>🔐</div>
        <div style={{fontSize:17,fontWeight:700,marginBottom:6}}>Мессенджер зашифрован</div>
        <div style={{fontSize:13,color:$.txM,marginBottom:20}}>
          Введите пароль, чтобы разблокировать переписку.<br/>
          Ваши сообщения зашифрованы сквозным шифрованием и не могут быть прочитаны сервером.
        </div>
        <form onSubmit={handleUnlock} style={{display:"flex",gap:8,justifyContent:"center"}}>
          <input
            type="password"
            placeholder="Пароль"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoFocus
            style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${$.brd}`,background:$.bgI,color:$.tx,fontSize:13,fontFamily:"inherit",outline:"none",minWidth:200}}
          />
          <button
            type="submit"
            disabled={busy || !pwd}
            style={{padding:"8px 18px",borderRadius:8,border:"none",background:$.ac,color:"#fff",cursor:pwd?"pointer":"default",fontWeight:600,fontSize:13,fontFamily:"inherit",opacity:pwd?1:.5}}
          >{busy ? "..." : "Разблокировать"}</button>
        </form>
        {cryptoError && (
          <div style={{marginTop:10,color:$.dn,fontSize:12}}>{cryptoError}</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Messenger Section ───────────────────────────────────────────────────
export default function MessengerSection() {
  const { $ }    = useTheme();
  const { user } = useAuth();
  const { cid, cls, isAdmin }  = useDashboard();
  const {
    cryptoReady, cryptoError, wsConnected,
    chats, chatsLoaded, activeChatId, setActiveChatId, messages,
    unlockCrypto,
    loadChats, loadMessages, sendMsg, sendFiles, forwardMsg, editMsg, deleteMsg, downloadFile, downloadFiles, getFileUrl, markRead,
    createNewChat, addParticipant, removeParticipant,
  } = useMessenger();

  const [showParticipants, setShowParticipants] = useState(false);
  const autoCreateRef = useRef(false);
  const activeChat = chats.find((c) => c.id === activeChatId) || null;
  const canCreateChat = !isClientRole(user?.role);
  const hasGlobalClientAccess = isAdmin || !!user?.all_clients_access;

  // Load chats when client changes or crypto becomes ready
  useEffect(() => {
    if (!cryptoReady) return;
    if (!hasGlobalClientAccess && !cid) return;
    loadChats(hasGlobalClientAccess ? undefined : cid);
  }, [cryptoReady, hasGlobalClientAccess, cid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin: auto-create one default chat for each client if missing.
  useEffect(() => {
    if (!cryptoReady || !isAdmin || !chatsLoaded || !Array.isArray(cls) || cls.length === 0) return;
    if (autoCreateRef.current) return;

    const existingByClient = new Set(chats.map((c) => c.client_id));
    const missingClients = cls.filter((client) => !existingByClient.has(client.id));
    if (missingClients.length === 0) return;

    autoCreateRef.current = true;
    (async () => {
      for (const client of missingClients) {
        const title = client.shortName || client.name || "Чат";
        await createNewChat(client.id, title, []);
      }
      await loadChats();
    })().finally(() => {
      autoCreateRef.current = false;
    });
  }, [cryptoReady, isAdmin, chatsLoaded, cls, chats, createNewChat, loadChats]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChatId || !cryptoReady) return;
    if (!messages[activeChatId]) loadMessages(activeChatId);
  }, [activeChatId, cryptoReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cryptoReady) {
    return <UnlockScreen $={$} unlockCrypto={unlockCrypto} cryptoError={cryptoError} />;
  }

  return (
    <div style={{display:"flex",height:"100%",minHeight:0,borderRadius:10,overflow:"hidden",border:`1px solid ${$.brd}`}}>
      {/* Chat list */}
      <ChatList
        chats={chats}
        activeChatId={activeChatId}
        setActiveChatId={setActiveChatId}
        $={$}
        user={user}
        createNewChat={createNewChat}
        clientId={cid}
        messages={messages}
        canCreateChat={canCreateChat}
      />

      {/* Main area */}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,background:$.bg}}>
        {/* Connection indicator */}
        {!wsConnected && (
          <div style={{padding:"4px 12px",background:"#f59e0b",color:"#fff",fontSize:11,fontWeight:600,textAlign:"center"}}>
            ⚡ Переподключение...
          </div>
        )}

        {activeChat ? (
          <div style={{flex:1,display:"flex",minHeight:0}}>
            <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
              <ChatWindow
                chat={activeChat}
                chats={chats}
                $={$}
                user={user}
                messages={messages}
                sendMsg={sendMsg}
                sendFiles={sendFiles}
                forwardMsg={forwardMsg}
                editMsg={editMsg}
                deleteMsg={deleteMsg}
                markRead={markRead}
                downloadFile={downloadFile}
                downloadFiles={downloadFiles}
                getFileUrl={getFileUrl}
                showParticipants={showParticipants}
                setShowParticipants={setShowParticipants}
              />
            </div>
            {showParticipants && (
              <ParticipantsPanel
                chat={activeChat}
                $={$}
                user={user}
                addParticipant={addParticipant}
                removeParticipant={removeParticipant}
                onClose={() => setShowParticipants(false)}
              />
            )}
          </div>
        ) : (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:$.txM,flexDirection:"column",gap:8}}>
            <span style={{fontSize:36}}>💬</span>
            <span style={{fontSize:14}}>Выберите чат или создайте новый</span>
          </div>
        )}
      </div>
    </div>
  );
}
