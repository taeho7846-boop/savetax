import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

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
      await sendTelegram(chatId, `안녕하세요! 세무회계태호 메모봇입니다.\n\n먼저 홈페이지 아이디와 연동하세요:\n/연동 홈페이지아이디\n\n예시: /연동 taeho\n\n연동 후 메시지를 보내면 본인의 임시메모함에 저장됩니다.`);
      return NextResponse.json({ ok: true });
    }

    // /연동 명령어: 홈페이지 계정 연동
    if (message.text?.startsWith("/연동")) {
      const username = message.text.replace("/연동", "").trim();
      if (!username) {
        await sendTelegram(chatId, "사용법: /연동 홈페이지아이디\n예시: /연동 taeho");
        return NextResponse.json({ ok: true });
      }
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        await sendTelegram(chatId, `❌ '${username}' 계정을 찾을 수 없습니다.`);
        return NextResponse.json({ ok: true });
      }
      await prisma.telegramUser.upsert({
        where: { telegramId },
        update: { userId: user.id },
        create: { telegramId, userId: user.id },
      });
      await sendTelegram(chatId, `✅ ${user.name}님 계정과 연동되었습니다!\n이제 메시지를 보내면 본인의 임시메모함에 저장됩니다.`);
      return NextResponse.json({ ok: true });
    }

    // 사진 메시지
    let fileUrl: string | null = null;
    if (message.photo && message.photo.length > 0) {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      if (fileData.ok) {
        fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
      }
    }

    // 문서/파일
    if (message.document) {
      const fileId = message.document.file_id;
      const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
      const fileData = await fileRes.json();
      if (fileData.ok) {
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

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
