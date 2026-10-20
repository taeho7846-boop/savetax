#!/bin/bash
# 국세청 점검 VPS 1회 설정 — .env에 키 추가 + cron 등록 + pm2 재시작 + 첫 점검 실행
# 사용: bash /root/savetax/scripts/nts-setup-vps.sh <NTS_API_KEY>
# 여러 번 실행해도 안전 (이미 있는 항목은 건너뜀)
set -e
KEY="$1"
ENV=/root/savetax/.env
if [ -z "$KEY" ]; then echo "사용법: $0 <NTS_API_KEY>"; exit 1; fi

if grep -q '^NTS_API_KEY=' "$ENV"; then
  echo ".env: NTS_API_KEY 이미 있음"
else
  printf '\n# 국세청 사업자등록 상태조회 (공공데이터포털)\nNTS_API_KEY=%s\n' "$KEY" >> "$ENV"
  echo ".env: NTS_API_KEY 추가"
fi
if grep -q '^NTS_CRON_SECRET=' "$ENV"; then
  echo ".env: NTS_CRON_SECRET 이미 있음"
else
  printf 'NTS_CRON_SECRET=%s\n' "$(openssl rand -hex 24)" >> "$ENV"
  echo ".env: NTS_CRON_SECRET 추가"
fi

chmod +x /root/savetax/scripts/nts-check.sh
LINE='0 6 * * * /root/savetax/scripts/nts-check.sh >> /root/nts-check.log 2>&1'
if crontab -l 2>/dev/null | grep -qF 'nts-check.sh'; then
  echo "cron: 이미 등록됨"
else
  (crontab -l 2>/dev/null; echo "$LINE") | crontab -
  echo "cron: 매일 06:00 등록 완료"
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
pm2 restart savetax >/dev/null && echo "pm2: savetax 재시작 (새 환경변수 적용)"
sleep 10

echo "--- 첫 점검 실행 ---"
bash /root/savetax/scripts/nts-check.sh
echo "--- 완료 ---"
