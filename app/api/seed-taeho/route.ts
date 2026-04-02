import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const DATA: Record<string, Record<string, string[]>> = {
  corporate: {
    "김태호": ["도움컴퍼니","위커밋","주식회사 시아게임즈","주식회사 클린미션","주식회사 쿨텍코리아","주식회사 어센드위더스","주식회사 펫니멀","주식회사 에스온","(주)피플일렉트릭","주식회사 노밴트","주식회사 딥포커스랩","주식회사 투식스랩","주식회사 더클래시코","주식회사 위더스메디케어","주식회사 소스트","주식회사 디자인단청"],
    "이휘언": ["바름페이","㈜이노비전","주식회사 와이스퀘어"],
  },
  individual: {
    "김태호": ["에이치제이","무제","세븐당구장","선재치킨","조혜민로지스","피자스쿨(무선점)","포휘엔","도아기업","유비스","가나설비","비비큐","지에스컴퍼니","노랑통닭","한우리건설","소스마케팅","어른김밥","조이스토리","발부BALBOU","발부헤어 전주점","서광보말칼국수","태원기계","본죽&비빔밥 cafe 성수힐스테이트점","씨투지","디자인에이지","베다니전기","중원9568","혁테크","해뜰날","하예컴퍼니","보성운수5580","현 종합공사","인텍","안녕 피아노 음악학원","덕성건기","보스밀리","용인동백역현성더테라스407호","스마트파킹","씨엔케이물류","제이앤엘(J&L)도장","태산9716","성신지질","브로우미","엠제이테크","개인택시(문병도)","훈민정원","치킨플러스 제천백운점","씨유 화성로점","부호상사","부호 태양광 발전소","삼원산업개발","휴대폰성지 폰통령 광진","신진떡볶이","해성안전","헬스로드","8917서정곤","박영일","씨엠스공사","스마트로지텍","오엠(OM)우레탄","국민프린팅","팔달건설기계","단청건축사사무소"],
    "이휘언": ["자동차생활","인성운수","영광운수","씨엔지","깔끄룸플러스","굿셀러스드리머","유맥에프앤알","승탑건설","경북80아8183","정원이엔지","이호특수화물","에스엠 엔지니어링","테리","로드스카이","녹색흑염소","시우상사","모란운수","더하임어드바이저리","개인택시","한결엔지니어링","영천시스템","준준운수","제이5380","현대 텍스타일","태양중기","중앙자동차공업사","유준 디자인 하우스","서경애","명성중기","대신 피엔피","가람중기","인성 비니루","부흥물산","생생그림책연구소/생각에 생각하는 그림책 연구소","바른","한울ENG","우영 ENG","가익 인더스","하성메탈","대양운수","대성유조","케이비엠6575","천일공사","서울중구주교19","동아종합물류","진스크린골프연습장","건진","송월물류","협진종합중기","탑스카이","강인종합관리","케데팜","대영닥트","대영닥트자재","슈퍼맨","서하","진로지스","삼우이엔지","아이티씨영어 광주지점","대평냉동","미르건축사무소","한우랑축산"],
  },
};

export async function GET() {
  const users = await prisma.user.findMany({
    where: { name: { in: ["김태호", "이휘언"] } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map(u => [u.name, u.id]));

  if (!userMap.has("김태호") || !userMap.has("이휘언")) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 400 });
  }

  // 기존 데이터 확인
  const existing = await prisma.distribution.count({
    where: { clientType: { startsWith: "taeho_" } },
  });
  if (existing > 0) {
    return NextResponse.json({ error: `이미 ${existing}건의 데이터가 있습니다. 중복 방지를 위해 중단합니다.` }, { status: 400 });
  }

  let count = 0;
  const batchId = `seed_${Date.now()}`;

  for (const [clientType, byUser] of Object.entries(DATA)) {
    for (const [userName, clients] of Object.entries(byUser)) {
      const userId = userMap.get(userName)!;
      for (const clientName of clients) {
        await prisma.distribution.create({
          data: { clientName, clientType: `taeho_${clientType}`, assignedUserId: userId, batchId },
        });
        count++;
      }
    }
  }

  return NextResponse.json({ success: true, count });
}
