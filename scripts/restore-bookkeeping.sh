#!/usr/bin/env bash
#
# 월기장 보드 '기간 일괄 완료' 오작동 복구 — 최근 일괄 변경분만 마지막 DB 백업 시점의 단계로 되돌린다.
#
#   bash scripts/restore-bookkeeping.sh            미리보기만 (DB를 바꾸지 않음)
#   bash scripts/restore-bookkeeping.sh --apply    되돌리기 실행 (실행 전 현재 값을 CSV로 남김)
#
# 대상: 최근 12시간 안에 같은 사용자가 같은 1분 안에 50건 이상 바꾼 묶음(= 일괄 처리) 중 '완료' 단계로 바뀐 행.
#  - 백업에 있던 행: 백업 당시 단계·수정자·수정시각으로 되돌림
#  - 백업에 없던 행(일괄 처리로 새로 생김): 메모가 없으면 단계를 '미시작(none)'으로
# 한계: 새벽 백업 이후 일괄 처리 전까지 손으로 바꾼 값은 백업 값으로 돌아간다.
set -euo pipefail

APP_DIR="/root/savetax"
BACKUP_DIR="/root/backups/savetax-db"
MODE="${1:-preview}"

DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
FILE="$(ls -1 "$BACKUP_DIR"/savetax_*.sql.gz | sort | tail -1)"
echo "백업 파일: $FILE"

TSV="/tmp/bk_backup.tsv"
COLS="$(gunzip -c "$FILE" | grep -m1 -E '^COPY public\."BookkeepingMonth" ' | sed -E 's/^COPY public\."BookkeepingMonth" \((.*)\) FROM stdin;$/\1/')"
if [ -z "$COLS" ]; then echo "백업에서 BookkeepingMonth 표를 찾지 못했습니다"; exit 1; fi
gunzip -c "$FILE" | awk '/^COPY public\."BookkeepingMonth" /{f=1;next} f && /^\\\.$/{f=0} f' > "$TSV"
echo "백업의 월기장 행 수: $(wc -l < "$TSV")"

APPLY=0
if [ "$MODE" = "--apply" ]; then APPLY=1; fi
SNAP="/root/backups/bk_before_restore_$(date '+%Y%m%d_%H%M%S').csv"

psql "$DB_URL" -v ON_ERROR_STOP=1 -v apply="$APPLY" -q <<SQL
CREATE TEMP TABLE bk_bak AS SELECT * FROM "BookkeepingMonth" WITH NO DATA;
\copy bk_bak ($COLS) FROM '$TSV'

CREATE TEMP TABLE burst AS
  SELECT "updatedByUserId" AS uid, date_trunc('minute', "updatedAt") AS m, count(*) AS n
  FROM "BookkeepingMonth"
  WHERE "updatedAt" > now() - interval '12 hours'
  GROUP BY 1, 2 HAVING count(*) >= 50;

\echo
\echo '=== 일괄 변경 묶음 (사용자 · 시각(UTC) · 건수) ==='
SELECT u.name AS "사용자", b.m AS "시각", b.n AS "건수" FROM burst b LEFT JOIN "User" u ON u.id = b.uid ORDER BY b.m;

CREATE TEMP TABLE hit AS
  SELECT DISTINCT c.* FROM "BookkeepingMonth" c
  JOIN burst b ON c."updatedByUserId" = b.uid
   AND c."updatedAt" >= b.m - interval '1 minute' AND c."updatedAt" < b.m + interval '2 minutes'
  WHERE c.stage IN ('done', 'booked');

\echo
\echo '=== 되돌릴 내용 (월 · 지금 → 백업 당시 · 건수) ==='
SELECT h."yearMonth" AS "월", h.stage AS "지금", coalesce(k.stage, '(없음→none)') AS "백업", count(*) AS "건수"
FROM hit h LEFT JOIN bk_bak k ON k."clientId" = h."clientId" AND k."yearMonth" = h."yearMonth"
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

\echo
\echo '=== 합계 ==='
SELECT count(*) AS "대상 행",
       count(*) FILTER (WHERE k.id IS NOT NULL AND k.stage <> h.stage) AS "백업 단계로 되돌림",
       count(*) FILTER (WHERE k.id IS NOT NULL AND k.stage = h.stage) AS "원래도 같음",
       count(*) FILTER (WHERE k.id IS NULL) AS "새로 생긴 행"
FROM hit h LEFT JOIN bk_bak k ON k."clientId" = h."clientId" AND k."yearMonth" = h."yearMonth";

\if :apply
  \echo
  \echo '=== 되돌리기 실행 ==='
  \copy (SELECT * FROM hit) TO '$SNAP' WITH CSV HEADER
  \echo '실행 전 값 저장: $SNAP'
  BEGIN;
  UPDATE "BookkeepingMonth" c
     SET stage = k.stage, "updatedByUserId" = k."updatedByUserId", "updatedAt" = k."updatedAt"
    FROM hit h JOIN bk_bak k ON k."clientId" = h."clientId" AND k."yearMonth" = h."yearMonth"
   WHERE c.id = h.id;
  UPDATE "BookkeepingMonth" c
     SET stage = 'none'
    FROM hit h
   WHERE c.id = h.id AND c.memo IS NULL
     AND NOT EXISTS (SELECT 1 FROM bk_bak k WHERE k."clientId" = c."clientId" AND k."yearMonth" = c."yearMonth");
  COMMIT;
  \echo '완료'
\else
  \echo
  \echo '미리보기만 했습니다. 되돌리려면: bash scripts/restore-bookkeeping.sh --apply'
\endif
SQL
