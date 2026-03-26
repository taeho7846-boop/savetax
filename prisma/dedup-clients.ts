import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const adapter = new PrismaBetterSqlite3({ url: `file:${path.join(process.cwd(), "dev.db")}` });
const prisma = new PrismaClient({ adapter });

// 구버전(이름 오타/다른이름, 기장료 없음) → 삭제 대상 ID
// 옆에 → 남길 쪽 표시
const DELETE_IDS = [
  2,   // (주) 딥포커스랩    → (주) 딥포커스탭 (92)
  6,   // 제이앤앨(J&L)도장  → 제이앤엘(J&L)도장 (102)
  7,   // 씨엔케이물류       → 씨엔케이이물류 (103)
  8,   // 용인동백역현성...   → 인동백역현성... (104)
  10,  // (주)에스온         → (주)예스온 (93)
  13,  // 피자스쿨(무선점)   → 피자스쿨무선점 (86)
  17,  // 세븐당구장         → 세분당구장 (87)
  18,  // 선재치킨           → 신재치킨 (81)
  19,  // 조혜민로지스       → 조해민로지스 (88)
  20,  // 포휘엔             → 포튀엔 (89)
  23,  // 스테이 핏          → 스테이 뭣 (82)
  29,  // 비온탑스터디카페...  → 탑스터디카페 영동포시장 (83)
  37,  // (주) 시아게임즈    → 주식회사 시아게임즈 (85)
  40,  // 조이스토리         → 김스토리 (80)
  43,  // (주) 쿨텍코리아    → 주식회사 플렉코리아 (91)
  46,  // (주) 클린미션      → 주식회사 콜린미선 (84)
  49,  // 본죽&비빔밥 cafe... → ☆비빔밥 cafe 성수힐스테이 (94)
  54,  // 혁테크             → 현태크 (95)
  55,  // (주) 어센드위더스  → (주) 어센드워서비스 (90)
  56,  // 해뜰날             → 해돌날 (96)
  57,  // 하예컴퍼니         → 하에컴퍼니 (97)
  66,  // 훈민정원           → 최론 (99)
  72,  // 휴대폰성지 폰통령   → 폰통통 (98)
  73,  // (주) 노벤트        → 주식회사 노벤트 (100)
  75,  // 신전떡복이         → 신전떡볶이 (101)
];

async function main() {
  // 삭제 전 목록 출력
  const targets = await prisma.client.findMany({
    where: { id: { in: DELETE_IDS } },
    select: { id: true, name: true, ceoName: true, phone: true },
    orderBy: { id: "asc" },
  });

  console.log("=== 삭제 대상 ===");
  targets.forEach((c) => console.log(`  [${c.id}] ${c.name} / ${c.ceoName} / ${c.phone}`));
  console.log(`총 ${targets.length}개`);

  const result = await prisma.client.updateMany({
    where: { id: { in: DELETE_IDS } },
    data: { isDeleted: true },
  });

  console.log(`\n완료: ${result.count}개 삭제됨`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
