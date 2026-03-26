import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });

const prisma = new PrismaClient({ adapter });

// 완료 = "paid" 로만 기록 (미수는 레코드 없음 = 기본값)
const DATA = [
  // ── 2025-12 시작 ──────────────────────────────────────────
  { name: "김스토리",    ceo: "김윤준", phone: "010-3243-3556", fee: 88000,  first: "2025-12", paid: ["2025-12","2026-01","2026-02","2026-03"] },
  { name: "무제",        ceo: "서정현", phone: "010-5121-8460", fee: 88000,  first: "2025-12", paid: ["2025-12","2026-01","2026-02","2026-03"] },
  { name: "쇠터닭갈비",  ceo: "남궁본", phone: "010-3373-3625", fee: 110000, first: "2025-12", paid: ["2025-12","2026-01","2026-02","2026-03","2026-04"] },
  { name: "신재치킨",    ceo: "이선욱", phone: "010-5354-1191", fee: 88000,  first: "2025-12", paid: [] },

  // ── 2026-01 시작 ──────────────────────────────────────────
  { name: "이오복순대국 대치은마점", ceo: "허준호", phone: "010-3928-2289", fee: 88000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03","2026-04"] },
  { name: "레몬노래연습장",          ceo: "안온용", phone: "010-5474-8100", fee: 66000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "스테이 뭣",               ceo: "김수현", phone: "010-7573-7703", fee: 88000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "사랑나무동물병원",        ceo: "정여진", phone: "010-8626-4416", fee: 110000, first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "피에스디자인 강남점",     ceo: "김민서", phone: "010-2458-0499", fee: 88000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "켈리패밀리",              ceo: "이한재", phone: "010-5240-9035", fee: 66000,  first: "2026-01", paid: ["2026-01","2026-02"] },
  { name: "리안인테리어",            ceo: "송기원", phone: "010-4107-5423", fee: 66000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "지안",                    ceo: "이윤경", phone: "010-3787-0137", fee: 110000, first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "탑스터디카페 영동포시장", ceo: "김시명", phone: "010-9269-1790", fee: 66000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "위투게더 발달센터",       ceo: "장열",   phone: "010-3346-2753", fee: 66000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "(주) 위커밋",             ceo: "강수진", phone: "010-8561-4727", fee: 165000, first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "(주) 도움컴퍼니",         ceo: "정미애", phone: "010-8332-7056", fee: 165000, first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "주식회사 콜린미선",       ceo: "윤종윤", phone: "010-7189-8619", fee: 165000, first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "에이치제이",              ceo: "홍형종", phone: "010-5324-1237", fee: 88000,  first: "2026-01", paid: ["2026-01","2026-02","2026-03"] },
  { name: "주식회사 시아게임즈",     ceo: "박준규", phone: "010-6646-8703", fee: 165000, first: "2026-01", paid: ["2026-01","2026-03"] },

  // ── 2026-03 시작 ──────────────────────────────────────────
  { name: "보스밀리",         ceo: "박종문", phone: "010-7357-0708", fee: 88000,  first: "2026-03", paid: [] },
  { name: "(주) 펫니멀",      ceo: "박종문", phone: "010-7357-0708", fee: 165000, first: "2026-03", paid: [] },
  { name: "피자스쿨무선점",   ceo: "김하나", phone: "010-7615-8570", fee: 110000, first: "2026-03", paid: ["2026-03"] },
  { name: "세분당구장",       ceo: "임근택", phone: "010-8738-1688", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "조해민로지스",     ceo: "조혜민", phone: "010-9729-5670", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "포튀엔",           ceo: "한성품", phone: "010-4796-4536", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "(주) 어센드워서비스", ceo: "이종성", phone: "010-8999-2110", fee: 165000, first: "2026-03", paid: ["2026-03"] },
  { name: "도아기업",         ceo: "김종철", phone: "010-9197-9762", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "유비스",           ceo: "최천호", phone: "010-3019-1659", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "가나설비",         ceo: "윤돌병", phone: "010-9246-1384", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "모노유",           ceo: "오은담", phone: "010-8280-9546", fee: 88000,  first: "2026-03", paid: ["2026-03"] },
  { name: "비비큐",           ceo: "문종현", phone: "010-2112-1122", fee: 132000, first: "2026-03", paid: ["2026-03"] },
  { name: "해성안전",         ceo: "권해린", phone: "010-4939-7095", fee: 110000, first: "2026-03", paid: [] },

  // ── 2026-04 시작 ──────────────────────────────────────────
  { name: "지에스컴퍼니",        ceo: "이균희", phone: "010-8774-5399", fee: 88000,  first: "2026-04", paid: ["2026-04"] },
  { name: "한우리건설",          ceo: "김철용", phone: "010-7651-3224", fee: 110000, first: "2026-04", paid: [] },
  { name: "소스마케팅",          ceo: "박수형", phone: "010-5607-4839", fee: 88000,  first: "2026-04", paid: [] },
  { name: "어른김밥",            ceo: "이호석", phone: "010-5683-5691", fee: 154000, first: "2026-04", paid: ["2026-04"] },
  { name: "주식회사 플렉코리아", ceo: "김은주", phone: "010-8571-1288", fee: 165000, first: "2026-04", paid: ["2026-04"] },
  { name: "발부BALBOU",          ceo: "이기창", phone: "010-7102-0301", fee: 88000,  first: "2026-04", paid: ["2026-04"] },
  { name: "발부헤어 전주점",     ceo: "손민중", phone: "010-7493-2123", fee: 110000, first: "2026-04", paid: ["2026-04"] },
  { name: "(주)피플일렉트릭",    ceo: "김성민", phone: "010-8614-0461", fee: 143000, first: "2026-04", paid: [] },
  { name: "서광보말칼국수",      ceo: "유선희", phone: "010-9166-7928", fee: 110000, first: "2026-04", paid: ["2026-04"] },
  { name: "(주) 딥포커스탭",     ceo: "위성석", phone: "010-4056-8213", fee: 143000, first: "2026-04", paid: [] },
  { name: "(주)예스온",          ceo: "윤희원", phone: "010-3719-2688", fee: 165000, first: "2026-04", paid: [] },

  // ── 2026-05 시작 ──────────────────────────────────────────
  { name: "태원기계",                   ceo: "김종태", phone: "010-3879-0443", fee: 88000,  first: "2026-05", paid: [] },
  { name: "☆비빔밥 cafe 성수힐스테이", ceo: "이은화", phone: "010-5763-2004", fee: 110000, first: "2026-05", paid: [] },
  { name: "씨투지(C2G)",                ceo: "주민규", phone: "010-8953-3077", fee: 110000, first: "2026-05", paid: [] },
  { name: "디자인에이지",               ceo: "서경일", phone: "010-2625-1303", fee: 198000, first: "2026-05", paid: [] },
  { name: "베다니전기",                 ceo: "윤은남", phone: "010-7723-6130", fee: 110000, first: "2026-05", paid: [] },
  { name: "중원9568",                   ceo: "박두현", phone: "010-9449-6693", fee: 88000,  first: "2026-05", paid: [] },
  { name: "현태크",                     ceo: "박상혁", phone: "010-2333-1244", fee: 88000,  first: "2026-05", paid: [] },
  { name: "해돌날",                     ceo: "황성윤", phone: "010-8349-4994", fee: 88000,  first: "2026-05", paid: [] },
  { name: "하에컴퍼니",                 ceo: "문유진", phone: "010-2080-7277", fee: 88000,  first: "2026-05", paid: [] },
  { name: "현 종합공사",                ceo: "이현기", phone: "010-8791-0130", fee: 88000,  first: "2026-05", paid: [] },
  { name: "인텍",                       ceo: "박주홍", phone: "010-3900-2251", fee: 88000,  first: "2026-05", paid: [] },
  { name: "안녕 피아노 음악학원",       ceo: "곽수진", phone: "010-9567-9711", fee: 110000, first: "2026-05", paid: [] },
  { name: "덕성건기",                   ceo: "강환진", phone: "010-7977-1388", fee: 110000, first: "2026-05", paid: [] },
  { name: "휴대폰성지 폰통통 광진",     ceo: "왕원택", phone: "010-5564-4125", fee: 77000,  first: "2026-05", paid: [] },

  // ── 2026-06 시작 ──────────────────────────────────────────
  { name: "엠제이테크",           ceo: "문민진", phone: "010-7777-8867", fee: 88000,  first: "2026-06", paid: [] },
  { name: "개인택시(문병도)",     ceo: "문병도", phone: "010-8856-4148", fee: 88000,  first: "2026-06", paid: [] },
  { name: "최론",                 ceo: "최론",   phone: "010-9045-2831", fee: 88000,  first: "2026-06", paid: [] },
  { name: "치킨플러스 제천백운점",ceo: "조여정", phone: "010-8310-9161", fee: 88000,  first: "2026-06", paid: [] },
  { name: "씨유 화성로점",        ceo: "김영환", phone: "010-2492-5156", fee: 88000,  first: "2026-06", paid: [] },
  { name: "부호상사",             ceo: "남혜영", phone: "010-3421-2866", fee: 88000,  first: "2026-06", paid: [] },
  { name: "부호 태양광 발전소",   ceo: "남혜영", phone: "010-3421-2866", fee: 66000,  first: "2026-06", paid: [] },
  { name: "삼원산업개발",         ceo: "이순섭", phone: "010-4305-0471", fee: 88000,  first: "2026-06", paid: [] },
  { name: "주식회사 노벤트",      ceo: "왕원택", phone: "010-5564-4125", fee: 110000, first: "2026-06", paid: [] },
  { name: "신전떡볶이",           ceo: "장원배", phone: "010-9617-5977", fee: 110000, first: "2026-06", paid: [] },
  { name: "브로우미",             ceo: "장온주", phone: "010-7111-1183", fee: 66000,  first: "2026-06", paid: [] },
  { name: "성신지질",             ceo: "곽훈용", phone: "010-8758-0317", fee: 88000,  first: "2026-06", paid: [] },
  { name: "태산9716",             ceo: "박영식", phone: "010-9376-2442", fee: 88000,  first: "2026-06", paid: [] },
  { name: "제이앤엘(J&L)도장",   ceo: "장면",   phone: "010-8880-8090", fee: 88000,  first: "2026-06", paid: [] },
  { name: "씨엔케이이물류",       ceo: "김대경", phone: "010-5815-5719", fee: 88000,  first: "2026-06", paid: [] },
  { name: "인동백역현성더테라스407", ceo: "최료섭", phone: "010-8349-2420", fee: 88000, first: "2026-06", paid: [] },
];

async function main() {
  console.log(`총 ${DATA.length}개 거래처 임포트 시작...`);
  let created = 0;
  let updated = 0;
  let records = 0;

  for (const item of DATA) {
    // 이름으로 기존 고객사 검색
    let client = await prisma.client.findFirst({
      where: { name: item.name, isDeleted: false },
    });

    if (client) {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          ceoName: item.ceo,
          phone: item.phone,
          monthlyFee: item.fee,
          firstWithdrawalMonth: item.first,
        },
      });
      updated++;
    } else {
      client = await prisma.client.create({
        data: {
          name: item.name,
          ceoName: item.ceo,
          phone: item.phone,
          monthlyFee: item.fee,
          firstWithdrawalMonth: item.first,
        },
      });
      created++;
    }

    // 수납 완료 기록 upsert
    for (const yearMonth of item.paid) {
      await prisma.feeRecord.upsert({
        where: { clientId_yearMonth: { clientId: client.id, yearMonth } },
        update: { status: "paid" },
        create: { clientId: client.id, yearMonth, status: "paid" },
      });
      records++;
    }
  }

  console.log(`완료! 신규: ${created}개, 업데이트: ${updated}개, 수납기록: ${records}건`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
