import { createHmac, timingSafeEqual } from "crypto";

// 자료수집용 단기 서명 토큰
// 크롬 확장은 앱 세션 쿠키를 실을 수 없으므로, 세션 인증된 페이지가
// 자격증명 요청 시 발급받아 확장에 전달하고, 확장이 수집 결과 보고 시 제시한다.
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2시간 (연도별 수집 루프 여유)

function secret(): string {
  return process.env.COLLECT_TOKEN_SECRET || process.env.DATABASE_URL || "savetax-collect";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function mintCollectToken(clientId: number): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${clientId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyCollectToken(token: unknown, clientId: number): boolean {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [cid, exp, sig] = parts;
  if (Number(cid) !== clientId) return false;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = sign(`${cid}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
