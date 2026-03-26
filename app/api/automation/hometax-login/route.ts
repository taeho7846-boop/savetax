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

  const client = await prisma.client.findUnique({
    where: { id: Number(clientId) },
    select: {
      name: true,
      hometaxId: true,
      hometaxPw: true,
      residentNumber: true,
    },
  });

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!client.hometaxId || !client.hometaxPw) {
    return NextResponse.json(
      { error: `${client.name}: 홈택스 ID/PW가 등록되지 않았습니다` },
      { status: 400 }
    );
  }
  const scriptPath = path.join(process.cwd(), "scripts", "hometax_login.py");

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn("python3", [
      scriptPath,
      client.hometaxId!,
      client.hometaxPw!,
      client.residentNumber ?? "",
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(
        NextResponse.json({ error: "시간 초과 (60초)" }, { status: 408 })
      );
    }, 60_000);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(NextResponse.json({ success: true, message: "로그인 완료" }));
      } else {
        const errMsg = stderr.trim() || stdout.trim() || "스크립트 실행 오류";
        resolve(
          NextResponse.json({ error: errMsg }, { status: 500 })
        );
      }
    });
  });
}
