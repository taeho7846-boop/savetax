import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN_2 || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;
    if (!message) return NextResponse.json({ ok: true });

    const telegramId = String(message.from.id);
    const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ");
    const chatId = message.chat.id;

    if (message.text?.startsWith("/start")) {
      sendTelegram(chatId, `안녕하세요! 세이브택스 AI 어시스턴트입니다.\n\n먼저 홈페이지 아이디와 연동하세요:\n/연동 홈페이지아이디\n\n예시: /연동 savetax\n\n연동 후 메시지를 보내면 AI가 바로 답변합니다.`);
      return NextResponse.json({ ok: true });
    }

    if (message.text?.startsWith("/연동")) {
      const username = message.text.replace("/연동", "").trim();
      if (!username) {
        sendTelegram(chatId, "사용법: /연동 홈페이지아이디\n예시: /연동 savetax");
        return NextResponse.json({ ok: true });
      }
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        sendTelegram(chatId, `❌ '${username}' 계정을 찾을 수 없습니다.`);
        return NextResponse.json({ ok: true });
      }
      // 이미 같은 telegramId가 있으면 업데이트, 없으면 생성 (한 유저에 여러 텔레그램 ID 허용)
      await prisma.telegramUser.upsert({
        where: { telegramId: `bot2_${telegramId}` },
        update: { userId: user.id },
        create: { telegramId: `bot2_${telegramId}`, userId: user.id },
      });
      sendTelegram(chatId, `✅ ${user.name}님 계정과 연동되었습니다!\n이제 메시지를 보내면 본인의 임시메모함에 저장됩니다.`);
      return NextResponse.json({ ok: true });
    }

    let fileUrl: string | null = null;
    if (message.photo && message.photo.length > 0) {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const fileData = curlGetTelegram(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      if (fileData?.ok) {
        fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    if (message.document) {
      const fileId = message.document.file_id;
      const fileData = curlGetTelegram(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      if (fileData?.ok) {
        fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    const content = message.text || message.caption || (fileUrl ? "(파일)" : "(내용 없음)");

    // 모든 메시지 → AI 대화
    const tgUser = await prisma.telegramUser.findUnique({ where: { telegramId: `bot2_${telegramId}` } });
    if (!tgUser) {
      sendTelegram(chatId, "❌ 먼저 /연동 명령어로 계정을 연동해주세요.");
      return NextResponse.json({ ok: true });
    }

    const query = content;
    if (!query || query === "(내용 없음)") return NextResponse.json({ ok: true });

    sendTelegram(chatId, "🤖 답변 생성 중...");
    try {
      const internalKey = (process.env.ANTHROPIC_API_KEY || "").slice(-10);
      const res = await fetch(`http://localhost:80/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": internalKey },
        body: JSON.stringify({ message: query, history: [], _internalUserId: tgUser.userId }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply = data.reply
          ?.replace(/\*\*(.*?)\*\*/g, "*$1*")
          ?.replace(/#{1,3}\s/g, "")
          ?.slice(0, 4000) || "답변을 생성할 수 없습니다.";
        sendTelegramMarkdown(chatId, reply);
      } else {
        sendTelegram(chatId, "❌ AI 응답 실패. 다시 시도해주세요.");
      }
    } catch (e) {
      console.error("[Super-bot AI] 오류:", e);
      sendTelegram(chatId, "❌ AI 응답 실패. 다시 시도해주세요.");
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Telegram2 webhook error:", e);
    return NextResponse.json({ ok: true });
  }
}

function sendTelegram(chatId: number, text: string) {
  try {
    const body = JSON.stringify({ chat_id: chatId, text }).replace(/'/g, "'\\''");
    execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${body}' "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"`, { encoding: "utf-8" });
  } catch {}
}

function sendTelegramMarkdown(chatId: number, text: string) {
  try {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }).replace(/'/g, "'\\''");
    execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${body}' "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"`, { encoding: "utf-8" });
  } catch {
    sendTelegram(chatId, text.replace(/[*_`\[\]]/g, ""));
  }
}

function curlGetTelegram(url: string): any {
  try {
    const result = execSync(`curl -s --connect-timeout 5 "${url}"`, { encoding: "utf-8" });
    return JSON.parse(result);
  } catch {
    return null;
  }
}
