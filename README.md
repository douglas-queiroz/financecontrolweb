# Financial Control Web

Web port of the "Financial Control" iOS app's Expenses feature: track
expenses with due dates, mark them paid/unpaid, and manage recurring
expenses.

## Local development

```bash
docker-compose up
```

- Backend: http://localhost:8000 (interactive API docs at `/docs`)
- Frontend: http://localhost:5173

## Production

Production runs as a single container (`Dockerfile.prod`): the frontend is
built with Node and bundled into the backend image, so FastAPI serves both
the UI and `/api` on port 8000.

One-time server setup (requires sudo):

```bash
curl -fsSL https://get.docker.com | sh
sudo systemctl enable --now docker
```

Deploy:

```bash
cp .env.example .env   # optional: fill in market data API keys
docker compose -f docker-compose.prod.yml up -d --build
```

- App: http://localhost/ (or http://localhost:8000; API docs at `/docs`, health check at `/health`)
- Data persists in the `backend-data` Docker volume.

The container uses `restart: unless-stopped` and the Docker daemon is
enabled at boot, so the app starts automatically when the OS starts.

Update after `git pull`:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Running tests

Backend:
```bash
cd backend
source venv/bin/activate
pytest
```

Frontend:
```bash
cd frontend
npm test
```

## Migrating data from the iOS app

See `scripts/migrate_from_ios.py --help`.