// Менеджер SSE-соединений (Server-Sent Events).
// Каждый браузер держит открытое соединение с сервером.
// Когда кто-то сохраняет изменения — сервер мгновенно уведомляет остальных.

const connections = new Set();

// Добавить новое соединение (вызывается при GET /api/events)
const addConnection = (res) => {
  connections.add(res);
};

// Удалить соединение (вызывается когда браузер закрыл вкладку)
const removeConnection = (res) => {
  connections.delete(res);
};

// Отправить событие всем подключённым браузерам.
// excludeRes — соединение которое само инициировало изменение (ему не нужно слать обратно).
const broadcast = (event, data, excludeRes = null) => {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of connections) {
    if (res === excludeRes) continue;
    try {
      res.write(message);
    } catch (_) {
      // Соединение разорвалось — удаляем
      connections.delete(res);
    }
  }
};

module.exports = { addConnection, removeConnection, broadcast };
