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
  progress: Record<string, { state: "wait" | "running" | "done" | "error" | "skip"; message?: string; fileId?: number; fileName?: string; produced?: string[]; skipped?: string[] }>;
  done: boolean;
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
    progress: Object.fromEntries(job.kinds.map(k => [k, { state: "wait" as const }])),
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
  if (j.progress[kind]?.state === "done" && patch.state === "running") return;
  j.progress[kind] = { ...(j.progress[kind] || { state: "wait" }), ...patch };
  j.done = j.kinds.every(k => ["done", "error", "skip"].includes(j.progress[k]?.state));
  saveStore();
}
