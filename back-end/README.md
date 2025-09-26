# Celulares API (Express + SQLite)

## Requisitos
- Node.js 18+
- npm
- (Opcional) `build-essential`/`python3` caso tenha problema para compilar libs nativas

## Instalação
```bash
cd server
cp .env.example .env
npm install
npm run dev
```
A API sobe em `http://localhost:5055` por padrão.

## Rotas
- `GET /api/devices` – lista celulares com seus números
- `POST /api/devices` – cria celular `{ name, brand, imei }`
- `PATCH /api/devices/:id` – atualiza `{ name?, brand?, imei?, status? }`
- `DELETE /api/devices/:id` – apaga celular (e números vinculados)
- `POST /api/devices/:id/numbers` – adiciona número `{ phone }`
- `DELETE /api/numbers/:id` – remove número pelo id
- `GET /api/stats` – retorna `{ ok, banido, total }`
