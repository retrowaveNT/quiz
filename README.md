# Couples Quiz Game

## Локальный запуск
1. `npm install`
2. `npm run dev`
3. Откройте клиент (обычно `http://localhost:5173`), сервер на `http://localhost:4000`.

## Запуск на Render (Single Web Service)

### 1) Создайте Web Service
- Runtime: **Node**
- Build Command:
  ```bash
  npm install && npm run build
  ```
- Start Command:
  ```bash
  npm run start
  ```

### 2) Что уже настроено в репозитории
- Сервер отдает собранный React-клиент из `client/dist`.
- WebSocket работает на том же домене/порту, что и API.
- Порт берется из `PORT` (Render задает его автоматически).

### 3) Важные переменные
- Ничего обязательного не требуется.
- Опционально:
  - `NODE_ENV=production`

### 4) render.yaml (Blueprint)
Можно деплоить через Blueprint — файл `render.yaml` уже добавлен.
