#!/bin/bash
# 국세청 사업자 상태 일일 점검 — VPS cron에서 실행
# crontab 등록:  0 6 * * * /root/savetax/scripts/nts-check.sh >> /root/nts-check.log 2>&1
# 앱(pm2 savetax, 내부 포트 3000)의 /api/nts/check 를 cron 비밀키로 호출한다. 비밀키는 /root/savetax/.env 의 NTS_CRON_SECRET
SECRET=$(grep -E '^NTS_CRON_SECRET=' /root/savetax/.env | cut -d= -f2- | tr -d '"\r')
echo "[$(date '+%F %T')] 국세청 점검 시작"
curl -s -m 600 -X POST -H "x-nts-cron-secret: $SECRET" http://localhost:3000/api/nts/check
echo
