// 원천세 자동신고 작업(job) 메모리 저장소
// 원천세 탭에서 [파일 제작]을 누르면 job을 만들고, 크롬 확장이 위하고에서 파일을 제작하는 동안
// 진행 상황을 여기에 기록한다. (서버 재시작 시 사라져도 되는 단기 상태 — 결과는 DB에 남김)

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
  jobs.set(job.id, full);
  // 오래된 job 정리 (2시간)
  for (const [id, j] of jobs) if (Date.now() - j.startedAt > 2 * 60 * 60 * 1000) jobs.delete(id);
  return full;
}

export function getEfileJob(id: string): EfileJob | undefined {
  return jobs.get(id);
}

export function updateEfileJob(id: string, kind: EfileKind, patch: Partial<EfileJob["progress"][string]>) {
  const j = jobs.get(id);
  if (!j) return;
  j.progress[kind] = { ...(j.progress[kind] || { state: "wait" }), ...patch };
  j.done = j.kinds.every(k => ["done", "error", "skip"].includes(j.progress[k]?.state));
}
