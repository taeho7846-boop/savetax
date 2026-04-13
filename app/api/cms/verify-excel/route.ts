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
  // 이름: 상호 > 상호명 > 거래처명 > 업체명 > 회원명 (상호가 비어있으면 회원명 fallback)
  const tradeNameKey = keys.find(k => /^상호$|^상호명$|^거래처명$|^업체명$/.test(k));
  const memberNameKey = keys.find(k => /^회원명$|^예금주$/.test(k));
  const statusKey = keys.find(k => /상태|등록상태|결과|처리상태/.test(k));

  if (!tradeNameKey && !memberNameKey) {
    return NextResponse.json({
      error: "엑셀에서 이름 컬럼을 찾을 수 없습니다. (상호, 회원명, 거래처명 등)",
    }, { status: 400 });
  }

  // 엑셀 → Map (거래처명 → 상태)
  // 상호가 있으면 상호 사용, 없으면 회원명 fallback
  type ExcelEntry = { excelStatus: string; excelStatusType: "success" | "fail" | "paused" | "unknown"; excelName: string };
  const excelMap = new Map<string, ExcelEntry>();
  for (const r of rows) {
    const tradeName = tradeNameKey ? String(r[tradeNameKey] || "").trim() : "";
    const memberName = memberNameKey ? String(r[memberNameKey] || "").trim() : "";
    const name = memberName || tradeName;
    if (!name) continue;
    const rawStatus = statusKey ? String(r[statusKey] || "").trim() : "";
    let excelStatusType: ExcelEntry["excelStatusType"] = "unknown";
    if (rawStatus.includes("등록성공")) excelStatusType = "success";
    else if (rawStatus.includes("등록실패")) excelStatusType = "fail";
    else if (rawStatus.includes("일시정지")) excelStatusType = "paused";
    excelMap.set(name, { excelStatus: rawStatus, excelStatusType, excelName: name });
  }

  // DB에서 내 CMS 탭 거래처 조회 (CMS 탭과 동일 조건)
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

  // 내 거래처 기준으로 엑셀에 있는지 확인
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

  const needsUpdate: MatchedItem[] = [];
  const alreadyDone: MatchedItem[] = [];
  const failed: MatchedItem[] = [];
  const paused: MatchedItem[] = [];
  const notInExcel: { clientId: number; clientName: string; ceoName: string | null; currentStatus: string }[] = [];

  for (const client of dbClients) {
    const excel = excelMap.get(client.name.trim());
    if (excel) {
      const item: MatchedItem = {
        excelName: excel.excelName,
        excelStatus: excel.excelStatus,
        excelStatusType: excel.excelStatusType,
        clientId: client.id,
        clientName: client.name,
        ceoName: client.ceoName,
        currentStatus: client.cmsStatus,
        monthlyFee: client.monthlyFee,
      };
      if (excel.excelStatusType === "success" && client.cmsStatus !== "done") {
        needsUpdate.push(item);
      } else if (excel.excelStatusType === "success" && client.cmsStatus === "done") {
        alreadyDone.push(item);
      } else if (excel.excelStatusType === "fail") {
        failed.push(item);
      } else if (excel.excelStatusType === "paused") {
        paused.push(item);
      }
    } else {
      notInExcel.push({
        clientId: client.id,
        clientName: client.name,
        ceoName: client.ceoName,
        currentStatus: client.cmsStatus,
      });
    }
  }

  const matched = needsUpdate.length + alreadyDone.length + failed.length + paused.length;

  // 디버그
  const excelSampleNames = [...excelMap.keys()].slice(0, 10);
  const dbSampleNames = dbClients.slice(0, 5).map(c => c.name);

  return NextResponse.json({
    totalClients: dbClients.length,
    totalExcel: excelMap.size,
    matched,
    needsUpdate,
    alreadyDone,
    failed,
    paused,
    notInExcel,
    debug: { tradeNameKey, memberNameKey, statusKey, totalRows: rows.length, excelMapSize: excelMap.size, excelSampleNames, dbSampleNames },
  });
}
