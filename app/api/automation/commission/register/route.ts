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

  const [client, settings] = await Promise.all([
    prisma.client.findUnique({
      where: { id: Number(clientId) },
      select: { name: true, clientType: true, bizNumber: true, residentNumber: true, phone: true },
    }),
    prisma.settings.findUnique({ where: { id: 1 } }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.agentHometaxId || !settings?.agentHometaxPw) {
    return NextResponse.json({ error: "세무대리인 홈택스 ID/PW가 설정되지 않았습니다" }, { status: 400 });
  }
  if (!client.bizNumber) {
    return NextResponse.json({ error: `${client.name}: 사업자등록번호가 없습니다` }, { status: 400 });
  }
  if (!client.residentNumber) {
    return NextResponse.json({ error: `${client.name}: 주민등록번호가 없습니다` }, { status: 400 });
  }
  if (!client.phone) {
    return NextResponse.json({ error: `${client.name}: 전화번호가 없습니다` }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "commission_register.py");

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn("python3", [
      scriptPath,
      settings.agentHometaxId!,
      settings.agentHometaxPw!,
      settings.certName ?? "",
      settings.certPassword ?? "",
      client.clientType,
      client.bizNumber!,
      client.residentNumber!,
      client.phone!,
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ error: "시간 초과 (120초)" }, { status: 408 }));
    }, 120_000);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(NextResponse.json({ success: true, message: "입력 완료 - 화면 확인 후 등록 버튼을 눌러주세요" }));
      } else {
        const errMsg = stderr.trim() || stdout.trim() || "스크립트 실행 오류";
        resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
      }
    });
  });
}
