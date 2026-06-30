// 비품정산 — 공용 상수 & 계산 (서버/클라이언트 공용, "use server" 아님)

// 분배 대상 인원 (사용자 지정 순서 그대로)
export const SUPPLY_PEOPLE = [
  "도희수",
  "이휘언",
  "이종민",
  "최원석",
  "김태호",
  "전민우",
  "최하영",
] as const;

export type SupplyItem = {
  id: number;
  item: string;
  amount: number;
  payer: string;
  channel: string | null;
  participants: string[]; // 분배(체크)된 사람들
};

// 참여자 CSV <-> 배열
export function parseParticipants(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}
export function joinParticipants(list: string[]): string {
  // 정해진 순서로 정렬해 저장 (중복 제거)
  const set = new Set(list);
  return SUPPLY_PEOPLE.filter((p) => set.has(p)).join(",");
}

// 월별 사람별 순정산액 계산.
// 결제자는 금액 전액을 선납 → (+), 참여자는 1/N 부담 → (-).
// 양수 = 받을 돈, 음수 = 낼 돈.
export function computeNet(items: SupplyItem[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const p of SUPPLY_PEOPLE) net[p] = 0;

  for (const it of items) {
    const parts = it.participants.filter((p) => (SUPPLY_PEOPLE as readonly string[]).includes(p));
    if (parts.length === 0) continue;
    const share = it.amount / parts.length;
    if (net[it.payer] !== undefined) net[it.payer] += it.amount; // 결제자 선납
    for (const p of parts) net[p] -= share; // 참여자 부담
  }
  // 표시는 원 단위 반올림
  for (const p of Object.keys(net)) net[p] = Math.round(net[p]);
  return net;
}
