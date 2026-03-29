import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";

// 최초출금월 정규화: Excel 날짜/숫자/문자 → YYYY-MM
function normalizeYearMonth(val: any): string | null {
  if (val == null) return null;
  // Excel 시리얼 번호 (숫자)
  if (typeof val === "number" && val > 30000 && val < 60000) {
    const d = new Date((val - 25569) * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  // Date 객체
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  if (!s) return null;
  // YYYY-MM 형식
  const m1 = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}`;
  // YYYY/MM 또는 YYYY.MM
  const m2 = s.match(/^(\d{4})[/.](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, "0")}`;
  // YYYY-MM-DD (날짜에서 월만)
  const m3 = s.match(/^(\d{4})-(\d{1,2})-\d{1,2}/);
  if (m3) return `${m3[1]}-${m3[2].padStart(2, "0")}`;
  return s;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

  if (rows.length < 2) {
    return NextResponse.json({ error: "데이터가 없습니다 (헤더만 있음)" }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  let errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue; // 빈 행 건너뛰기

    const name = String(row[0] ?? "").trim();
    if (!name) continue;

    const bizNumber = String(row[1] ?? "").trim() || null;
    const excelData = {
      name,
      bizNumber,
      ceoName: String(row[2] ?? "").trim() || null,
      residentNumber: String(row[3] ?? "").trim() || null,
      phone: String(row[4] ?? "").trim() || null,
      clientType: String(row[5] ?? "").trim() === "법인" ? "corporate" : "individual",
      taxationType: String(row[6] ?? "").trim() || null,
      hometaxId: String(row[7] ?? "").trim() || null,
      hometaxPw: String(row[8] ?? "").trim() || null,
      monthlyFee: row[9] ? parseInt(String(row[9])) || null : null,
      firstWithdrawalMonth: normalizeYearMonth(row[10]) || null,
      bankName: String(row[11] ?? "").trim() || null,
      bankAccount: String(row[12] ?? "").trim() || null,
      address: String(row[13] ?? "").trim() || null,
      notes: String(row[14] ?? "").trim() || null,
    };

    try {
      // 사업자등록번호로 기존 거래처 매칭
      let existing = null;
      if (bizNumber) {
        existing = await prisma.client.findFirst({
          where: { bizNumber, assignedUserId: session.id },
        });
      }

      if (existing) {
        // 기존 거래처: 비어있는 필드만 엑셀 데이터로 채움
        const updateData: Record<string, any> = {};
        if (!existing.ceoName && excelData.ceoName) updateData.ceoName = excelData.ceoName;
        if (!existing.residentNumber && excelData.residentNumber) updateData.residentNumber = excelData.residentNumber;
        if (!existing.phone && excelData.phone) updateData.phone = excelData.phone;
        if (!existing.taxationType && excelData.taxationType) updateData.taxationType = excelData.taxationType;
        if (!existing.hometaxId && excelData.hometaxId) updateData.hometaxId = excelData.hometaxId;
        if (!existing.hometaxPw && excelData.hometaxPw) updateData.hometaxPw = excelData.hometaxPw;
        if (existing.monthlyFee == null && excelData.monthlyFee != null) updateData.monthlyFee = excelData.monthlyFee;
        if (!existing.firstWithdrawalMonth && excelData.firstWithdrawalMonth) updateData.firstWithdrawalMonth = excelData.firstWithdrawalMonth;
        if (!existing.bankName && excelData.bankName) updateData.bankName = excelData.bankName;
        if (!existing.bankAccount && excelData.bankAccount) updateData.bankAccount = excelData.bankAccount;
        if (!existing.address && excelData.address) updateData.address = excelData.address;
        if (!existing.notes && excelData.notes) updateData.notes = excelData.notes;

        if (Object.keys(updateData).length > 0) {
          await prisma.client.update({
            where: { id: existing.id },
            data: updateData,
          });
          updated++;
        }
      } else {
        // 새 거래처 등록
        const client = await prisma.client.create({
          data: {
            ...excelData,
            assignedUserId: session.id,
          },
        });
        await prisma.commissionProcess.create({ data: { clientId: client.id } });
        created++;
      }
    } catch (e: any) {
      errors.push(`${i + 1}행 "${name}": ${e.message || "오류"}`);
    }
  }

  revalidatePath("/clients");
  revalidatePath("/commission");
  revalidatePath("/dashboard");

  const parts = [];
  if (created > 0) parts.push(`${created}건 신규등록`);
  if (updated > 0) parts.push(`${updated}건 업데이트`);
  if (errors.length > 0) parts.push(`${errors.length}건 오류`);

  return NextResponse.json({
    created,
    updated,
    errors,
    message: parts.join(", ") || "변경사항 없음",
  });
}
