import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createFolder, uploadFile, listFiles, deleteFile } from "@/lib/google-drive";
import { parseWehagoSalaryGrid, buildPayslipXlsx } from "@/lib/payslip-xlsx";

// POST /api/automation/upload-salary
// { clientName, year: "2026", month: "09", payDate?: "2026.09.30", fileBase64 }
// 크롬 확장이 위하고 급여자료입력에서 내려받은 엑셀(Ctrl+G)을 받아
// 급여명세서 양식 엑셀로 변환해 거래처 드라이브(5. 위멤버스/근로소득)에 저장한다
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  }

  const { clientName, year, month, payDate, fileBase64 } = await req.json();

  if (!clientName || !year || !month || !fileBase64) {
    return NextResponse.json({ ok: false, error: "clientName, year, month, fileBase64 필요" }, { status: 400 });
  }

  const client = await prisma.client.findFirst({
    where: { name: clientName, isDeleted: false },
    select: { id: true, name: true, driveFolderId: true },
  });

  if (!client) {
    return NextResponse.json({ ok: false, error: `거래처 "${clientName}"을 찾을 수 없습니다` });
  }
  if (!client.driveFolderId) {
    return NextResponse.json({ ok: false, error: `거래처 "${clientName}"의 구글드라이브 폴더가 연결되지 않았습니다` });
  }

  try {
    const employees = parseWehagoSalaryGrid(Buffer.from(fileBase64, "base64"), String(payDate || ""));
    if (employees.length === 0) {
      return NextResponse.json({ ok: false, error: "해당 월에 지급액이 있는 사원이 없습니다" });
    }

    const monthPadded = String(month).padStart(2, "0");
    const fileName = `${year}년 ${monthPadded}월 급여명세서_${client.name}.xlsx`;
    const buf = await buildPayslipXlsx({ companyName: client.name, year: String(year), month: monthPadded, employees });

    const wemembersFolderId = await createFolder("5. 위멤버스", client.driveFolderId);
    const salaryFolderId = await createFolder("근로소득", wemembersFolderId);

    // 재실행 시 같은 이름 파일이 쌓이지 않게 기존 것 삭제 후 업로드 (덮어쓰기)
    const existing = await listFiles(salaryFolderId);
    for (const old of existing.filter((f) => f.name === fileName)) {
      await deleteFile(old.id).catch(() => {});
    }

    const result = await uploadFile(
      salaryFolderId,
      fileName,
      buf,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    return NextResponse.json({
      ok: true,
      message: `${fileName} 업로드 완료 (${employees.length}명)`,
      fileUrl: result.fileUrl,
    });
  } catch (e: any) {
    console.error("[Upload Salary]", e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
