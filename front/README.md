# Celulares Web (Vite + React)

## Rodando
```bash
cd client
npm install
npm run dev
```
A aplicação web abre em `http://localhost:5173` e usa proxy para a API (`/api` → `http://localhost:5055`).

## Build
```bash
npm run build
npm run preview
```

## Variáveis (opcional)
- `VITE_API_BASE` – define URL da API (se não quiser usar o proxy). Ex.: `http://localhost:5055/api`
