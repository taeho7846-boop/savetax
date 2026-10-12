// 브라우저 로컬 기준 오늘 "YYYY-MM-DD" (클라이언트 컴포넌트용)
export function todayKeyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
