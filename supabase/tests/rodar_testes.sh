#!/usr/bin/env bash
# Recria um banco PostgreSQL de teste, aplica as migrações e roda o cenário completo.
# Uso: DB=obras_teste ./supabase/tests/rodar_testes.sh   (requer psql/createdb locais)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${DB:-obras_teste}"
dropdb --if-exists "$DB" >/dev/null; createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/tests/00_stub_supabase.sql" >/dev/null 2>&1
for f in "$DIR"/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "Erro em $f"; psql -v ON_ERROR_STOP=1 -d "$DB" -f "$f" | tail -5; exit 1; }; done
for t in "$DIR"/tests/0[1-9]_*.sql; do echo "--- $(basename "$t")"; psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f "$t" 2>&1 | sed -E "s/^psql:[^ ]+ //; s/^NOTICE:  //"; done
