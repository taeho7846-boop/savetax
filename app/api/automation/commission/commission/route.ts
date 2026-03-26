import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientId } = await req.json();

  const [client, settings, commission] = await Promise.all([
    prisma.client.findUnique({
      where: { id: Number(clientId) },
      select: { ceoName: true, residentNumber: true },
    }),
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.commissionProcess.findUnique({
      where: { clientId: Number(clientId) },
      select: { id: true, idCardPath: true },
    }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.agentHometaxId || !settings?.agentHometaxPw) {
    return NextResponse.json({ error: "세무대리인 홈택스 ID/PW가 설정되지 않았습니다" }, { status: 400 });
  }
  if (!client.residentNumber) {
    return NextResponse.json({ error: "주민등록번호가 없습니다" }, { status: 400 });
  }
  if (!client.ceoName) {
    return NextResponse.json({ error: "대표자명이 없습니다" }, { status: 400 });
  }

  // 파일 경로 (없으면 빈 문자열)
  const agentIdCardPath = settings.agentIdCardPath
    ? path.join(process.cwd(), "public", settings.agentIdCardPath)
    : "";

  const clientIdCardPath = commission?.idCardPath
    ? path.join(process.cwd(), "public", commission.idCardPath)
    : "";

  const pdfPath = commission
    ? path.join(process.cwd(), "public", "uploads", "idcards", `${commission.id}_수임신청서.pdf`)
    : "";

  const scriptPath = path.join(process.cwd(), "scripts", "commission_commission.py");

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(
      "python",
      [
        scriptPath,
        settings.agentHometaxId!,
        settings.agentHometaxPw!,
        settings.certName ?? "",
        settings.certPassword ?? "",
        client.residentNumber!,
        client.ceoName!,
        agentIdCardPath,
        clientIdCardPath,
        pdfPath,
      ],
      { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString("utf8"); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString("utf8"); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ error: "시간 초과 (120초)" }, { status: 408 }));
    }, 120_000);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(NextResponse.json({ message: "파일 업로드 완료 - 화면 확인 후 신청 버튼을 눌러주세요" }));
      } else {
        const errMsg = stderr.trim() || stdout.trim() || "스크립트 실행 오류";
        resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
      }
    });
  });
}
