import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) {
    return NextResponse.json({ error: "엑셀에 데이터가 없습니다" }, { status: 400 });
  }

  // 컬럼 자동 탐색
  const keys = Object.keys(rows[0]);
  const nameKey = keys.find(k => /상호명|거래처명|상호|업체명/.test(k));
  const statusKey = keys.find(k => /상태|등록상태|결과|처리상태/.test(k));

  if (!nameKey) {
    return NextResponse.json({
      error: "엑셀에서 '상호명' 컬럼을 찾을 수 없습니다. 컬럼명을 확인해주세요.",
    }, { status: 400 });
  }

  // 엑셀 행 파싱 (이름 + CMS 상태)
  type ExcelRow = { name: string; excelStatus: string; excelStatusType: "success" | "fail" | "paused" | "unknown" };
  const excelRows: ExcelRow[] = rows
    .map(r => {
      const name = String(r[nameKey] || "").trim();
      const rawStatus = statusKey ? String(r[statusKey] || "").trim() : "";
      let excelStatusType: ExcelRow["excelStatusType"] = "unknown";
      if (rawStatus.includes("등록성공")) excelStatusType = "success";
      else if (rawStatus.includes("등록실패")) excelStatusType = "fail";
      else if (rawStatus.includes("일시정지")) excelStatusType = "paused";
      return { name, excelStatus: rawStatus, excelStatusType };
    })
    .filter(r => r.name.length > 0);

  // DB에서 내 CMS 탭 거래처만 조회 (CMS 탭과 동일 조건)
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map(e => e.id)] } };
  }

  const dbClients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      OR: [
        { taxTypes: null },
        { NOT: { taxTypes: { contains: "신고대리" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      ceoName: true,
      cmsStatus: true,
      monthlyFee: true,
    },
  });

  // 매칭 로직: 정확 매칭
  const dbMap = new Map(dbClients.map(c => [c.name.trim(), c]));

  type MatchedItem = {
    excelName: string;
    excelStatus: string;
    excelStatusType: string;
    clientId: number;
    clientName: string;
    ceoName: string | null;
    currentStatus: string;
    monthlyFee: number | null;
  };

  const matched: MatchedItem[] = [];
  const unmatched: { name: string; excelStatus: string }[] = [];
  const matchedClientIds = new Set<number>();

  for (const row of excelRows) {
    const client = dbMap.get(row.name);
    if (client) {
      if (!matchedClientIds.has(client.id)) {
        matched.push({
          excelName: row.name,
          excelStatus: row.excelStatus,
          excelStatusType: row.excelStatusType,
          clientId: client.id,
          clientName: client.name,
          ceoName: client.ceoName,
          currentStatus: client.cmsStatus,
          monthlyFee: client.monthlyFee,
        });
        matchedClientIds.add(client.id);
      }
    } else {
      unmatched.push({ name: row.name, excelStatus: row.excelStatus });
    }
  }

  // 분류
  // 1) CMS 등록성공인데 우리 시스템에서 done이 아닌 것 → 변경 필요
  const needsUpdate = matched.filter(m => m.excelStatusType === "success" && m.currentStatus !== "done");
  // 2) CMS 등록성공이고 이미 done → 일치
  const alreadyDone = matched.filter(m => m.excelStatusType === "success" && m.currentStatus === "done");
  // 3) CMS 등록실패 → 확인 필요
  const failed = matched.filter(m => m.excelStatusType === "fail");
  // 4) 일시정지
  const paused = matched.filter(m => m.excelStatusType === "paused");

  return NextResponse.json({
    totalExcel: excelRows.length,
    matched: matched.length,
    needsUpdate,
    alreadyDone,
    failed,
    paused,
    unmatched,
  });
}
