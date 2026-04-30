import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const norm = (s: string | null | undefined) => (s || "").replace(/[\s-]/g, "");

type FileEntry = { filename: string };

type MatchResult =
  | { filename: string; status: "matched"; clientId: number; clientName: string; ceoName: string | null; driveFolderId: string; year: string; warning?: string }
  | { filename: string; status: "warning_no_drive"; clientId: number; clientName: string; ceoName: string | null; year: string; reason: string }
  | { filename: string; status: "fail_parse"; reason: string }
  | { filename: string; status: "fail_no_match"; reason: string; parsedName?: string; parsedRRN?: string; parsedYear?: string }
  | { filename: string; status: "fail_rrn_mismatch"; reason: string; parsedName: string; parsedRRN: string; candidateClients: { id: number; name: string; rrn: string | null }[] };

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { files, taxYear } = (await req.json()) as { files: FileEntry[]; taxYear: string };
  if (!Array.isArray(files)) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  // 권한: 종소세 페이지와 동일한 범위 (자기 + 부하직원)
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map((e) => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  const clients = await prisma.client.findMany({
    where: {
      isDeleted: false,
      ...assignedFilter,
      clientType: { not: "corporate" },
    },
    select: {
      id: true,
      name: true,
      ceoName: true,
      residentNumber: true,
      driveFolderId: true,
    },
  });

  // 인덱스: 정규화된 주민번호 → 거래처들
  const byRRN = new Map<string, typeof clients>();
  const byName = new Map<string, typeof clients>();
  for (const c of clients) {
    const rrnKey = norm(c.residentNumber);
    if (rrnKey) {
      if (!byRRN.has(rrnKey)) byRRN.set(rrnKey, []);
      byRRN.get(rrnKey)!.push(c);
    }
    const nameKey = (c.ceoName || "").trim();
    if (nameKey) {
      if (!byName.has(nameKey)) byName.set(nameKey, []);
      byName.get(nameKey)!.push(c);
    }
  }

  const re = /^(\d{4})_종합소득세신고안내문_(.+?)\((\d{13})\)_(\d+)\.pdf$/;

  const results: MatchResult[] = files.map((f) => {
    const m = re.exec(f.filename);
    if (!m) {
      return {
        filename: f.filename,
        status: "fail_parse",
        reason: "파일명 형식이 예상과 다릅니다 (예: 2025_종합소득세신고안내문_홍길동(1234561234567)_20260501000000.pdf)",
      };
    }
    const [, year, parsedName, parsedRRN] = m;

    // 1순위: 주민번호 매칭
    const rrnHits = byRRN.get(parsedRRN) || [];
    const exactName = rrnHits.filter((c) => (c.ceoName || "").trim() === parsedName.trim());

    if (exactName.length > 0) {
      const c = exactName[0];
      const warning = year !== taxYear ? `연도 불일치 (파일: ${year}년, 페이지: ${taxYear}년)` : undefined;
      if (!c.driveFolderId) {
        return {
          filename: f.filename,
          status: "warning_no_drive",
          clientId: c.id,
          clientName: c.name,
          ceoName: c.ceoName,
          year,
          reason: "거래처는 매칭됐으나 구글드라이브 폴더가 연결되어 있지 않습니다",
        };
      }
      return {
        filename: f.filename,
        status: "matched",
        clientId: c.id,
        clientName: c.name,
        ceoName: c.ceoName,
        driveFolderId: c.driveFolderId,
        year,
        ...(warning ? { warning } : {}),
      };
    }

    // 주민번호 매칭됐으나 이름 다름
    if (rrnHits.length > 0) {
      return {
        filename: f.filename,
        status: "fail_rrn_mismatch",
        reason: `주민번호는 일치하나 대표자명이 다릅니다 (파일: ${parsedName}, DB: ${rrnHits.map((c) => c.ceoName).join(", ")})`,
        parsedName,
        parsedRRN,
        candidateClients: rrnHits.map((c) => ({ id: c.id, name: c.name, rrn: c.residentNumber })),
      };
    }

    // 이름은 있는데 주민번호 다름
    const nameHits = byName.get(parsedName.trim()) || [];
    if (nameHits.length > 0) {
      return {
        filename: f.filename,
        status: "fail_rrn_mismatch",
        reason: `대표자명은 일치하나 주민번호가 다릅니다 (DB에 ${nameHits.length}명 존재, 모두 주민번호 불일치)`,
        parsedName,
        parsedRRN,
        candidateClients: nameHits.map((c) => ({ id: c.id, name: c.name, rrn: c.residentNumber })),
      };
    }

    return {
      filename: f.filename,
      status: "fail_no_match",
      reason: "이름·주민번호와 일치하는 거래처가 없습니다 (담당 거래처 범위 내 검색)",
      parsedName,
      parsedRRN,
      parsedYear: year,
    };
  });

  return NextResponse.json({ results });
}
