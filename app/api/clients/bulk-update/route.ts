import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";

// 헤더명 → DB 필드 매핑 (여러 변형 지원)
const HEADER_MAP: Record<string, string> = {
  사업자등록번호: "bizNumber",
  사업자번호: "bizNumber",
  고객사명: "name",
  사업장명: "name",
  상호: "name",
  대표자명: "ceoName",
  대표자: "ceoName",
  주민등록번호: "residentNumber",
  주민번호: "residentNumber",
  연락처: "phone",
  전화번호: "phone",
  휴대폰: "phone",
  핸드폰: "phone",
  구분: "clientType",
  과세유형: "taxationType",
  과세: "taxationType",
  주소: "address",
  사업장주소: "address",
  홈택스id: "hometaxId",
  홈택스pw: "hometaxPw",
  기장료: "monthlyFee",
  월기장료: "monthlyFee",
  출금월: "firstWithdrawalMonth",
  최초출금월: "firstWithdrawalMonth",
  은행: "bankName",
  출금은행: "bankName",
  은행명: "bankName",
  계좌번호: "bankAccount",
  출금계좌: "bankAccount",
  특이사항: "notes",
  비고: "notes",
  메모: "notes",
};

// clientType 값 변환
function normalizeClientType(val: string): string | null {
  const v = val.trim();
  if (v === "법인") return "corporate";
  if (v === "개인") return "individual";
  return null;
}

// 과세유형 정규화
function normalizeTaxationType(val: string): string | null {
  const v = val.trim();
  if (v.startsWith("간이")) return "간이";
  if (v === "과세") return "과세";
  if (v === "면세") return "면세";
  if (v === "폐업") return "폐업";
  return v || null;
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

  // 헤더 분석: 인덱스 → DB 필드 매핑
  const headerRow = rows[0];
  const colMap: Record<number, string> = {};
  let bizNumberCol = -1;

  for (let i = 0; i < headerRow.length; i++) {
    const raw = String(headerRow[i] ?? "").trim().toLowerCase().replace(/\s+/g, "");
    // 매핑 테이블에서 찾기
    for (const [keyword, field] of Object.entries(HEADER_MAP)) {
      if (raw === keyword.toLowerCase() || raw.includes(keyword.toLowerCase())) {
        colMap[i] = field;
        if (field === "bizNumber") bizNumberCol = i;
        break;
      }
    }
  }

  if (bizNumberCol === -1) {
    return NextResponse.json(
      { error: "사업자등록번호 열을 찾을 수 없습니다. 헤더에 '사업자등록번호'가 포함되어야 합니다." },
      { status: 400 }
    );
  }

  let updated = 0;
  let skipped = 0;
  let errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const rawBiz = String(row[bizNumberCol] ?? "").trim();
    if (!rawBiz) continue;

    // 사업자등록번호 정규화 (하이픈 제거 후 다시 포맷)
    const bizClean = rawBiz.replace(/[^0-9]/g, "");
    if (bizClean.length < 10) {
      skipped++;
      continue;
    }

    try {
      // 사업자등록번호로 기존 거래처 찾기 (하이픈 있는/없는 형태 모두 검색)
      const bizFormatted = `${bizClean.slice(0, 3)}-${bizClean.slice(3, 5)}-${bizClean.slice(5, 10)}`;
      const existing = await prisma.client.findFirst({
        where: {
          assignedUserId: session.id,
          OR: [
            { bizNumber: bizClean },
            { bizNumber: bizFormatted },
            { bizNumber: rawBiz },
          ],
        },
      });

      if (!existing) {
        skipped++;
        continue;
      }

      // 엑셀 데이터에서 업데이트할 필드 수집
      const updateData: Record<string, any> = {};

      for (const [colIdx, field] of Object.entries(colMap)) {
        if (field === "bizNumber") continue; // 매칭용이므로 건너뜀
        const val = String(row[Number(colIdx)] ?? "").trim();
        if (!val) continue;

        const existingVal = (existing as any)[field];

        // 엑셀 데이터로 덮어쓰기
        if (field === "clientType") {
          const converted = normalizeClientType(val);
          if (converted && converted !== existingVal) updateData[field] = converted;
        } else if (field === "taxationType") {
          const converted = normalizeTaxationType(val);
          if (converted && converted !== existingVal) updateData[field] = converted;
        } else if (field === "monthlyFee") {
          const num = parseInt(val.replace(/[^0-9]/g, ""));
          if (!isNaN(num) && num !== existingVal) updateData[field] = num;
        } else {
          if (val !== existingVal) updateData[field] = val;
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.client.update({
          where: { id: existing.id },
          data: updateData,
        });
        updated++;
      } else {
        skipped++;
      }
    } catch (e: any) {
      errors.push(`${i + 1}행 "${rawBiz}": ${e.message || "오류"}`);
    }
  }

  revalidatePath("/clients");

  const parts = [];
  if (updated > 0) parts.push(`${updated}건 업데이트`);
  if (skipped > 0) parts.push(`${skipped}건 건너뜀`);
  if (errors.length > 0) parts.push(`${errors.length}건 오류`);

  return NextResponse.json({
    updated,
    skipped,
    errors,
    message: parts.join(", ") || "변경사항 없음",
  });
}
