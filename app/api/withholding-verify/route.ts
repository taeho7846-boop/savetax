import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const yearMonth = formData.get("yearMonth") as string;
  if (!file || !yearMonth) return NextResponse.json({ error: "file, yearMonth 필요" }, { status: 400 });

  // 엑셀 파싱 - K열(인덱스 10)에서 사업자등록번호 추출
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

  // 사업자번호 목록 (숫자만 추출, 헤더 제외)
  const excelBizNumbers = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[10]) continue;
    const biz = String(row[10]).replace(/[^0-9]/g, "");
    if (biz.length >= 10) excelBizNumbers.add(biz);
  }

  // 사용자 필터 (매니저면 부하직원 포함)
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map(e => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  // DB에서 원천세 대상 거래처 (ABC 그룹)
  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      withholdingType: { in: ["A", "B", "C"] },
    },
    select: {
      id: true,
      name: true,
      bizNumber: true,
      withholdingType: true,
      withholdingRecords: {
        where: { yearMonth },
      },
    },
  });

  // 비교
  const checkedNotInExcel: { name: string; bizNumber: string; type: string }[] = [];
  const notCheckedButInExcel: { name: string; bizNumber: string; type: string }[] = [];

  for (const client of clients) {
    const biz = client.bizNumber?.replace(/[^0-9]/g, "") || "";
    if (!biz) continue;

    const doneMap = new Map(client.withholdingRecords.filter(r => r.done).map(r => [r.taskType, true]));
    const isSkipped = doneMap.has("신고없음");
    const isChecked = doneMap.has("원천세신고");
    const inExcel = excelBizNumbers.has(biz);

    if (isSkipped) continue; // 신고없음은 제외

    if (isChecked && !inExcel) {
      checkedNotInExcel.push({ name: client.name, bizNumber: client.bizNumber || "", type: client.withholdingType || "" });
    }
    if (!isChecked && inExcel) {
      notCheckedButInExcel.push({ name: client.name, bizNumber: client.bizNumber || "", type: client.withholdingType || "" });
    }
  }

  return NextResponse.json({
    excelCount: excelBizNumbers.size,
    clientCount: clients.length,
    checkedNotInExcel,
    notCheckedButInExcel,
    allMatch: checkedNotInExcel.length === 0 && notCheckedButInExcel.length === 0,
  });
}
