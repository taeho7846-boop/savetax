import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { agentHometaxId, agentHometaxPw, certName, certPassword } = await req.json();

  if (!agentHometaxId || !agentHometaxPw) {
    return NextResponse.json(
      { error: "홈택스 ID/PW가 설정되지 않았습니다" },
      { status: 400 }
    );
  }

  const scriptPath = path.join(process.cwd(), "scripts", "hometax_agent_login.py");

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn("python3", [
      scriptPath,
      agentHometaxId,
      agentHometaxPw,
      certName ?? "",
      certPassword ?? "",
    ]);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ error: "시간 초과 (90초)" }, { status: 408 }));
    }, 90_000);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(NextResponse.json({ success: true, message: "로그인 완료" }));
      } else {
        const errMsg = stderr.trim() || stdout.trim() || "스크립트 실행 오류";
        resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
      }
    });
  });
}
