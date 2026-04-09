// wehago-clients-result.json을 읽어서 DB에 반영
// 실행: npx tsx scripts/import-wehago-to-db.ts
// npm run dev 또는 프로덕션 서버가 실행 중이어야 함

import * as fs from "fs";

const API_URL = "http://localhost:3000/api/import-wehago-info";
// VPS에서는: const API_URL = "http://localhost/api/import-wehago-info";

type Result = { id: number; name: string; bizNumber: string; cno: string; cdCom: string; colors: Record<string, string> };

async function main() {
  const results: Result[] = JSON.parse(fs.readFileSync("scripts/wehago-clients-result.json", "utf-8"));

  // 실패한 3개 수동 추가 (color)
  for (const r of results) {
    if (r.name.includes("쿨텍코리아") && !r.colors["2026"]) r.colors["2026"] = "#1C90FB";
    if (r.name.includes("소스트") && !r.colors["2026"]) r.colors["2026"] = "#1C90FB";
    if (r.name.includes("위더스메디케어") && !r.colors["2026"]) r.colors["2026"] = "#1C90FB";
  }

  const data = results.map((r) => ({
    id: r.id,
    bizNumber: r.bizNumber,
    cno: r.cno,
    cdCom: r.cdCom,
    colors: JSON.stringify(r.colors),
  }));

  console.log(`${data.length}개 거래처 DB 반영 시작...`);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });

  const result = await res.json();
  console.log(`✅ 완료! ${result.updated}개 업데이트`);
}

main().catch(console.error);
