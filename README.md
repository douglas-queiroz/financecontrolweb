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