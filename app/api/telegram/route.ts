import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message;
    if (!message) return NextResponse.json({ ok: true });

    const telegramId = String(message.from.id);
    const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ");
    const chatId = message.chat.id;

    // /start 명령어: 연동 안내
    if (message.text?.startsWith("/start")) {
      sendTelegram(chatId, `안녕하세요! 세무회계태호 메모봇입니다.\n\n먼저 홈페이지 아이디와 연동하세요:\n/연동 홈페이지아이디\n\n예시: /연동 taeho\n\n연동 후 메시지를 보내면 본인의 임시메모함에 저장됩니다.`);
      return NextResponse.json({ ok: true });
    }

    // /연동 명령어: 홈페이지 계정 연동
    if (message.text?.startsWith("/연동")) {
      const username = message.text.replace("/연동", "").trim();
      if (!username) {
        sendTelegram(chatId, "사용법: /연동 홈페이지아이디\n예시: /연동 taeho");
        return NextResponse.json({ ok: true });
      }
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        sendTelegram(chatId, `❌ '${username}' 계정을 찾을 수 없습니다.`);
        return NextResponse.json({ ok: true });
      }
      await prisma.telegramUser.upsert({
        where: { telegramId },
        update: { userId: user.id },
        create: { telegramId, userId: user.id },
      });
      sendTelegram(chatId, `✅ ${user.name}님 계정과 연동되었습니다!\n이제 메시지를 보내면 본인의 임시메모함에 저장됩니다.`);
      return NextResponse.json({ ok: true });
    }

    // 사진 메시지
    let fileUrl: string | null = null;
    if (message.photo && message.photo.length > 0) {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const fileData = curlGetTelegram(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      if (fileData?.ok) {
        fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    // 문서/파일
    if (message.document) {
      const fileId = message.document.file_id;
      const fileData = curlGetTelegram(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      if (fileData?.ok) {
        fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    const content = message.text || message.caption || (fileUrl ? "(파일)" : "(내용 없음)");

    // DB에 임시메모 저장
    await prisma.tempMemo.create({
      data: {
        telegramId,
        senderName,
        content,
        fileUrl,
      },
    });

    await sendTelegram(chatId, `✅ 메모 저장 완료!\n"${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Telegram webhook error:", e);
    return NextResponse.json({ ok: true }); // 텔레그램에 200 반환해야 재시도 안 함
  }
}

function sendTelegram(chatId: number, text: string) {
  try {
    const body = JSON.stringify({ chat_id: chatId, text }).replace(/'/g, "'\\''");
    execSync(`curl -s --connect-timeout 5 -X POST -H "Content-Type: application/json" -d '${body}' "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"`, { encoding: "utf-8" });
  } catch {}
}

function curlGetTelegram(url: string): any {
  try {
    const result = execSync(`curl -s --connect-timeout 5 "${url}"`, { encoding: "utf-8" });
    return JSON.parse(result);
  } catch {
    return null;
  }
}
