#!/usr/bin/env bash
# Recria um banco PostgreSQL de teste, aplica as migrações e roda o cenário completo.
# Uso: DB=obras_teste ./supabase/tests/rodar_testes.sh   (requer psql/createdb locais)
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${DB:-obras_teste}"
export PGTZ="${PGTZ:-America/Recife}"   # "hoje" da obra = data de Recife
dropdb --if-exists "$DB" >/dev/null; createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$DIR/tests/00_stub_supabase.sql" >/dev/null 2>&1
for f in "$DIR"/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null 2>&1 || { echo "Erro em $f"; psql -v ON_ERROR_STOP=1 -d "$DB" -f "$f" | tail -5; exit 1; }; done
# os cenários testam faltas e atrasos: o controle de ponto começa "desde sempre" no banco de teste
psql -q -d "$DB" -c "update dp_parametros set ponto_inicio = '2000-01-01'" >/dev/null
for t in "$DIR"/tests/[0-9][1-9]_*.sql "$DIR"/tests/[1-9]0_*.sql; do echo "--- $(basename "$t")"; psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f "$t" 2>&1 | sed -E "s/^psql:[^ ]+ //; s/^NOTICE:  //"; done
