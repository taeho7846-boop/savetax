import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSlackReply, getSlackUserInfo } from "@/lib/slack";
import crypto from "crypto";

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || "";

// Slack 요청 서명 검증
function verifySlackRequest(body: string, timestamp: string, signature: string): boolean {
  if (!SIGNING_SECRET) return true; // 개발 환경
  if (!timestamp || !signature) return false;
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto.createHmac("sha256", SIGNING_SECRET).update(sigBasestring).digest("hex");
  const a = Buffer.from(mySignature);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1) URL 검증 (Slack 앱 설정 시 최초 1회) — 서명 검증 전에 처리
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed.type === "url_verification") {
      return NextResponse.json({ challenge: parsed.challenge });
    }
  } catch {}

  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  // 서명 검증
  if (SIGNING_SECRET && !verifySlackRequest(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // 2) 이벤트 처리
  if (body.type === "event_callback") {
    const event = body.event;

    // 봇 메시지 무시
    if (event.bot_id || event.subtype === "bot_message") {
      return NextResponse.json({ ok: true });
    }

    // 메시지 이벤트
    if (event.type === "message") {
      const slackUserId = event.user;
      const text = event.text || "";
      const channel = event.channel;
      const threadTs = event.ts;

      // /연동 명령어
      if (text.startsWith("/연동") || text.startsWith("연동")) {
        const username = text.replace(/^\/?연동\s*/, "").trim();
        if (!username) {
          await sendSlackReply(channel, threadTs, "사용법: `연동 홈페이지아이디`\n예시: `연동 taeho`");
          return NextResponse.json({ ok: true });
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
          await sendSlackReply(channel, threadTs, `❌ '${username}' 계정을 찾을 수 없습니다.`);
          return NextResponse.json({ ok: true });
        }

        await prisma.slackUser.upsert({
          where: { slackId: slackUserId },
          update: { userId: user.id },
          create: { slackId: slackUserId, userId: user.id },
        });

        await sendSlackReply(channel, threadTs, `✅ ${user.name}님 계정과 연동되었습니다!\n이제 메시지를 보내면 임시메모함에 저장됩니다.`);
        return NextResponse.json({ ok: true });
      }

      // 연동된 사용자 확인
      const slackUser = await prisma.slackUser.findUnique({ where: { slackId: slackUserId } });
      if (!slackUser) {
        await sendSlackReply(channel, threadTs, "❌ 먼저 `연동 홈페이지아이디`로 계정을 연동해주세요.");
        return NextResponse.json({ ok: true });
      }

      // 발신자 이름 가져오기
      let senderName = "슬랙사용자";
      try {
        const userInfo = await getSlackUserInfo(slackUserId);
        if (userInfo.ok) {
          senderName = userInfo.user?.real_name || userInfo.user?.name || "슬랙사용자";
        }
      } catch {}

      // 파일 URL 처리
      let fileUrl: string | null = null;
      if (event.files && event.files.length > 0) {
        fileUrl = event.files[0].url_private || null;
      }

      const content = text || (fileUrl ? "(파일)" : "(내용 없음)");

      // 임시메모 저장
      await prisma.tempMemo.create({
        data: {
          telegramId: "",
          senderName,
          content,
          fileUrl,
          source: "slack",
          slackUserId,
        },
      });

      await sendSlackReply(channel, threadTs, `✅ 메모 저장 완료!\n"${content.slice(0, 50)}${content.length > 50 ? "..." : ""}"`);
    }
  }

  return NextResponse.json({ ok: true });
}
