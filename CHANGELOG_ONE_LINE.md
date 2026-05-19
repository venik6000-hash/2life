# One-Line Change Log

Формат: `YYYY-MM-DD | область | изменение`

2026-05-19 | Messenger | Денормализован last_message на chats; sync replay обновляет превью при reconnect (Layer 1).
2026-04-03 | RBAC | Добавлены роли и права в БД (`roles`, `role_sections`, `role_permissions`) и выдача `permissions` через `/api/auth/me`.
2026-04-03 | RBAC | Реализована серверная проверка прав для `PATCH /api/clients/:id` и `PUT /api/clients/:id` с atomic-отклонением при запрете.
2026-04-03 | UI/Permissions | Реализована политика: нет `read` — раздел скрыт; есть `read` и нет `write` — раздел виден в read-only.
2026-04-03 | Admin/Users | В админке добавлены удаление пользователя и смена пароля пользователя.
2026-04-03 | Access | Добавлен флаг `users.all_clients_access` (доступ ко всем клиентам без выдачи роли admin).
2026-04-03 | Access | Привязка врача к аккаунту переведена в БД (`doctors.user_id`) и автоматические назначения в `client_assignments`.
2026-04-03 | Admin/UI | В карточке пользователя добавлен актуальный список назначенных клиентов.
2026-04-03 | Admin/UI | Удалена кнопка отключения аккаунта в интерфейсе админ-панели.
2026-04-03 | Analytics/UI | Исправлено read-only поведение и убраны артефакты отображения строк при скролле.
2026-04-03 | Roles/API | Исправлено сохранение read/write в ролях: частичные обновления теперь не сбрасывают второй флаг.
2026-04-03 | Docs | Добавлен `CHANGELOG_ONE_LINE.md`, обновлены `README.md` и `ARCHITECTURE.md` до актуального состояния.
2026-04-07 | Security | Rate limiting на `POST /api/auth/login`: макс. 5 попыток в минуту с одного IP+логина (express-rate-limit).
2026-04-07 | Security | Серверная инвалидация JWT при логауте: jti-blacklist в `tokenBlacklist.js`, новый эндпоинт `POST /api/auth/logout`.
2026-04-07 | Security | JWT_SECRET убран из публичного экспорта middleware; вместо него `signToken()` — единственная точка подписи токенов.
2026-04-07 | Security | Токены содержат `jti` (crypto.randomUUID) для поддержки точечного отзыва без инвалидации всех сессий.
2026-04-07 | Security | bcrypt cost factor повышен с 10 до 12, все вызовы `hashSync` заменены на async `bcrypt.hash/compare`.
2026-04-07 | Security | Минимальная длина пароля увеличена с 6 до 8 символов во всех эндпоинтах.
2026-04-07 | Security | `docker-compose.yml`: слабые fallback-значения (`admin123`, `change-this-secret`) заменены на `:?`-ошибки — контейнер не стартует без явно заданных секретов.
2026-04-07 | Security | Восстановлен `.env.example` с placeholder-значениями (был перезаписан реальными секретами).
2026-04-07 | Security | Все `res.status(500).json({ error: e.message })` заменены на `"Внутренняя ошибка сервера"` + `console.error` — внутренние детали не утекают клиенту.
2026-04-07 | Security | `AuthContext.jsx`: `logout()` теперь вызывает `POST /api/auth/logout` перед очисткой localStorage для серверной инвалидации токена.
2026-04-14 | Messenger/Architecture | Добавлен full-stack мессенджер: `MessengerProvider`, секция `messenger`, API-роуты `/api/chats*`/`/api/crypto*`, WebSocket-хаб `/ws`.
2026-04-14 | Messenger/Security | Реализованы одноразовые WS-тикеты (`POST /api/auth/ws-ticket`, TTL 30 сек) для безопасной браузерной аутентификации WebSocket.
2026-04-14 | Messenger/E2E | Внедрено сквозное шифрование: ECDH identity keys, AES-KW обёртка chat key, AES-GCM шифрование сообщений и файлов, хранение ciphertext+iv.
2026-04-14 | Messenger/Delivery | Исправлена доставка сообщений всем участникам чата (включая отправителя для multi-device) и моментальная выдача `chat_created` новому участнику.
2026-04-14 | Messenger/Receipts | Добавлены read receipts (`message_receipts`) и отображение статуса прочтения в UI (`✓✓`).
2026-04-14 | Messenger/Messages | Добавлены операции как в Telegram: редактирование text-сообщений, удаление `у себя`/`у всех`, пересылка в другой чат.
2026-04-14 | Messenger/Files | Добавлен обмен зашифрованными файлами/фото: upload `.enc`, inline-open после расшифровки, fallback на принудительное скачивание.
2026-04-14 | Messenger/Files | Реализована пакетная отправка и формат `files_bundle`, кнопка «Скачать все», скачивание отдельного файла из бандла.
2026-04-14 | Messenger/Photos | Фото-бандлы ограничены 10 фото на сообщение; при превышении отправка автоматически делится на несколько сообщений (например 14 = 10 + 4).
2026-04-14 | Messenger/Photos | Добавлены thumbnail-превью (в т.ч. fallback для старых сообщений), адаптивная telegram-style сетка фото без имён и overlay-просмотр без скачивания.
2026-04-14 | Messenger/Photos | В overlay добавлена навигация по фото клавишами `ArrowLeft/ArrowRight` и кнопками по бокам.
2026-04-14 | RBAC/Messenger | Роль `viewer` переименована в отображение «Клиент»; для клиентской роли оставлен только раздел `messenger`, запрещены создание чатов/добавление участников/просмотр списка пользователей.
2026-04-16 | Access/Messenger | Доступ к чатам синхронизирован с доступом к клиентам: `all_clients_access` и `client_assignments` автоматически добавляют/убирают `chat_participants`, включая автосинхронизацию при создании чата.
2026-04-16 | Auth/Messenger | `/api/auth/change-password` больше не требует старый пароль; при смене возвращается новый JWT, а ключи мессенджера переупаковываются без разрыва доступа к чатам/истории.
2026-04-16 | Auth/UI | В `Sidebar` добавлена кнопка выхода из аккаунта: logout отзывает серверную сессию, очищает локальный `dash_*`-кеш (кроме темы) и возвращает на экран логина.
