#!/usr/bin/env bash
#
# savetax 운영 DB 자동 백업 스크립트
# - 매일 cron으로 실행 (아래 "크론 등록" 참고)
# - /root/savetax/.env 의 DATABASE_URL 을 그대로 읽어 백업하므로
#   앱이 실제 사용하는 DB를 추측 없이 정확히 백업한다.
#
# 크론 등록 (매일 새벽 3시):
#   crontab -e
#   0 3 * * * /root/savetax/scripts/backup-db.sh >> /root/backups/savetax-db/backup.log 2>&1
#
# 복원 방법 (예: 특정 백업 파일로 되돌리기):
#   gunzip -c /root/backups/savetax-db/savetax_YYYYMMDD_HHMMSS.sql.gz | psql "<DATABASE_URL>"
#
set -euo pipefail

APP_DIR="/root/savetax"
BACKUP_DIR="/root/backups/savetax-db"
KEEP_DAYS=14

# .env 에서 DATABASE_URL 추출 (따옴표 제거, 첫 줄만)
DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [ -z "${DB_URL}" ]; then
  echo "[$(date '+%F %T')] ERROR: $APP_DIR/.env 에서 DATABASE_URL 을 찾지 못했습니다." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TS="$(date '+%Y%m%d_%H%M%S')"
FILE="$BACKUP_DIR/savetax_${TS}.sql.gz"
TMP="${FILE}.partial"

# 백업 실행: pg_dump → gzip. 실패 시 partial 파일 정리 후 종료
if ! pg_dump "$DB_URL" | gzip > "$TMP"; then
  echo "[$(date '+%F %T')] ERROR: pg_dump 실패. 백업이 생성되지 않았습니다." >&2
  rm -f "$TMP"
  exit 1
fi

# 빈 파일(0바이트)이면 실패로 간주
if [ ! -s "$TMP" ]; then
  echo "[$(date '+%F %T')] ERROR: 백업 파일이 비어 있습니다." >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$FILE"

# 보관기간 지난 백업 삭제
find "$BACKUP_DIR" -maxdepth 1 -name 'savetax_*.sql.gz' -mtime "+${KEEP_DAYS}" -delete

SIZE="$(du -h "$FILE" | cut -f1)"
COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'savetax_*.sql.gz' | wc -l | tr -d ' ')"
echo "[$(date '+%F %T')] OK: 백업 완료 → $FILE (${SIZE}), 보관중 ${COUNT}개"
