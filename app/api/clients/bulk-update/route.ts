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
  개업년월일: "openDate",
  개업일: "openDate",
  원천세신고유형: "halfYearTax",
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
  if (v.includes("세계") || v.includes("세금계산서")) return "간이(세금계산서발행)";
  if (v === "간이") return "간이";
  if (v === "과세") return "과세";
  if (v === "면세") return "면세";
  if (v === "폐업") return "폐업";
  return v || null;
}

// 날짜 정규화 (다양한 형식 → YYYY-MM-DD)
function normalizeDate(val: string): string | null {
  // 엑셀 시리얼 번호 (숫자만)
  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const d = new Date((num - 25569) * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  // YYYY-MM-DD 또는 YYYY.MM.DD 또는 YYYY/MM/DD
  const match = val.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  // MM/DD/YY 또는 M/D/YYYY (미국식)
  const match2 = val.match(/(\d{1,2})[/](\d{1,2})[/](\d{2,4})/);
  if (match2) {
    const yr = match2[3].length === 2 ? "20" + match2[3] : match2[3];
    return `${yr}-${match2[1].padStart(2, "0")}-${match2[2].padStart(2, "0")}`;
  }
  // YYYYMMDD (8자리 숫자)
  const digits = val.replace(/[^0-9]/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  return null;
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
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

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
          isDeleted: false,
          OR: [
            { bizNumber: bizClean },
            { bizNumber: bizFormatted },
            { bizNumber: rawBiz },
          ],
        },
      });

      if (!existing) {
        skipped++;
        errors.push(`${i + 1}행 "${rawBiz}": 매칭되는 거래처 없음`);
        continue;
      }

      // 엑셀 데이터에서 업데이트할 필드 수집
      const updateData: Record<string, any> = {};

      for (const [colIdx, field] of Object.entries(colMap)) {
        if (field === "bizNumber") continue; // 매칭용이므로 건너뜀
        const rawVal = row[Number(colIdx)];
        // Date 객체 처리
        let val: string;
        if (rawVal instanceof Date) {
          const y = rawVal.getFullYear();
          const m = String(rawVal.getMonth() + 1).padStart(2, "0");
          const d = String(rawVal.getDate()).padStart(2, "0");
          val = `${y}-${m}-${d}`;
        } else {
          val = String(rawVal ?? "").trim();
        }
        if (!val) continue;

        const existingVal = (existing as any)[field];

        // 기본: 빈칸만 채우기, 과세유형만 덮어쓰기 허용
        if (field === "taxationType") {
          // 과세유형은 항상 덮어쓰기
          const converted = normalizeTaxationType(val);
          if (converted && converted !== existingVal) updateData[field] = converted;
        } else if (field === "clientType") {
          if (!existingVal || existingVal === "individual") {
            const converted = normalizeClientType(val);
            if (converted && converted !== existingVal) updateData[field] = converted;
          }
        } else if (field === "halfYearTax") {
          // boolean: false(기본값)이면 채우기
          if (!existingVal) {
            const isHalf = val.includes("6개월납");
            if (isHalf) updateData[field] = true;
          }
        } else if (field === "openDate") {
          if (!existingVal) {
            const converted = normalizeDate(val);
            if (converted) updateData[field] = converted;
          }
        } else if (field === "monthlyFee") {
          if (existingVal == null) {
            const num = parseInt(val.replace(/[^0-9]/g, ""));
            if (!isNaN(num)) updateData[field] = num;
          }
        } else {
          // 나머지 필드: 빈칸만 채우기
          if (!existingVal) updateData[field] = val;
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
