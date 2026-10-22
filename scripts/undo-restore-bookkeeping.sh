#!/usr/bin/env bash
#
# restore-bookkeeping.sh --apply 를 되돌린다 — 그때 저장한 '복구 직전 값' CSV로 월기장 칸을 다시 덮는다.
#
#   bash scripts/undo-restore-bookkeeping.sh /root/backups/bk_before_restore_YYYYMMDD_HHMMSS.csv            미리보기
#   bash scripts/undo-restore-bookkeeping.sh /root/backups/bk_before_restore_YYYYMMDD_HHMMSS.csv --apply    실행
#
# 복구 뒤에 다시 손으로 바꾼 칸(수정시각이 CSV 파일 생성 이후)은 건드리지 않는다.
set -euo pipefail

APP_DIR="/root/savetax"
CSV="${1:?CSV 경로를 주세요}"
MODE="${2:-preview}"
APPLY=0; if [ "$MODE" = "--apply" ]; then APPLY=1; fi
DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
SINCE="$(date -u -r "$CSV" '+%F %T')"
echo "되돌릴 값 파일: $CSV (저장 시각 UTC $SINCE)"

psql "$DB_URL" -v ON_ERROR_STOP=1 -v apply="$APPLY" -q <<SQL
CREATE TEMP TABLE snap AS SELECT * FROM "BookkeepingMonth" WITH NO DATA;
\copy snap FROM '$CSV' WITH CSV HEADER

\echo
\echo '=== 되돌릴 내용 (월 · 지금 → 복구 직전 · 건수) ==='
SELECT s."yearMonth" AS "월", c.stage AS "지금", s.stage AS "복구 직전", count(*) AS "건수",
       count(*) FILTER (WHERE c."updatedAt" > '$SINCE') AS "복구 뒤 손댄 칸(건너뜀)"
FROM snap s JOIN "BookkeepingMonth" c ON c.id = s.id
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

\if :apply
  BEGIN;
  UPDATE "BookkeepingMonth" c
     SET stage = s.stage, "updatedByUserId" = s."updatedByUserId", "updatedAt" = s."updatedAt"
    FROM snap s
   WHERE c.id = s.id AND c."updatedAt" <= '$SINCE';
  COMMIT;
  \echo '완료'
\else
  \echo '미리보기만 했습니다. 실행하려면 끝에 --apply'
\endif
SQL
