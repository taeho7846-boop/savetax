import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const { clientName, year, month } = await req.json();

  const userName = session?.name || "미지정";

  if (!clientName || !year || !month) {
    return NextResponse.json({ ok: false, error: "clientName, year, month 필요" }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "save_payslip_pdf.py");

  return new Promise<NextResponse>((resolve) => {
    const cmd = process.platform === "win32" ? "python" : "python3";
    const proc = spawn(cmd, [scriptPath, userName, clientName, year, String(month)], {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(NextResponse.json({ ok: false, error: "시간 초과" }, { status: 500 }));
    }, 30000);

    proc.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(stdout.trim());
        resolve(NextResponse.json(result));
      } catch {
        resolve(NextResponse.json({ ok: false, error: stderr || stdout || "알 수 없는 오류" }, { status: 500 }));
      }
    });
  });
}
