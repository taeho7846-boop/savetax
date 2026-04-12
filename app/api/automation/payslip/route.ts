import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { readFile, unlink } from "fs/promises";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { clientId, wehagoUrl, month } = await req.json();

  if (!clientId || !wehagoUrl || !month) {
    return NextResponse.json({ error: "clientId, wehagoUrl, month 필요" }, { status: 400 });
  }

  const [client, settings] = await Promise.all([
    prisma.client.findUnique({
      where: { id: Number(clientId) },
      select: { name: true },
    }),
    prisma.settings.findUnique({
      where: { userId: session.id },
      select: { wehagoId: true, wehagoPw: true },
    }),
  ]);

  if (!client) {
    return NextResponse.json({ error: "거래처를 찾을 수 없습니다" }, { status: 404 });
  }
  if (!settings?.wehagoId || !settings?.wehagoPw) {
    return NextResponse.json({ error: "설정에서 위하고 ID/PW를 먼저 입력해주세요" }, { status: 400 });
  }

  try {
    const { downloadPayslip } = await import("@/lib/wehago-payslip");
    const result = await downloadPayslip(
      settings.wehagoId,
      settings.wehagoPw,
      {
        wehagoUrl,
        clientName: client.name,
        month: Number(month),
      },
    );

    if (!result.success || !result.filePath) {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    const pdfData = await readFile(result.filePath);
    try { await unlink(result.filePath); } catch {}

    const safeName = client.name.replace(/[/\\:*?"<>|]/g, "_");
    const filename = `${month}월_급여명세서_${safeName}.pdf`;

    return new NextResponse(pdfData, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error: any) {
    console.error("[Payslip] 오류:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
