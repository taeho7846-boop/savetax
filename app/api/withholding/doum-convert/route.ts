import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { spawn } from "child_process";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";

// POST multipart: source(정산원본.xlsx), reg(일용직사원등록.xlsx), yearMonth("2026.09")
// → scripts/doum/doum_api.py 실행. 주민번호 오류 시 파일 생성 없이 오류 목록 반환 (게이트)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, fatal: "로그인 필요" }, { status: 401 });

  const form = await req.formData();
  const source = form.get("source") as File | null;
  const reg = form.get("reg") as File | null;
  const yearMonth = String(form.get("yearMonth") || ""); // "2026.09"
  if (!source || !reg || !/^\d{4}\.\d{2}$/.test(yearMonth)) {
    return NextResponse.json({ ok: false, fatal: "파일 2개와 귀속월이 필요합니다" }, { status: 400 });
  }

  const workDir = path.join(os.tmpdir(), "savetax-doum", `${Date.now()}`);
  await mkdir(workDir, { recursive: true });
  const srcPath = path.join(workDir, "source.xlsx");
  const regPath = path.join(workDir, "reg.xlsx");
  await writeFile(srcPath, Buffer.from(await source.arrayBuffer()));
  await writeFile(regPath, Buffer.from(await reg.arrayBuffer()));

  const script = path.join(process.cwd(), "scripts", "doum", "doum_api.py");
  const cmd = process.platform === "win32" ? "python" : "python3";

  const result: any = await new Promise((resolve) => {
    const proc = spawn(cmd, [script, srcPath, yearMonth, regPath, workDir], {
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "", stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString("utf8"); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString("utf8"); });
    const timer = setTimeout(() => { proc.kill(); resolve({ ok: false, fatal: "변환 시간 초과" }); }, 120000);
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        console.error("[doum-convert] python 실패:", stderr || stdout);
        resolve({ ok: false, fatal: "변환 엔진 오류: " + (stderr || stdout || "알 수 없음").slice(0, 300) });
      }
    });
  });

  // 성공 시 산출물을 base64로 동봉 (브라우저에서 바로 다운로드)
  if (result.ok && result.files) {
    const filesOut: { name: string; b64: string }[] = [];
    for (const key of ["newList", "biz", "daily"] as const) {
      const name = result.files[key];
      const buf = await readFile(path.join(workDir, name));
      filesOut.push({ name, b64: buf.toString("base64") });
    }
    result.filesOut = filesOut;
    delete result.files;
  }

  return NextResponse.json(result);
}
