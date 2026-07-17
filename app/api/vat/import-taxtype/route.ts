import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";

// 홈택스 "신고리스트관리" 엑셀 업로드 → 과세유형 상세를 거래처에 저장
// 형식: row0=제목("2026년 1기(확정)"), row1=머리글, row2~=데이터
// 매칭: 사업자번호(숫자만) 우선, 없으면 거래처명 정확 일치

const digits = (s: unknown) => String(s ?? "").replace(/[^0-9]/g, "");
const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "").trim();

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "엑셀 파일을 읽을 수 없습니다" }, { status: 400 });
  }

  const sheetName = workbook.SheetNames.find((n) => n.includes("신고리스트")) ?? workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1, defval: "" });
  if (rows.length < 3) {
    return NextResponse.json({ error: "엑셀 형식이 올바르지 않습니다 (데이터가 없습니다)" }, { status: 400 });
  }

  // 머리글에서 컬럼 위치 찾기 (머리글 행: 제목 아래 첫 행)
  const headerRowIdx = rows.findIndex((r) => r.some((c: unknown) => String(c).includes("과세유형 상세")));
  if (headerRowIdx === -1) {
    return NextResponse.json({ error: "'과세유형 상세' 컬럼을 찾을 수 없습니다. 홈택스 신고리스트관리 엑셀인지 확인하세요." }, { status: 400 });
  }
  const header = rows[headerRowIdx].map((c: unknown) => String(c).trim());
  const nameCol = header.findIndex((h: string) => h === "거래처명");
  const bizCol = header.findIndex((h: string) => h.includes("사업자번호") || h.includes("사업자등록번호"));
  const detailCol = header.findIndex((h: string) => h === "과세유형 상세");
  if (nameCol === -1 || bizCol === -1 || detailCol === -1) {
    return NextResponse.json({ error: "필요한 컬럼(거래처명/사업자번호/과세유형 상세)을 찾을 수 없습니다" }, { status: 400 });
  }

  const sheetTitle = String(rows[0]?.[0] ?? "").trim();

  // 매칭 대상 거래처 (부가세 페이지와 동일 범위: 관리자=본인+소속직원, 직원=본인담당)
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: any = { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map((e) => e.id)] } };
  }
  const dbClients = await prisma.client.findMany({
    where: { isDeleted: false, ...assignedFilter },
    select: { id: true, name: true, bizNumber: true },
  });
  const clientByBiz = new Map<string, number>();
  const clientByName = new Map<string, number>();
  for (const c of dbClients) {
    const b = digits(c.bizNumber);
    if (b && !clientByBiz.has(b)) clientByBiz.set(b, c.id);
    const n = norm(c.name);
    if (n && !clientByName.has(n)) clientByName.set(n, c.id);
  }

  let updatedCount = 0;
  const unmatched: { name: string; biz: string }[] = [];
  const updates: { id: number; detail: string }[] = [];
  const seen = new Set<number>();

  for (const row of rows.slice(headerRowIdx + 1)) {
    const name = String(row[nameCol] ?? "").trim();
    const biz = digits(row[bizCol]);
    const detail = String(row[detailCol] ?? "").trim();
    if (!name && !biz) continue;
    const clientId = (biz && clientByBiz.get(biz)) || clientByName.get(norm(name)) || null;
    if (!clientId) {
      unmatched.push({ name, biz: String(row[bizCol] ?? "").trim() });
      continue;
    }
    if (seen.has(clientId) || !detail) continue;
    seen.add(clientId);
    updates.push({ id: clientId, detail });
  }

  if (updates.length === 0 && unmatched.length === 0) {
    return NextResponse.json({ error: "엑셀에서 거래처 데이터를 찾을 수 없습니다" }, { status: 400 });
  }

  for (const u of updates) {
    await prisma.client.update({ where: { id: u.id }, data: { vatTypeDetail: u.detail } });
    updatedCount++;
  }

  revalidatePath("/vat");
  return NextResponse.json({
    ok: true,
    sheetTitle,
    updatedCount,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 30),
  });
}
