// 국세청 사업자 상태 일일 점검 실행.
// - cron: POST + 헤더 x-nts-cron-secret (= .env NTS_CRON_SECRET) → scripts/nts-check.sh
// - 화면: 로그인한 관리자(owner/admin/accountant)의 '지금 점검' 버튼
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runNtsCheck, NTS_MANAGER_ROLES } from "@/lib/nts-biz";

export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = req.headers.get("x-nts-cron-secret");
  const cronOk = !!secret && !!process.env.NTS_CRON_SECRET && secret === process.env.NTS_CRON_SECRET;
  if (!cronOk) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    if (!NTS_MANAGER_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "관리자만 실행할 수 있습니다" }, { status: 403 });
    }
  }
  const result = await runNtsCheck();
  return NextResponse.json(result, { status: result.error ? 500 : 200 });
}
