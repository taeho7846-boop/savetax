import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { readFile, unlink, mkdir } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function runPython(args: string[]): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "python" : "python3";
    const proc = spawn(cmd, args, {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    const timer = setTimeout(() => { proc.kill(); resolve({ ok: false, output: "시간 초과" }); }, 120000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: code === 0 ? stdout : stderr || stdout });
    });
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientId } = await req.json();

  const [client, settings] = await Promise.all([
    prisma.client.findUnique({
      where: { id: Number(clientId) },
      select: {
        name: true,
        ceoName: true,
        bizNumber: true,
        residentNumber: true,
        address: true,
        clientType: true,
      },
    }),
    prisma.settings.findUnique({
      where: { userId: session.id },
      select: { healthExcelPath: true },
    }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.healthExcelPath) {
    return NextResponse.json({ error: "설정에서 건강보험 엑셀 파일을 먼저 업로드해주세요" }, { status: 400 });
  }
  if (!client.bizNumber) {
    return NextResponse.json({ error: `${client.name}: 사업자등록번호가 없습니다` }, { status: 400 });
  }
  if (!client.ceoName) {
    return NextResponse.json({ error: `${client.name}: 대표자명이 없습니다` }, { status: 400 });
  }

  const templateRelPath = settings.healthExcelPath.replace(/^\/api\/uploads\//, "/uploads/");
  const templatePath = path.join(process.cwd(), "public", templateRelPath);
  const scriptPath = path.join(process.cwd(), "scripts", "generate_health_form.py");

  const tmpDir = path.join(process.cwd(), "tmp", "health_pdfs");
  await mkdir(tmpDir, { recursive: true });

  const safeName = client.name.replace(/[/\\:*?"<>|]/g, "_");
  const outputPdf = path.join(tmpDir, `${safeName}_건강보험.pdf`);

  const stampName = client.clientType === "corporate" ? client.name : (client.ceoName || client.name);

  const result = await runPython([
    scriptPath,
    templatePath,
    outputPdf,
    client.bizNumber || "",
    client.name,
    client.address || "",
    client.ceoName || "",
    client.residentNumber || "",
    stampName,
    client.clientType || "individual",
  ]);

  if (!result.ok) {
    return NextResponse.json({ error: result.output }, { status: 500 });
  }

  try {
    const pdfData = await readFile(outputPdf);
    try { await unlink(outputPdf); } catch {}

    return new NextResponse(pdfData, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName + "_건강보험.pdf")}`,
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF 파일을 찾을 수 없습니다" }, { status: 500 });
  }
}
