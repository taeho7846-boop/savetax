// 원천세 자동신고 작업(job) 메모리 저장소
// 원천세 탭에서 [파일 제작]을 누르면 job을 만들고, 크롬 확장이 위하고에서 파일을 제작하는 동안
// 진행 상황을 여기에 기록한다. (단기 상태 — 결과는 DB에 남김)
// 배포(main push → pm2 restart)로 서버가 재시작돼도 진행 중인 작업이 끊기지 않도록 임시 폴더의 파일에도 적어 둔다.
// (2026-10-07: 제작 도중 재시작되어 확장이 "작업 없음(만료)"로 결과를 저장하지 못하고 화면이 '진행 중'에 멈춘 사고)
import fs from "fs";
import os from "os";
import path from "path";

export type EfileKind = "income" | "local";

export type EfileJob = {
  id: string;
  userId: number;
  yearMonth: string;           // "2026-09"
  payYm: string;               // "202609"
  kinds: EfileKind[];
  targets: { clientId: number; name: string; cno: string }[];
  startedAt: number;
  // kind별 진행 상태
  progress: Record<string, EfileProgress>;
  done: boolean;
  // ---- 제출 작업(type "submit")에서만 쓰는 값 ----
  type?: "produce" | "submit";
  // kind별 제출할 파일 (홈택스=income, 위택스=local)
  files?: Record<string, EfileSubmitFile>;
};

// 검증 결과(홈택스 파일검증 / 위택스 서식검증) — 사람이 보고 [제출]을 누를지 판단하는 근거
export type EfileVerify = {
  fileName?: string;
  target?: number | null;      // 대상 납세자 수
  formatErr?: number | null;   // 형식 오류
  contentErr?: number | null;  // 내용 오류
  normal?: number | null;      // 정상 건수
  taxTotal?: number | null;    // 화면에서 읽은 세액 합계 (읽힌 경우만)
  rows?: string[];             // 화면에서 읽은 행(사람 확인용 요약)
  notes?: string[];            // 진행 중 사이트가 띄운 안내 문구
};
export type EfileProgress = {
  // verified = 검증까지 끝나고 사람의 [제출] 확인을 기다리는 중, submitting = 확인 받고 제출 진행 중
  state: "wait" | "running" | "verified" | "submitting" | "done" | "error" | "skip";
  message?: string; fileId?: number; fileName?: string; produced?: string[]; skipped?: string[];
  verify?: EfileVerify;
  confirmed?: boolean;   // 사이트에서 [제출]을 눌렀는지 (확장이 폴링)
  cancelled?: boolean;   // 사이트에서 [취소]를 눌렀는지
  receipts?: string[];   // 홈택스 접수번호 / 위택스 일괄신고ID
};
export type EfileSubmitFile = {
  fileId: number; fileName: string; clientIds: number[]; names: string[];
  expectCount: number; expectAmount: number | null; alreadySubmitted: string[];
};

const jobs = new Map<string, EfileJob>();
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const STORE_PATH = path.join(os.tmpdir(), "savetax-efile-jobs.json");
let storeLoaded = false;
function loadStore() {
  if (storeLoaded) return;
  storeLoaded = true;
  try {
    const arr = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    if (!Array.isArray(arr)) return;
    for (const j of arr) {
      if (j && typeof j.id === "string" && typeof j.startedAt === "number" && Date.now() - j.startedAt < JOB_TTL_MS && !jobs.has(j.id)) jobs.set(j.id, j as EfileJob);
    }
  } catch { /* 파일 없음·손상 → 빈 상태로 시작 */ }
}
function saveStore() {
  try {
    const tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify([...jobs.values()]));
    fs.renameSync(tmp, STORE_PATH);
  } catch { /* 저장 실패는 무시 (메모리 상태로 계속 동작) */ }
}

// 마감상태 조회 진행 상황 (사용자×월×종류) — 확장이 PATCH로 보고, 원천세 탭이 GET으로 읽음
export type CloseCheckProgress = { state: "running" | "done" | "error"; done: number; total: number; closed: number; message: string; at: number };
const closeCheckProgress = new Map<string, CloseCheckProgress>();
export function setCloseCheckProgress(userId: number, yearMonth: string, kind: string, p: Omit<CloseCheckProgress, "at">) {
  closeCheckProgress.set(`${userId}:${yearMonth}:${kind}`, { ...p, at: Date.now() });
}
export function getCloseCheckProgress(userId: number, yearMonth: string, kind: string): CloseCheckProgress | null {
  const p = closeCheckProgress.get(`${userId}:${yearMonth}:${kind}`);
  if (!p || Date.now() - p.at > 30 * 60 * 1000) return null;
  return p;
}

export function createEfileJob(job: Omit<EfileJob, "progress" | "done">): EfileJob {
  const full: EfileJob = {
    ...job,
    progress: Object.fromEntries(job.kinds.map(k => [k, { state: "wait" } as EfileProgress])),
    done: false,
  };
  loadStore();
  jobs.set(job.id, full);
  // 오래된 job 정리 (2시간)
  for (const [id, j] of jobs) if (Date.now() - j.startedAt > JOB_TTL_MS) jobs.delete(id);
  saveStore();
  return full;
}

export function getEfileJob(id: string): EfileJob | undefined {
  loadStore();
  return jobs.get(id);
}

export function updateEfileJob(id: string, kind: EfileKind, patch: Partial<EfileJob["progress"][string]>) {
  loadStore();
  const j = jobs.get(id);
  if (!j) return;
  // 이미 끝난(완료) 종류를 뒤늦게 도착한 '진행 중' 보고가 되돌리지 않게
  const cur = j.progress[kind]?.state;
  if (cur === "done" && patch.state && patch.state !== "done") return;
  // 검증 대기·제출 중 상태도 늦게 온 '진행 중' 보고가 되돌리지 않게 (제출 진행은 submitting으로 보고)
  if ((cur === "verified" || cur === "submitting") && patch.state === "running") return;
  j.progress[kind] = { ...(j.progress[kind] || { state: "wait" }), ...patch };
  j.done = j.kinds.every(k => ["done", "error", "skip"].includes(j.progress[k]?.state));
  saveStore();
}
