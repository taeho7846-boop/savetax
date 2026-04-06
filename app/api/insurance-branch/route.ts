import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { execSync } from "child_process";

// 시도 코드 매핑
const CTPV_CODES: Record<string, string> = {
  서울: "11", 부산: "26", 대구: "27", 인천: "28", 광주: "29",
  대전: "30", 울산: "31", 세종: "36", 경기: "41", 강원: "42",
  충북: "43", 충남: "44", 전북: "45", 전남: "46", 경북: "47",
  경남: "48", 제주: "50",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { address } = await req.json();
  if (!address) return NextResponse.json({ error: "주소가 필요합니다" }, { status: 400 });

  // 주소에서 시도, 시군구 추출
  let ctpvCd = "";
  let sggNm = "";

  for (const [name, code] of Object.entries(CTPV_CODES)) {
    if (address.includes(name)) {
      ctpvCd = code;
      break;
    }
  }

  // 시군구 추출 (시/군/구 앞 단어)
  const sggMatch = address.match(/(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|도|특별자치도)?\s*(\S+?(?:시|군|구))/);
  if (sggMatch) {
    sggNm = sggMatch[1];
  }

  if (!ctpvCd) {
    return NextResponse.json({ error: "시도를 인식할 수 없습니다", address });
  }

  try {
    const result = execSync(
      `curl -s --connect-timeout 10 --max-time 15 -X POST -d "ctpvCd=${ctpvCd}&sggNm=${encodeURIComponent(sggNm)}" "https://www.4insure.or.kr/pbiz/ntcn/selectInstBrofSrchView.do"`,
      { encoding: "utf-8" }
    );

    // HTML에서 결과 테이블 파싱
    const branches: { institution: string; branch: string; addressInfo: string; phone: string }[] = [];

    // <td> 태그에서 데이터 추출
    const rowRegex = /<tr[^>]*>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>(.*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/g;
    let match;
    while ((match = rowRegex.exec(result)) !== null) {
      const inst = match[1].replace(/<[^>]*>/g, "").trim();
      const branch = match[2].replace(/<[^>]*>/g, "").trim();
      const addrBlock = match[3].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

      if (inst && branch && !inst.includes("기관") && !inst.includes("조회된")) {
        // 주소와 전화번호 분리
        const phoneMatch = addrBlock.match(/(0\d{1,2}[-)]?\d{3,4}[-]?\d{4})/);
        branches.push({
          institution: inst,
          branch,
          addressInfo: addrBlock.replace(/(0\d{1,2}[-)]?\d{3,4}[-]?\d{4})/, "").trim(),
          phone: phoneMatch?.[1] || "",
        });
      }
    }

    return NextResponse.json({ ctpvCd, sggNm, branches });
  } catch (err) {
    console.error("[4대보험 지사찾기] 오류:", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}
