// wehago-clients.csv를 읽어서 DB에 반영
// 실행: npx tsx scripts/import-wehago-to-db.ts
// npm run dev가 실행 중이어야 함

import * as fs from "fs";

const API_URL = "http://localhost:3000/api/import-wehago-info";

async function main() {
  const csv = fs.readFileSync("scripts/wehago-clients.csv", "utf-8");
  const lines = csv.split("\n").slice(1).filter(Boolean); // 헤더 제외

  const data = lines.map((line) => {
    // BOM 제거 후 파싱
    const clean = line.replace(/^\uFEFF/, "");
    const parts = clean.split(",").map((s) => s.replace(/"/g, "").trim());
    return {
      id: parseInt(parts[0]),
      bizNumber: parts[2],
      cno: parts[3],
      cdCom: parts[4],
    };
  });

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
