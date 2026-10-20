// 국세청 사업자등록정보 상태조회 (공공데이터포털 오픈API) — 거래처 등록값과 대조해 변동 알림(NtsAlert)을 만든다.
// API: POST https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=KEY  body { b_no: ["1234567890", ...] } (1회 100건)
// 인증키는 .env NTS_API_KEY (코드·깃에 넣지 않음)
import { prisma } from "@/lib/prisma";
import { normalizeBizNumber } from "@/lib/client-scope";

const NTS_BASE = "https://api.odcloud.kr/api/nts-businessman/v1";
const BATCH = 100;

export type NtsStatusRow = {
  b_no: string;
  b_stt: string;              // 계속사업자 | 휴업자 | 폐업자 | 빈값(미등록)
  b_stt_cd: string;           // 01 | 02 | 03 | 빈값
  tax_type: string;           // 부가가치세 일반과세자 등 / 국세청에 등록되지 않은 사업자등록번호입니다.
  tax_type_cd: string;        // 01 일반 | 02 간이 | 03 면세 | 04 비영리법인·국가기관 | 05 수익사업 비영리법인 | 06 고유번호 단체 | 07 간이(세금계산서 발급) | 빈값
  end_dt: string;             // 폐업일 YYYYMMDD
  utcc_yn: string;            // 단위과세전환 여부
  tax_type_change_dt: string; // 과세유형 전환일 YYYYMMDD
  invoice_apply_dt: string;   // 세금계산서 적용일
  rbf_tax_type: string;
  rbf_tax_type_cd: string;
};

export const NTS_TAX_TYPE_LABEL: Record<string, string> = {
  "01": "일반과세",
  "02": "간이과세",
  "03": "면세사업자",
  "04": "비영리법인·국가기관",
  "05": "수익사업 비영리법인",
  "06": "고유번호 단체",
  "07": "간이과세(세금계산서 발급)",
};

export const NTS_STATUS_LABEL: Record<string, string> = {
  "01": "계속사업자",
  "02": "휴업",
  "03": "폐업",
};

export const NTS_MANAGER_ROLES = ["owner", "admin", "accountant"];

/** 우리 과세유형 값 → 국세청에서 기대하는 과세유형 코드 집합. null이면 비교 대상 아님(프리랜서·폐업·미입력) */
function expectedTaxCodes(taxationType: string | null | undefined): Set<string> | null {
  const t = (taxationType ?? "").trim();
  switch (t) {
    case "과세":
    case "상가임대업":
      return new Set(["01"]);
    case "간이":
      return new Set(["02"]);
    case "간이(세금계산서발행)":
      return new Set(["07"]);
    case "면세":
      return new Set(["03", "04", "05", "06"]);
    default:
      return null;
  }
}

/** 국세청 과세유형 코드 → 우리 taxationType 값 (알림 '반영' 시 사용) */
export function ntsTaxCodeToTaxationType(code: string | null | undefined): string | null {
  switch (code) {
    case "01": return "과세";
    case "02": return "간이";
    case "07": return "간이(세금계산서발행)";
    case "03":
    case "04":
    case "05":
    case "06":
      return "면세";
    default: return null;
  }
}

