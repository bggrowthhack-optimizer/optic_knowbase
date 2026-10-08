#!/usr/bin/env bash
# Поднимает весь демо-стенд одной командой: postgres + backend + frontend +
# демо-пользователь (постоянно всё слетает при простое контейнера — см.
# home-redesign-rules.md). Безопасно запускать повторно.
set -e

ROOT="/tmp/claude-0/-home-user-optic-knowbase/305574ce-e6be-5e33-84fe-13d1578ffffb/scratchpad/optics_summary_new/optics_summary-main"
LOG_DIR="/tmp/claude-0/-home-user-optic-knowbase/305574ce-e6be-5e33-84fe-13d1578ffffb/scratchpad"

echo "== Postgres =="
if ! pg_lsclusters 2>/dev/null | grep -q online; then
  pg_ctlcluster 16 main start
  sleep 3
fi
pg_lsclusters

echo "== Backend =="
if ! curl -s -o /dev/null -w "" localhost:8008/docs 2>/dev/null; then
  cd "$ROOT"
  setsid nohup env PYTHONPATH=.:./backend python3 -m uvicorn backend.app.main:app \
    --host 0.0.0.0 --port 8008 > "$LOG_DIR/backend.log" 2>&1 < /dev/null &
  disown
  for i in $(seq 1 20); do
    sleep 1
    curl -s -o /dev/null localhost:8008/docs && break
  done
fi
curl -s -o /dev/null -w "backend: %{http_code}\n" localhost:8008/docs

echo "== Frontend =="
if ! curl -s -o /dev/null localhost:3008/login 2>/dev/null; then
  cd "$ROOT/frontend"
  setsid nohup npm run dev -- -p 3008 > "$LOG_DIR/frontend.log" 2>&1 < /dev/null &
  disown
  for i in $(seq 1 20); do
    sleep 1
    curl -s -o /dev/null localhost:3008/login && break
  done
fi
curl -s -o /dev/null -w "frontend: %{http_code}\n" localhost:3008/login

echo "== Демо-пользователь kd@demo.local =="
cd "$ROOT"
HASH=$(PYTHONPATH=.:./backend python3 -c "
from backend.app.password_hashing import hash_password
print(hash_password('demo12345'))
")
sudo -u postgres psql -d optics_demo -c "
INSERT INTO users (email, password_hash, role, full_name, is_active)
VALUES ('kd@demo.local', '$HASH', 'COMMERCIAL_DIRECTOR', 'Демо КД', true)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true;
"

echo ""
echo "Готово: http://localhost:3008/home-demo"
echo "Логин: kd@demo.local / demo12345"
