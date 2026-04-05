// 텔레그램 봇 폴링 스크립트
// 실행: node scripts/telegram-bot.js

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

const API_BASE = `http://localhost:80/api/telegram`;
const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

let offset = 0;

async function poll() {
  try {
    const res = await fetch(`${TG_BASE}/getUpdates?offset=${offset}&timeout=30`);
    const data = await res.json();

    if (!data.ok || !data.result) return;

    for (const update of data.result) {
      offset = update.update_id + 1;

      if (update.message) {
        // 내부 API로 전달
        try {
          await fetch(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: update.message }),
          });
        } catch (e: any) {
          console.error("API 전달 실패:", e.message);
        }
      }
    }
  } catch (e: any) {
    console.error("폴링 오류:", e.message);
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function main() {
  // 웹훅 해제
  await fetch(`${TG_BASE}/deleteWebhook`);
  console.log("텔레그램 봇 폴링 시작...");

  while (true) {
    await poll();
  }
}

main();