export const fmtYmd = (s: string | null | undefined) =>
  s && s.length === 8 ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6)}` : (s || "");

/** 사업자번호 목록(10자리 숫자) → 국세청 상태 행. 100건씩 나눠 호출 */
export async function fetchNtsStatus(bizNos: string[]): Promise<NtsStatusRow[]> {
  const key = process.env.NTS_API_KEY;
  if (!key) throw new Error("NTS_API_KEY 환경변수가 없습니다 (.env에 공공데이터포털 인증키를 넣어주세요)");
  const out: NtsStatusRow[] = [];
  for (let i = 0; i < bizNos.length; i += BATCH) {
    const chunk = bizNos.slice(i, i + BATCH);
    const res = await fetch(`${NTS_BASE}/status?serviceKey=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ b_no: chunk }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`국세청 API 오류 ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { status_code?: string; data?: NtsStatusRow[] };
    if (json.status_code !== "OK" || !Array.isArray(json.data)) {
      throw new Error(`국세청 API 응답 이상: ${JSON.stringify(json).slice(0, 200)}`);
    }
    out.push(...json.data);
  }
  return out;
}

export type NtsCheckResult = {
  at: string;
  checked: number;      // 국세청에 조회한 거래처 수
  created: number;      // 새로 생긴 알림
  autoResolved: number; // 다시 일치해져 자동 종료된 알림
  skipped: number;      // 사업자번호가 없거나 형식이 틀려 건너뛴 거래처
  error?: string;
};

type DesiredAlert = { kind: string; before: string; after: string; afterCode: string | null; detail: string | null };

/** 활성 거래처 전체를 국세청에 조회해 등록값과 다른 것을 NtsAlert로 쌓는다 (매일 cron + '지금 점검' 버튼 공용) */
export async function runNtsCheck(): Promise<NtsCheckResult> {
  const at = new Date();
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, contractStatus: "active" },
    select: { id: true, name: true, bizNumber: true, taxationType: true },
  });

  const targets = clients
    .map(c => ({ ...c, bno: normalizeBizNumber(c.bizNumber) }))
    .filter(c => /^\d{10}$/.test(c.bno));
  const skipped = clients.length - targets.length;
  const uniqueBnos = [...new Set(targets.map(c => c.bno))];

  let rows: NtsStatusRow[];
  try {
    rows = await fetchNtsStatus(uniqueBnos);
  } catch (e) {
    const result: NtsCheckResult = {
      at: at.toISOString(), checked: 0, created: 0, autoResolved: 0, skipped,
      error: e instanceof Error ? e.message : String(e),
    };
    await saveLastCheck(result);
    return result;
  }
  const byBno = new Map(rows.map(r => [r.b_no, r]));

  const [openAlerts, dismissed] = await Promise.all([
    prisma.ntsAlert.findMany({ where: { resolvedAt: null }, select: { id: true, clientId: true, kind: true, after: true } }),
    prisma.ntsAlert.findMany({ where: { resolution: "dismissed" }, select: { clientId: true, kind: true, after: true } }),
  ]);
  const openByClient = new Map<number, { id: number; kind: string; after: string }[]>();
  for (const a of openAlerts) {
    if (!openByClient.has(a.clientId)) openByClient.set(a.clientId, []);
    openByClient.get(a.clientId)!.push(a);
  }
  const dismissedKeys = new Set(dismissed.map(d => `${d.clientId}|${d.kind}|${d.after}`));

  let created = 0;
  let autoResolved = 0;
  let checked = 0;

  for (const c of targets) {
    const row = byBno.get(c.bno);
    if (!row) continue;
    checked++;

    const desired: DesiredAlert[] = [];
    const ours = (c.taxationType ?? "").trim();
    if (row.b_stt_cd === "") {
      desired.push({ kind: "unregistered", before: c.bizNumber ?? c.bno, after: "국세청 미등록 번호", afterCode: null, detail: "사업자번호 오기입 가능성" });
    } else {
      if ((row.b_stt_cd === "02" || row.b_stt_cd === "03") && ours !== "폐업") {
        desired.push({
          kind: "status",
          before: ours || "계속사업자",
          after: NTS_STATUS_LABEL[row.b_stt_cd],
          afterCode: row.b_stt_cd,
          detail: row.end_dt ? `폐업일 ${fmtYmd(row.end_dt)}` : null,
        });
      }
      const expected = expectedTaxCodes(ours);
      if (expected && row.tax_type_cd && !expected.has(row.tax_type_cd)) {
        desired.push({
          kind: "taxType",
          before: ours,
          after: NTS_TAX_TYPE_LABEL[row.tax_type_cd] ?? row.tax_type,
          afterCode: row.tax_type_cd,
          detail: row.tax_type_change_dt ? `전환일 ${fmtYmd(row.tax_type_change_dt)}` : null,
        });
      }
    }

    const open = openByClient.get(c.id) ?? [];
    const desiredKinds = new Set(desired.map(d => d.kind));

    // 더 이상 다르지 않은 알림은 자동 종료
    for (const a of open) {
      if (!desiredKinds.has(a.kind)) {
        await prisma.ntsAlert.update({ where: { id: a.id }, data: { resolvedAt: at, resolution: "auto" } });
        autoResolved++;
      }
    }
    for (const d of desired) {
      const existing = open.find(a => a.kind === d.kind);
      if (existing) {
        if (existing.after === d.after) continue; // 이미 떠 있는 알림
        await prisma.ntsAlert.update({ where: { id: existing.id }, data: { resolvedAt: at, resolution: "superseded" } });
      } else if (dismissedKeys.has(`${c.id}|${d.kind}|${d.after}`)) {
        continue; // 같은 내용을 이미 '확인'했으면 다시 띄우지 않음
      }
      await prisma.ntsAlert.create({ data: { clientId: c.id, ...d, detectedAt: at } });
      created++;
    }

    await prisma.client.update({
      where: { id: c.id },
      data: { ntsStatusCode: row.b_stt_cd, ntsTaxTypeCode: row.tax_type_cd, ntsCheckedAt: at },
    });
  }

  const result: NtsCheckResult = { at: at.toISOString(), checked, created, autoResolved, skipped };
  await saveLastCheck(result);
  return result;
}

const LAST_CHECK_KEY = "nts.lastCheck";

async function saveLastCheck(result: NtsCheckResult) {
  await prisma.appConfig.upsert({
    where: { key: LAST_CHECK_KEY },
    create: { key: LAST_CHECK_KEY, value: JSON.stringify(result) },
    update: { value: JSON.stringify(result) },
  });
}

export async function getNtsLastCheck(): Promise<NtsCheckResult | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: LAST_CHECK_KEY } });
  if (!row) return null;
  try { return JSON.parse(row.value) as NtsCheckResult; } catch { return null; }
}
