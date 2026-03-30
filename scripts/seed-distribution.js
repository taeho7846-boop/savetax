const { Client } = require("pg");

const data = [
  ["주식회사 도움컴퍼니", "리파이브스킨 주식회사", "에이치제이컴퍼니 주식회사", "주식회사 아르보캠퍼스"],
  ["주식회사 바름페이", "(주)익스팬드엔스", "주식회사 와이앤알", "(주)어코어"],
  ["주식회사 위커밋", "주식회사 이음플래닝", "메이드스코어 주식회사", "주식회사 오아이오캐스팅"],
  ["주식회사 클린미션", "주식회사 지에스아이", "주식회사프로마인드", "주식회사 작스디앤피"],
  ["주식회사 시아게임즈", "주식회사블루밍랩스", "주식회사 작은숲", "주식회사 라피요"],
  ["(주)이노비전", "주식회사 딥웨이브컴퍼니", "주식회사 보암홀딩스", "주식회사 트로바이"],
  ["주식회사 쿨텍코리아", "도영인터내셔널 주식회사", "주식회사 인슐라브레인", "주식회사 에프엠솔루션"],
  ["주식회사 와이스퀘어", "바사콤인터내셔널 주식회사", "-", "주식회사 잡스클라쓰"],
  ["주식회사 어센드위더스", "-", "-", "주식회사 셀레닉스"],
  ["주식회사 펫니멀", "주식회사 에이지티", "주식회사 패션엔모어", "스마트그린테크 주식회사"],
  ["주식회사 에스온", "주식회사 가온토탈매니지먼트", "주식회사 에디파이", "주식회사 오렉스"],
  ["(주)피플일렉트릭", "주식회사 디이에프에이티엔지니어링", "(주)오아시스인베스트먼트", "주식회사 팀에이스"],
  ["주식회사 딥포커스랩", "주식회사 청담", "주식회사 시그널트랙", "디엔에이티컴퍼니 주식회사"],
  ["주식회사 노밴트", "셰르파커뮤니케이션 주식회사", "-", "주식회사 에이엑스랩스"],
  ["주식회사 투식스랩", "주식회사 선샤인스테이션", "-", "주식회사 마빈"],
  ["주식회사 더클래시코", "주식회사 비욘드링크", "-", "주식회사 세븐앤월드"],
  ["주식회사 위더스메디케어", "-", "-", "명진무역 유한회사"],
  ["주식회사 소스트", "주식회사 프랜딩", "주식회사 헤븐파트너스", "주식회사 화이트산업"],
];

const targetNames = ["김태호", "도희수", "최원석", "이종민"];

async function main() {
  const c = new Client({
    connectionString: "postgresql://savetax:savetax1234@localhost:5432/savetax",
  });
  await c.connect();

  // 유저 ID 조회
  const userRes = await c.query(
    'SELECT id, name FROM "User" WHERE name = ANY($1)',
    [targetNames]
  );
  const userMap = {};
  for (const u of userRes.rows) userMap[u.name] = u.id;

  for (const name of targetNames) {
    if (!userMap[name]) {
      console.error("유저 못 찾음:", name);
      await c.end();
      return;
    }
  }
  console.log("유저 매핑:", userMap);

  // 기존 법인 데이터 삭제
  await c.query('DELETE FROM "Distribution" WHERE "clientType" = $1', ["corporate"]);
  console.log("기존 법인 데이터 삭제 완료");

  let count = 0;
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < 4; col++) {
      const name = data[row][col];
      const userId = userMap[targetNames[col]];
      const isSkipped = name === "-";

      await c.query(
        'INSERT INTO "Distribution" ("clientName", "clientType", "assignedUserId", "isSkipped", "createdAt") VALUES ($1, $2, $3, $4, NOW() + ($5 || \' seconds\')::interval)',
        [isSkipped ? "PASS" : name, "corporate", userId, isSkipped, row * 4 + col]
      );
      count++;
    }
  }

  console.log(`법인 ${count}건 입력 완료`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
