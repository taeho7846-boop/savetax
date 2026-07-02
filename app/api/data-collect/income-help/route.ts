import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spawn } from "child_process";
import path from "path";
import { readFile, mkdir } from "fs/promises";
import archiver from "archiver";

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
    const timer = setTimeout(() => { proc.kill(); resolve({ ok: false, output: "시간 초과" }); }, 300000); // 5분
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

  const { clientId, startYear, endYear } = await req.json();

  const client = await prisma.client.findUnique({
    where: { id: Number(clientId) },
    select: { name: true, hometaxId: true, hometaxPw: true },
  });

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!client.hometaxId || !client.hometaxPw) {
    return NextResponse.json({ error: `${client.name}: 홈택스 ID/PW가 없습니다` }, { status: 400 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "collect_income_help.py");
  const outputDir = path.join(process.cwd(), "tmp", "data-collect", client.name.replace(/[/\\:*?"<>|]/g, "_"));
  await mkdir(outputDir, { recursive: true });

  const result = await runPython([
    scriptPath,
    client.hometaxId,
    client.hometaxPw,
    String(startYear),
    String(endYear),
    outputDir,
  ]);

  if (!result.ok) {
    return NextResponse.json({ error: result.output }, { status: 500 });
  }

  // 생성된 PDF 파일들을 ZIP으로
  try {
    const fs = await import("fs");
    const files = fs.readdirSync(outputDir).filter((f: string) => f.endsWith(".pdf"));

    if (files.length === 0) {
      return NextResponse.json({ error: "수집된 PDF가 없습니다" }, { status: 500 });
    }

    const chunks: Buffer[] = [];
    const archive = archiver("zip");
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));

    const safeName = client.name.replace(/[/\\:*?"<>|]/g, "_");
    for (const file of files) {
      const data = await readFile(path.join(outputDir, file));
      archive.append(data, { name: `${safeName}/${file}` });
    }

    await archive.finalize();
    await new Promise((resolve) => archive.on("end", resolve));

    const zipBuffer = Buffer.concat(chunks);

    // 임시 파일 정리
    for (const file of files) {
      try { fs.unlinkSync(path.join(outputDir, file)); } catch {}
    }

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName + "_신고도움서비스.zip")}`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
