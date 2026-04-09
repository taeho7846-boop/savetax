// 텔레그램 봇2 폴링 스크립트 (Savetaxnh_all_bot)
import { execSync } from "child_process";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_2;
if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN_2 환경변수가 필요합니다.");
  process.exit(1);
}

const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const API_BASE = `http://localhost:80/api/telegram2`;

function curlGet(url: string): any {
  try {
    const result = execSync(`curl -s --connect-timeout 10 --max-time 35 "${url}"`, { encoding: "utf-8" });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function curlPost(url: string, body: any): any {
  try {
    const json = JSON.stringify(body).replace(/'/g, "'\\''");
    const result = execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${json}' "${url}"`, { encoding: "utf-8" });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

let offset = 0;

function poll() {
  const data = curlGet(`${TG_BASE}/getUpdates?offset=${offset}&timeout=30`);
  if (!data?.ok || !data.result) return;

  for (const update of data.result) {
    offset = update.update_id + 1;
    if (update.message) {
      curlPost(API_BASE, { message: update.message });
      console.log(`[봇2] 메시지 수신: ${update.message.from?.first_name} - ${(update.message.text || "(파일)").slice(0, 30)}`);
    }
  }
}

// 웹훅 해제
curlGet(`${TG_BASE}/deleteWebhook`);
console.log("텔레그램 봇2 폴링 시작 (Savetaxnh_all_bot)...");

setInterval(poll, 1000);
