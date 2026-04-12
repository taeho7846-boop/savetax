// 텔레그램 AI 봇 폴링 스크립트
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

// .env 파일에서 환경변수 로드
try {
  const envPath = resolve(__dirname, "../.env");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

const BOT_TOKEN = process.env.TELEGRAM_AI_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("TELEGRAM_AI_BOT_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const TG_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

function curlGet(url: string): any {
  try {
    const result = execSync(`curl -s --connect-timeout 10 --max-time 35 "${url}"`, { encoding: "utf-8" });
    return JSON.parse(result);
  } catch {
    return null;
  }
}

function sendTelegram(chatId: number, text: string) {
  try {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }).replace(/'/g, "'\\''");
    execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${body}' "${TG_BASE}/sendMessage"`, { encoding: "utf-8" });
  } catch {
    // 마크다운 실패 시 일반 텍스트
    try {
      const plain = text.replace(/[*_`\[\]]/g, "");
      const body = JSON.stringify({ chat_id: chatId, text: plain }).replace(/'/g, "'\\''");
      execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${body}' "${TG_BASE}/sendMessage"`, { encoding: "utf-8" });
    } catch {}
  }
}

// 사용자별 대화 히스토리 (메모리)
const chatHistory: Map<string, Array<{ role: string; content: string }>> = new Map();

async function handleMessage(chatId: number, telegramId: string, text: string, senderName: string, imageBase64?: string) {
  // /start
  if (text.startsWith("/start")) {
    sendTelegram(chatId, `🤖 *세무 AI 어시스턴트*입니다.\n\n먼저 홈페이지 계정과 연동하세요:\n/연동 홈페이지아이디\n\n연동 후 바로 질문하면 됩니다.\n예: 피부양자 자격요건 알려줘\n예: 인텍 전화번호`);
    return;
  }

  // /연동 (AI봇 전용 - ai_ 접두사로 메모봇과 분리)
  if (text.startsWith("/연동")) {
    const username = text.replace("/연동", "").trim();
    if (!username) {
      sendTelegram(chatId, "사용법: /연동 홈페이지아이디\n예시: /연동 taeho");
      return;
    }
    try {
      const body = JSON.stringify({ message: { from: { id: `ai_${telegramId}` }, chat: { id: chatId }, text: `/연동 ${username}` } }).replace(/'/g, "'\\''");
      execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${body}' "http://localhost:80/api/telegram"`, { encoding: "utf-8" });
    } catch {}
    return;
  }

  // /초기화
  if (text.startsWith("/초기화")) {
    chatHistory.delete(telegramId);
    sendTelegram(chatId, "🔄 대화가 초기화되었습니다.");
    return;
  }

  // AI 질문
  sendTelegram(chatId, "🤖 답변 생성 중...");

  // 연동 확인을 위해 DB 조회 (chat API 내부 인증으로)
  try {
    const internalKey = ANTHROPIC_KEY.slice(-10);
    const history = chatHistory.get(telegramId) || [];

    // userId 조회 (ai_ 접두사로 메모봇과 분리)
    const lookupBody = JSON.stringify({ telegramId: `ai_${telegramId}` }).replace(/'/g, "'\\''");
    const lookupResult = execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${lookupBody}' "http://localhost:80/api/telegram/lookup"`, { encoding: "utf-8" });
    const lookupData = JSON.parse(lookupResult);

    if (!lookupData?.userId) {
      sendTelegram(chatId, "❌ 먼저 /연동 명령어로 계정을 연동해주세요.");
      return;
    }

    const chatBody = JSON.stringify({
      message: text,
      history,
      _internalUserId: lookupData.userId,
      ...(imageBase64 ? { image: imageBase64 } : {}),
    }).replace(/'/g, "'\\''");

    const result = execSync(
      `curl -s --connect-timeout 30 --max-time 60 -X POST -H "Content-Type: application/json" -H "x-internal-key: ${internalKey}" -d '${chatBody}' "http://localhost:80/api/chat"`,
      { encoding: "utf-8" }
    );
    const data = JSON.parse(result);

    if (data.reply) {
      // 히스토리 업데이트
      history.push({ role: "user", content: text });
      history.push({ role: "assistant", content: data.reply });
      // 최근 10개만 유지
      if (history.length > 20) history.splice(0, history.length - 20);
      chatHistory.set(telegramId, history);

      const reply = data.reply
        // 마크다운 테이블 → 깔끔한 텍스트
        .replace(/\|[-:]+\|[-:|\s]+\|/g, "")  // 테이블 구분선 제거
        .replace(/\|\s*/g, "")                  // | 제거
        .replace(/<br\s*\/?>/g, "\n")           // <br/> → 줄바꿈
        .replace(/\*\*(.*?)\*\*/g, "*$1*")      // **bold** → *bold*
        .replace(/#{1,3}\s/g, "📌 ")            // 헤더 → 📌
        .replace(/\n{3,}/g, "\n\n")             // 연속 빈줄 정리
        .trim()
        .slice(0, 4000);
      sendTelegram(chatId, reply);
    } else {
      sendTelegram(chatId, "❌ 답변을 생성할 수 없습니다. 다시 시도해주세요.");
    }
  } catch (e) {
    console.error("[AI Bot] 오류:", e);
    sendTelegram(chatId, "❌ 오류가 발생했습니다. 다시 시도해주세요.");
  }
}

let offset = 0;

function poll() {
  const data = curlGet(`${TG_BASE}/getUpdates?offset=${offset}&timeout=30`);
  if (!data?.ok || !data.result) return;

  for (const update of data.result) {
    offset = update.update_id + 1;
    const msg = update.message;
    if (!msg) continue;

    const text = msg.text || msg.caption || "";
    if (!text) continue;

    // 사진이 있으면 이미지 다운로드 → base64
    let imageBase64: string | undefined;
    if (msg.photo && msg.photo.length > 0) {
      try {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        const fileData = curlGet(`${TG_BASE}/getFile?file_id=${fileId}`);
        if (fileData?.ok) {
          const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
          const imgResult = execSync(`curl -s --connect-timeout 10 "${fileUrl}" | base64`, { encoding: "utf-8" }).trim();
          const ext = fileData.result.file_path?.split(".").pop()?.toLowerCase() || "jpg";
          const mimeType = ext === "png" ? "image/png" : "image/jpeg";
          imageBase64 = `data:${mimeType};base64,${imgResult}`;
        }
      } catch (e) {
        console.error("[AI] 이미지 다운로드 실패:", e);
      }
    }

    console.log(`[AI] 메시지: ${msg.from?.first_name} - ${text.slice(0, 30)}${imageBase64 ? " (이미지)" : ""}`);
    handleMessage(msg.chat.id, String(msg.from.id), text, msg.from.first_name || "", imageBase64);
  }
}

// 웹훅 해제
curlGet(`${TG_BASE}/deleteWebhook`);
console.log("텔레그램 AI 봇 폴링 시작...");

setInterval(poll, 1000);
