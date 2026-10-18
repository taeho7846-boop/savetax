import * as XLSX from "xlsx";
import { normalizeBizNumber } from "@/lib/client-scope";

/**
 * 세모리포트 '고객관리목록' 엑셀 파싱 + 기장대리 거래처 대조 (순수 로직, DB 의존 없음).
 * 엑셀 헤더 예: 거래처명 | 사업자번호 | 대표자명 | 휴대폰번호 | ... | 계약상태 | ... | 담당자 | ...
 * 매칭 키는 사업자번호(숫자 10자리). 사업자번호가 없으면 거래처명 완전일치로 보조 매칭.
 */

export type SemoRow = {
  name: string;
  bizNumber: string; // 10자리 숫자 (없으면 "")
  bizFormatted: string;
  ceoName: string;
  phone: string;
  contract: string; // 계약상태 (기장개인 / 기장법인 / "" = '-')
  manager: string; // 담당자
};

export type SemoClientInput = {
  id: number;
  name: string;
  bizNumber: string | null;
  ceoName: string | null;
  clientType: string;
  contractStatus: string;
  semoReportStatus: string;
  assignedUser: { name: string } | null;
};

export type SemoItem = {
  id: number;
  name: string;
  bizNumber: string | null;
  ceoName: string | null;
  clientType: string;
  contractStatus: string;
  semoStatus: string; // use | none | excluded
  assignedUser: string | null;
  semo: SemoRow | null; // 엑셀에서 매칭된 행 (없으면 null)
  suggested: "use" | "none" | null; // 권장 상태 변경
  note?: string;
};

export type SemoCompareResult = {
  semoCount: number;
  clientCount: number;
  summary: { matched: number; matchedNeedUse: number; missing: number; terminated: number; semoOnly: number; excluded: number };
  groups: { matched: SemoItem[]; missing: SemoItem[]; terminated: SemoItem[]; excluded: SemoItem[]; semoOnly: SemoRow[] };
};

function cellText(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "-" ? "" : s;
}

function formatBiz(d: string) {
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d;
}

function normName(s: string | null | undefined) {
  return (s ?? "").replace(/\s+/g, "").replace(/[()（）]/g, "").toLowerCase();
}

/** 엑셀 바이너리 → 세모리포트 행 목록. 실패 시 Error(사용자에게 보여줄 메시지) throw */
export function parseSemoExcel(buf: ArrayBuffer | Uint8Array): SemoRow[] {
  let rows: unknown[][];
  try {
    const wb = XLSX.read(buf, { type: buf instanceof Uint8Array ? "buffer" : "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  } catch {
    throw new Error("엑셀 파일을 읽을 수 없습니다");
  }

  // 헤더 행 찾기 (상위 10행 안에서 '사업자번호' 포함 행)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] ?? [];
    if (r.some(c => String(c ?? "").replace(/\s+/g, "").includes("사업자번호"))) { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    throw new Error("'사업자번호' 열을 찾을 수 없습니다. 세모리포트 고객관리목록 엑셀인지 확인해주세요.");
  }
  const header = (rows[headerIdx] ?? []).map(c => String(c ?? "").replace(/\s+/g, ""));
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = header.findIndex(h => h === n);
      if (i !== -1) return i;
    }
    for (const n of names) {
      const i = header.findIndex(h => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };
  const cName = col("거래처명", "상호", "사업장명");
  const cBiz = col("사업자번호", "사업자등록번호");
  const cCeo = col("대표자명", "대표자");
  const cPhone = col("휴대폰번호", "연락처", "전화번호");
  const cContract = col("계약상태");
  const cManager = col("담당자");

  const out: SemoRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(c => c == null || String(c).trim() === "")) continue;
    const biz = normalizeBizNumber(r[cBiz]);
    const name = cellText(cName >= 0 ? r[cName] : "");
    if (!biz && !name) continue;
    out.push({
      name,
      bizNumber: biz,
      bizFormatted: formatBiz(biz),
      ceoName: cellText(cCeo >= 0 ? r[cCeo] : ""),
      phone: cellText(cPhone >= 0 ? r[cPhone] : ""),
      contract: cellText(cContract >= 0 ? r[cContract] : ""),
      manager: cellText(cManager >= 0 ? r[cManager] : ""),
    });
  }
  if (out.length === 0) throw new Error("엑셀에 거래처 데이터가 없습니다");
  return out;
}

/** 기장대리 거래처(계약중+해지) ↔ 세모리포트 행 대조 */
export function compareSemo(clients: SemoClientInput[], semoRows: SemoRow[]): SemoCompareResult {
  const semoByBiz = new Map<string, SemoRow>();
  const semoByName = new Map<string, SemoRow>();
  for (const s of semoRows) {
    if (s.bizNumber && !semoByBiz.has(s.bizNumber)) semoByBiz.set(s.bizNumber, s);
    const nn = normName(s.name);
    if (nn && !semoByName.has(nn)) semoByName.set(nn, s);
  }

  const matchedSemo = new Set<SemoRow>();
  const matched: SemoItem[] = [];    // 계약중 + 세모에 있음
  const missing: SemoItem[] = [];    // 계약중 + 세모에 없음 (제외 아님)
  const excluded: SemoItem[] = [];   // 계약중 + 제외 처리 + 세모에 없음
  const terminated: SemoItem[] = []; // 해지인데 세모에 남아있거나 '사용' 상태

  for (const c of clients) {
    const biz = normalizeBizNumber(c.bizNumber);
    let semo: SemoRow | null = biz ? semoByBiz.get(biz) ?? null : null;
    let note: string | undefined;
    if (!semo) {
      const byName = semoByName.get(normName(c.name));
      // 사업자번호가 한쪽이라도 없을 때만 이름 매칭 (번호가 둘 다 있는데 다르면 다른 사업자)
      if (byName && (!biz || !byName.bizNumber)) {
        semo = byName;
        note = "거래처명으로 매칭";
      }
    }
    if (semo) matchedSemo.add(semo);
    if (!biz && !semo) note = "사업자번호 없음";

    const base: SemoItem = {
      id: c.id,
      name: c.name,
      bizNumber: c.bizNumber,
      ceoName: c.ceoName,
      clientType: c.clientType,
      contractStatus: c.contractStatus,
      semoStatus: c.semoReportStatus,
      assignedUser: c.assignedUser?.name ?? null,
      semo,
      suggested: null,
      note,
    };

    if (c.contractStatus !== "active") {
      if (semo || c.semoReportStatus === "use") terminated.push({ ...base, suggested: "none" });
      continue;
    }
    if (semo) {
      matched.push({ ...base, suggested: c.semoReportStatus === "use" ? null : "use" });
    } else if (c.semoReportStatus === "excluded") {
      excluded.push(base);
    } else {
      missing.push({ ...base, suggested: c.semoReportStatus === "use" ? "none" : null });
    }
  }

  const semoOnly = semoRows.filter(s => !matchedSemo.has(s));

  return {
    semoCount: semoRows.length,
    clientCount: clients.length,
    summary: {
      matched: matched.length,
      matchedNeedUse: matched.filter(m => m.suggested === "use").length,
      missing: missing.length,
      terminated: terminated.length,
      semoOnly: semoOnly.length,
      excluded: excluded.length,
    },
    groups: { matched, missing, terminated, excluded, semoOnly },
  };
}
