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
      select: {
        name: true,
        ceoName: true,
        residentNumber: true,
        bizNumber: true,
        phone: true,
      },
    }),
    prisma.settings.findUnique({ where: { userId: session.id } }),
    prisma.commissionProcess.findUnique({
      where: { clientId: Number(clientId) },
      select: { id: true },
    }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "고객사를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.commissionFormPath) {
    return NextResponse.json(
      { error: "설정 탭에서 홈택스수임신청서 엑셀 템플릿을 먼저 업로드해주세요" },
      { status: 400 }
    );
  }
  if (!client.ceoName) {
    return NextResponse.json({ error: `${client.name}: 대표자명이 없습니다` }, { status: 400 });
  }

  const templatePath = path.join(process.cwd(), "public", settings.commissionFormPath.replace(/^\/api\/uploads\//, "/uploads/"));
  const outputDir    = path.join(process.cwd(), "public", "uploads", "idcards");
  const outputName   = commission
    ? `${commission.id}_수임신청서.pdf`
    : `${client.name}_수임신청서.pdf`;
  const outputPdfPath = path.join(outputDir, outputName);
  const webPath = `/api/uploads/idcards/${outputName}`;

  const scriptPath = path.join(process.cwd(), "scripts", "generate_commission_form.py");
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  return new Promise<NextResponse>((resolve) => {
    const proc = spawn(
      pythonCmd,
      [
        scriptPath,
        templatePath,
        outputPdfPath,
        client.ceoName ?? "",
        client.residentNumber ?? "",
        client.name,
        client.bizNumber ?? "",
        client.phone ?? "",
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
        resolve(
          NextResponse.json({
            message: `PDF 생성 완료 → 신분증 폴더에 저장됨`,
            pdfPath: webPath,
          })
        );
      } else {
        const errMsg = stderr.trim() || stdout.trim() || "스크립트 실행 오류";
        resolve(NextResponse.json({ error: errMsg }, { status: 500 }));
      }
    });
  });
}
