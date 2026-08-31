import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findFileByName, downloadFile, createFolder, uploadFile } from "@/lib/google-drive";
import { parseBusinessIncomeXlsx, generateLedgerPdf } from "@/lib/business-ledger";
import { parsePayslipXlsx, generatePayslipPdf } from "@/lib/payslip-doc";

// POST /api/withholding/generate-doc
// { clientId, yearMonth: "2026-08", docType: "ledger" | "payslip" }
// 드라이브에 저장된 위하고 엑셀(위멤버스 버튼으로 다운로드된 것)을 읽어 PDF 생성 → 다운로드로 반환
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "로그인 필요" }, { status: 401 });

  const { clientId, yearMonth, docType } = await req.json();
  if (!clientId || !yearMonth || !["ledger", "payslip"].includes(docType)) {
    return NextResponse.json({ message: "필수 항목 누락" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, driveFolderId: true },
  });
  if (!client) return NextResponse.json({ message: "거래처를 찾을 수 없습니다" }, { status: 404 });

  const [year, month] = (yearMonth as string).split("-");
  const sourceName =
    docType === "ledger"
      ? `${year}년 ${month}월 사업소득조회_${client.name}.xlsx`
      : `${year}년 ${month}월 급여명세서_${client.name}.xlsx`;

  try {
    const file = await findFileByName(sourceName);
    if (!file) {
      return NextResponse.json(
        { message: `드라이브에서 '${sourceName}' 파일을 찾지 못했습니다.\n위멤버스 버튼으로 위하고 자료를 먼저 다운로드해주세요.` },
        { status: 404 }
      );
    }

    const buf = await downloadFile(file.id);

    let pdf: Uint8Array;
    let outName: string;
    // 드라이브 저장용 파일 목록 (거래처폴더/1. 원천세/{YYYY년 MM월}/에 저장)
    const driveFiles: { name: string; data: Uint8Array }[] = [];

    if (docType === "ledger") {
      const rows = parseBusinessIncomeXlsx(buf);
      if (rows.length === 0) return NextResponse.json({ message: "엑셀에 사업소득 데이터가 없습니다" }, { status: 422 });
      pdf = await generateLedgerPdf(client.name, yearMonth, rows);
      outName = `${year}년 ${month}월 사업소득지급대장_${client.name}.pdf`;
      driveFiles.push({ name: outName, data: pdf });
    } else {
      const { employees } = parsePayslipXlsx(buf);
      if (employees.length === 0) return NextResponse.json({ message: "엑셀에 급여 데이터가 없습니다" }, { status: 422 });
      // 전체본 1개 + 근로자 개인별 1개씩
      pdf = await generatePayslipPdf(client.name, yearMonth, employees);
      outName = `${year}년 ${month}월 급여명세서_${client.name}_전체.pdf`;
      driveFiles.push({ name: outName, data: pdf });
      for (const emp of employees) {
        const single = await generatePayslipPdf(client.name, yearMonth, [emp]);
        driveFiles.push({ name: `${year}년 ${month}월 급여명세서_${client.name}_${emp.name}님.pdf`, data: single });
      }
    }

    // 드라이브 저장 (실패해도 다운로드는 진행)
    let driveSaved = 0;
    if (client.driveFolderId) {
      try {
        const taxFolderId = await createFolder("1. 원천세", client.driveFolderId);
        const monthFolderId = await createFolder(`${year}년 ${month}월`, taxFolderId);
        for (const f of driveFiles) {
          await uploadFile(monthFolderId, f.name, Buffer.from(f.data), "application/pdf");
          driveSaved++;
        }
      } catch (e) {
        console.error("[generate-doc] 드라이브 저장 실패:", e);
      }
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(outName)}`,
        "Cache-Control": "no-store",
        "X-Drive-Saved": String(driveSaved),
      },
    });
  } catch (e: any) {
    console.error("[generate-doc]", e);
    return NextResponse.json({ message: e?.message || "생성 중 오류가 발생했습니다" }, { status: 500 });
  }
}
