import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import path from "path";

const dbPath = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const clients = [
  { name: "(주) 딥포커스랩", bizNumber: "232-86-04005", clientType: "corporate", ceoName: "위성석", residentNumber: "820530-1664024", phone: "010-4056-8213", hometaxId: "deepfocuslab", hometaxPw: "Widfl1225%" },
  { name: "브로우미", bizNumber: "592-39-00964", clientType: "individual", ceoName: "장은주", residentNumber: "880213-2070211", phone: "011-1111-1183", hometaxId: "jjhaha213", hometaxPw: "yulyul0403^^" },
  { name: "성신지질", bizNumber: "536-70-00351", clientType: "individual", ceoName: "곽호용", residentNumber: "820210-1475816", phone: "010-8758-0317", hometaxId: "zzxx7747", hometaxPw: "khy200803!" },
  { name: "태산9716", bizNumber: "490-19-01941", clientType: "individual", ceoName: "박영식", residentNumber: "720105-1771812", phone: "010-9376-2442", hometaxId: "young011144", hometaxPw: "#dudtlr5343" },
  { name: "제이앤앨(J&L)도장", bizNumber: "774-07-02471", clientType: "individual", ceoName: "장면", residentNumber: "760809-1635211", phone: "010-8880-8090", hometaxId: "viniru1", hometaxPw: "gkskfh12!!" },
  { name: "씨엔케이이플류", bizNumber: "627-76-00270", clientType: "individual", ceoName: "김대경", residentNumber: "850522-1829811", phone: "010-5815-5719", hometaxId: "acekiss123", hometaxPw: "009988op^^" },
  { name: "인동백역현성더테라스407", bizNumber: "576-11-02011", clientType: "individual", ceoName: "최호섭", residentNumber: "921015-1011220", phone: "010-8349-2420", hometaxId: "cheriyu11", hometaxPw: "gytjq2420!" },
  { name: "강타일", bizNumber: "555-64-00647", clientType: "individual", ceoName: "강준구", residentNumber: "780620-1812911", phone: "010-2605-3304", hometaxId: "tjsqjem", hometaxPw: "asdu04455!!" },
  { name: "(주)에스온", bizNumber: null, clientType: "corporate", ceoName: "윤희원", residentNumber: null, phone: "010-3719-2688", hometaxId: null, hometaxPw: null },
  { name: "쉬터담갈비", bizNumber: "894-01-03374", clientType: "individual", ceoName: "남궁본", residentNumber: "821103-1243116", phone: "010-3373-3625", hometaxId: "perbon", hometaxPw: "gpmhc4296*" },
  { name: "(주) 위키밋", bizNumber: "778-86-02712", clientType: "corporate", ceoName: "강수진", residentNumber: "970113-2213512", phone: "010-8561-4727", hometaxId: "ksp221013", hometaxPw: "ksp20221013!" },
  { name: "피자스쿨우선점", bizNumber: "350-53-00750", clientType: "individual", ceoName: "김하나", residentNumber: "990615-2575115", phone: "010-7615-8570", hometaxId: "gksk5599", hometaxPw: "re413857!!" },
  { name: "(주) 도움컴퍼니", bizNumber: "310-81-35953", clientType: "corporate", ceoName: "정미애", residentNumber: "830701-2156839", phone: "010-8332-7056", hometaxId: "doumco", hometaxPw: "kdwlove486!" },
  { name: "에이치제이", bizNumber: "608-43-21655", clientType: "individual", ceoName: "홍형중", residentNumber: "670212-1647913", phone: "010-5324-1237", hometaxId: "hj670212", hometaxPw: "hj670212@#" },
  { name: "무제", bizNumber: "198-33-01100", clientType: "individual", ceoName: "서정현", residentNumber: "910130-1902121", phone: "010-5121-8460", hometaxId: "sjh2683", hometaxPw: "!noname1234" },
  { name: "세본당구장", bizNumber: "606-40-97629", clientType: "individual", ceoName: "임근택", residentNumber: "710802-1011025", phone: "010-8738-1688", hometaxId: "lkt4643", hometaxPw: "Lkt4643!@" },
  { name: "선재치킨", bizNumber: "178-65-00544", clientType: "individual", ceoName: "이선욱", residentNumber: "690801-2063537", phone: "010-5354-1191", hometaxId: "fox1191", hometaxPw: "z8100840@@" },
  { name: "조헤민로지스", bizNumber: "542-23-00575", clientType: "individual", ceoName: "조헤민", residentNumber: "851210-1096116", phone: "010-9729-5670", hometaxId: "joheymin2003", hometaxPw: "p0987654321@" },
  { name: "포휘엔", bizNumber: "551-42-01002", clientType: "individual", ceoName: "한성흠", residentNumber: "730405-1411213", phone: "010-4796-4536", hometaxId: "noddang73", hometaxPw: "no911901@@" },
  { name: "이오북순대국 대치은마점", bizNumber: "745-11-02752", clientType: "individual", ceoName: "허준호", residentNumber: "940718-1020811", phone: "010-3928-2289", hometaxId: "gjwnsgh111", hometaxPw: "wns02140214!" },
  { name: "레몬노래연습장", bizNumber: "217-20-68829", clientType: "individual", ceoName: "안은영", residentNumber: "770926-2267515", phone: "010-5474-8100", hometaxId: "binimami", hometaxPw: "eunyyoung10!" },
  { name: "스테이 핏", bizNumber: "392-10-02022", clientType: "individual", ceoName: "김수현", residentNumber: "920401-2045020", phone: "010-7573-7703", hometaxId: "ssu0401", hometaxPw: "@Dksktngus1!" },
  { name: "사랑나무동물병원", bizNumber: "830-01-03628", clientType: "individual", ceoName: "정여진", residentNumber: "811215-2682816", phone: "010-8626-4416", hometaxId: "lovetree2025", hometaxPw: "7749007rlswl@#" },
  { name: "피에스디자인 강남점", bizNumber: "382-19-02334", clientType: "individual", ceoName: "김민서", residentNumber: "860709-2070511", phone: "010-2458-0499", hometaxId: "kar8607", hometaxPw: "aaaa9904!" },
  { name: "켈리패밀리", bizNumber: "576-22-01740", clientType: "individual", ceoName: "이한재", residentNumber: "920712-1083014", phone: "010-5240-9035", hometaxId: "lhanj92", hometaxPw: "leegkswo92!!" },
  { name: "리안인테리어", bizNumber: "308-08-58775", clientType: "individual", ceoName: "손기윤", residentNumber: "920310-2054512", phone: "010-4107-5423", hometaxId: "joowon63", hometaxPw: "zz4245423**" },
  { name: "지안", bizNumber: "356-21-01718", clientType: "individual", ceoName: "이온경", residentNumber: "810612-2182918", phone: "010-3787-0137", hometaxId: "navidads", hometaxPw: "eklove81**" },
  { name: "탑스터디카페 영등포시장점", bizNumber: "848-41-00841", clientType: "individual", ceoName: "김시명", residentNumber: "930207-1214118", phone: "010-9269-1790", hometaxId: "tlaud1790", hometaxPw: "aa1214118!" },
  { name: "위투게더 발달센터", bizNumber: "549-34-01095", clientType: "individual", ceoName: "장멈", residentNumber: "930119-1076525", phone: "010-3346-2753", hometaxId: "youp1993", hometaxPw: "wkdduq132!" },
  { name: "도야기업", bizNumber: "489-14-01645", clientType: "individual", ceoName: "김종철", residentNumber: "850214-1849611", phone: "010-9197-9762", hometaxId: "k6339762kkk", hometaxPw: "qwer900222@" },
  { name: "유비스", bizNumber: "461-18-01096", clientType: "individual", ceoName: "최현호", residentNumber: "881121-1540511", phone: "010-3019-1659", hometaxId: "choihyunho88", hometaxPw: "@chlgusgh88" },
  { name: "가나살비", bizNumber: "879-51-00825", clientType: "individual", ceoName: "윤홍범", residentNumber: "821225-1056114", phone: "010-9246-1384", hometaxId: "yhb1023", hometaxPw: "ghaxprtm1023@" },
  { name: "모노유", bizNumber: "721-97-01673", clientType: "individual", ceoName: "오은달", residentNumber: "911002-2155613", phone: "010-8280-9546", hometaxId: "dongjungsa", hometaxPw: "Ojw911002!" },
  { name: "비비큐", bizNumber: "382-21-01250", clientType: "individual", ceoName: "문종현", residentNumber: "711110-1057422", phone: "010-2112-1122", hometaxId: "freestyle71", hometaxPw: "answrhd18!!" },
  { name: "지에스컴퍼니", bizNumber: "889-08-00845", clientType: "individual", ceoName: "이균희", residentNumber: "750112-1923111", phone: "010-8774-5399", hometaxId: "gh4246", hometaxPw: "35153515gh!@" },
  { name: "주식회사 시야게임즈", bizNumber: "679-86-03336", clientType: "corporate", ceoName: "박준규", residentNumber: "890929-1455218", phone: "010-6646-8703", hometaxId: "xiagames", hometaxPw: "!rmfjspdy0216" },
  { name: "노랑통닭", bizNumber: "319-22-01716", clientType: "individual", ceoName: "이정우", residentNumber: "930507-1384113", phone: "010-2292-8039", hometaxId: "wjddn7730", hometaxPw: "wjddn123!@" },
  { name: "한우리건설", bizNumber: "309-05-26066", clientType: "individual", ceoName: "김철영", residentNumber: "671001-1031421", phone: "010-7651-3224", hometaxId: "young1421", hometaxPw: "dud689766@" },
  { name: "조이스토리", bizNumber: "133-45-00728", clientType: "individual", ceoName: "김윤준", residentNumber: "891021-1019611", phone: "010-3245-3556", hometaxId: "dbswnsdla", hometaxPw: "kyj@@167979" },
  { name: "소스마케팅", bizNumber: "221-15-61928", clientType: "individual", ceoName: "박수형", residentNumber: "880802-1901129", phone: "010-5607-4839", hometaxId: "hansamll1988", hometaxPw: "qkrtngud1988!" },
  { name: "어른김밥", bizNumber: "553-47-00800", clientType: "individual", ceoName: "이호석", residentNumber: "910512-1069424", phone: "010-5683-5691", hometaxId: "hallow14", hometaxPw: "Rhclwk512@@" },
  { name: "주식회사 쿨테크코리아", bizNumber: "263-81-03650", clientType: "corporate", ceoName: "김은주", residentNumber: "630608-2068828", phone: "010-8571-1288", hometaxId: "cooltech107", hometaxPw: "Kk7084608!" },
  { name: "발부BALBOU", bizNumber: "327-21-01122", clientType: "individual", ceoName: "이기창", residentNumber: "840301-1560123", phone: "010-7102-0301", hometaxId: "changmake", hometaxPw: "@namsee84" },
  { name: "발부헤어 전주점", bizNumber: "535-02-03185", clientType: "individual", ceoName: "손민중", residentNumber: "870718-1481412", phone: "010-7493-2123", hometaxId: "alswndsal", hometaxPw: "qkfqn123@" },
  { name: "주식회사 클린미션", bizNumber: "799-86-03789", clientType: "individual", ceoName: "윤종윤", residentNumber: "970715-1222810", phone: "010-7189-8619", hometaxId: "cleanmission", hometaxPw: "cleantax11!!" },
  { name: "서광보말갈국수", bizNumber: "558-06-01102", clientType: "individual", ceoName: "유선희", residentNumber: "700723-2256426", phone: "010-9166-7928", hometaxId: "yoush01", hometaxPw: "950919al!" },
  { name: "태원기계", bizNumber: "432-15-01272", clientType: "individual", ceoName: "김풍태", residentNumber: "691127-1109914", phone: "010-3879-0443", hometaxId: "msimpsb9", hometaxPw: "kjt253240@" },
  { name: "츠비빔밥 cafe 성수힐스테이", bizNumber: "216-03-72003", clientType: "individual", ceoName: "이온화", residentNumber: "691122-2064012", phone: "010-5763-2004", hometaxId: "dorossi699", hometaxPw: "~qksekr147" },
  { name: "씨투지(C2G)", bizNumber: "142-06-89427", clientType: "individual", ceoName: "주민규", residentNumber: "880519-1163415", phone: "010-8953-3077", hometaxId: "speedboy188", hometaxPw: "wnalsrb1!" },
  { name: "디자인에이지", bizNumber: "109-12-88970", clientType: "individual", ceoName: "서경일", residentNumber: "790110-1575217", phone: "010-2625-1303", hometaxId: null, hometaxPw: null },
  { name: "베다니전기", bizNumber: "608-40-07273", clientType: "individual", ceoName: "윤순남", residentNumber: "640324-2551914", phone: "010-7723-6130", hometaxId: "yunsn7723", hometaxPw: "happy#7723" },
  { name: "중원9568", bizNumber: "499-25-01347", clientType: "individual", ceoName: "박두현", residentNumber: "640531-1682717", phone: "010-9449-6693", hometaxId: null, hometaxPw: null },
  { name: "혁테크", bizNumber: "484-25-02233", clientType: "individual", ceoName: "박상혁", residentNumber: "890418-1163525", phone: "010-2333-1244", hometaxId: "jokvab", hometaxPw: "!Qqq14041248" },
  { name: "(주) 어센드워더스", bizNumber: "264-86-03755", clientType: "corporate", ceoName: "이중성", residentNumber: "720131-1925119", phone: "010-8999-2110", hometaxId: "ASCEND1", hometaxPw: "@jslee2633219" },
  { name: "해뜰날", bizNumber: "163-48-00114", clientType: "individual", ceoName: "황성일", residentNumber: "690323-1167417", phone: "010-8349-4994", hometaxId: null, hometaxPw: null },
  { name: "하예컴퍼니", bizNumber: "820-74-00410", clientType: "individual", ceoName: "문유진", residentNumber: "900222-2081725", phone: "010-2080-7277", hometaxId: "moonvly", hometaxPw: "Abab0902@" },
  { name: "현 종합공사", bizNumber: "243-56-00787", clientType: "individual", ceoName: "이현기", residentNumber: "590209-1018320", phone: "010-8791-0130", hometaxId: "goldbar028", hometaxPw: "go64**072" },
  { name: "인텍", bizNumber: "534-73-00318", clientType: "individual", ceoName: "박주홍", residentNumber: "710530-1120514", phone: "010-3900-2251", hometaxId: "JUHONGP0", hometaxPw: "jks2122410!@!" },
  { name: "안녕 피아노 음악학원", bizNumber: "560-97-00327", clientType: "individual", ceoName: "곽수진", residentNumber: "920813-2388616", phone: "010-9567-9711", hometaxId: "tnwls684", hometaxPw: "rhkr2585!!" },
  { name: "(주) 펫니얼", bizNumber: "704-87-03401", clientType: "corporate", ceoName: "박종문", residentNumber: "770209-1770310", phone: "010-7357-0708", hometaxId: "pet187", hometaxPw: "fusion!@#$1101" },
  { name: "덕성건기", bizNumber: "814-47-00520", clientType: "individual", ceoName: "강학진", residentNumber: "710505-1449516", phone: "010-7977-1388", hometaxId: "khj00520", hometaxPw: "ice0560!!" },
  { name: "보스밀리", bizNumber: "482-28-01689", clientType: "individual", ceoName: "박종문", residentNumber: "770209-1770310", phone: "010-7357-0708", hometaxId: "pjm187", hometaxPw: "fusion!@#$1101" },
  { name: "엠제이테크", bizNumber: "573-57-00725", clientType: "individual", ceoName: "문민진", residentNumber: "891031-1070011", phone: "010-7777-8867", hometaxId: null, hometaxPw: null },
  { name: "개인택시(변병도)", bizNumber: "184-27-01833", clientType: "individual", ceoName: "문병도", residentNumber: null, phone: "010-8856-4148", hometaxId: null, hometaxPw: null },
  { name: "훈민정원", bizNumber: "296-18-02278", clientType: "individual", ceoName: "최훈", residentNumber: "860123-1152011", phone: "010-9045-2831", hometaxId: "choehum689", hometaxPw: "$@129372Kd" },
  { name: "치킨플러스 제천백운점", bizNumber: "655-41-00730", clientType: "individual", ceoName: "조여정", residentNumber: null, phone: "010-8310-9161", hometaxId: null, hometaxPw: null },
  { name: "씨유 화성로점", bizNumber: "124-44-06852", clientType: "individual", ceoName: "김영화", residentNumber: null, phone: "010-2492-5156", hometaxId: null, hometaxPw: null },
  { name: "부호상사", bizNumber: "503-09-46492", clientType: "individual", ceoName: "남혜영", residentNumber: "740223-2123729", phone: "010-3421-2866", hometaxId: "juogchan565", hometaxPw: "740223sun@" },
  { name: "부호 태양광 발전소", bizNumber: "162-18-02451", clientType: "individual", ceoName: "남혜영", residentNumber: "740223-2123729", phone: "010-3421-2866", hometaxId: "juogchan565", hometaxPw: "740223sun@" },
  { name: "삼원산업개발", bizNumber: "595-38-00670", clientType: "individual", ceoName: "이순섭", residentNumber: "550117-1080017", phone: "010-4305-0471", hometaxId: "rkvud54", hometaxPw: "@@#qwer553355" },
  { name: "휴대폰성지 폰통령 광진", bizNumber: null, clientType: "individual", ceoName: "왕왕택", residentNumber: null, phone: "010-5564-4125", hometaxId: null, hometaxPw: null },
  { name: "주식회사 노벳", bizNumber: null, clientType: "corporate", ceoName: "왕왕택", residentNumber: null, phone: "010-5564-4125", hometaxId: null, hometaxPw: null },
  { name: "(주)피폴일렉트릭", bizNumber: "491-87-03505", clientType: "corporate", ceoName: "김성민", residentNumber: "721118-1069159", phone: "010-8614-0461", hometaxId: "pepel6176", hometaxPw: "pepel6176@" },
  { name: "신천떡복이", bizNumber: "304-27-02528", clientType: "individual", ceoName: "장원배", residentNumber: "871013-1768615", phone: "010-9617-5977", hometaxId: null, hometaxPw: null },
  { name: "해성안전", bizNumber: null, clientType: "individual", ceoName: "권해림", residentNumber: null, phone: "010-4939-7095", hometaxId: null, hometaxPw: null },
  { name: "헬스로드", bizNumber: "858-39-01053", clientType: "individual", ceoName: "고은경", residentNumber: "780611-2233226", phone: "010-9180-3193", hometaxId: "gigas0611", hometaxPw: "20140618ssb^^" },
  { name: "8917서정곤", bizNumber: "780-21-00741", clientType: "individual", ceoName: "서정곤", residentNumber: null, phone: "010-9115-9594", hometaxId: null, hometaxPw: null },
  { name: "보성운수", bizNumber: "712-02-02575", clientType: "individual", ceoName: "임진연", residentNumber: "701028-1042616", phone: "010-8892-8230", hometaxId: null, hometaxPw: null },
];

async function main() {
  console.log(`총 ${clients.length}개 고객사 등록 시작...`);

  let count = 0;
  for (const client of clients) {
    const existing = await prisma.client.findFirst({
      where: { name: client.name, isDeleted: false },
    });

    if (existing) {
      console.log(`  ⏭ 이미 존재: ${client.name}`);
      continue;
    }

    await prisma.client.create({
      data: {
        name: client.name,
        bizNumber: client.bizNumber,
        clientType: client.clientType,
        ceoName: client.ceoName,
        residentNumber: client.residentNumber,
        phone: client.phone,
        hometaxId: client.hometaxId,
        hometaxPw: client.hometaxPw,
        contractStatus: "active",
      },
    });
    console.log(`  ✅ 등록: ${client.name}`);
    count++;
  }

  console.log(`\n완료! ${count}개 신규 등록됨.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
