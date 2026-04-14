import { SolapiMessageService } from "solapi";

const solapi = new SolapiMessageService(
  process.env.SOLAPI_API_KEY!,
  process.env.SOLAPI_API_SECRET!
);

// 카카오 채널 PFID (솔라피 채널/그룹 페이지에서 확인)
const KAKAO_PF_ID = process.env.SOLAPI_KAKAO_PF_ID!;

// 템플릿 ID (승인 후 여기에 등록)
export const TEMPLATES = {
  HAPPY_CALL: process.env.SOLAPI_TPL_HAPPY_CALL || "",      // 해피콜 안내
  DOC_REMIND: process.env.SOLAPI_TPL_DOC_REMIND || "",       // 자료 독촉
  FEE_REMIND: process.env.SOLAPI_TPL_FEE_REMIND || "",       // 기장료 독촉
};

type SendAlimtalkParams = {
  to: string;                          // 수신자 전화번호
  templateId: string;                  // 템플릿 ID
  variables?: Record<string, string>;  // 치환 변수
};

export async function sendAlimtalk({ to, templateId, variables }: SendAlimtalkParams) {
  if (!templateId) throw new Error("템플릿 ID가 설정되지 않았습니다");
  if (!to) throw new Error("수신자 전화번호가 없습니다");

  const phone = to.replace(/[-\s]/g, "");

  const res = await solapi.sendOne({
    to: phone,
    from: process.env.SOLAPI_SENDER_NUMBER || "",
    kakaoOptions: {
      pfId: KAKAO_PF_ID,
      templateId,
      variables: variables || {},
    },
  });

  return res;
}

// 여러 명에게 한번에 발송
export async function sendAlimtalkBulk(
  messages: { to: string; templateId: string; variables?: Record<string, string> }[]
) {
  if (messages.length === 0) return { success: 0, fail: 0 };

  const formatted = messages.map((m) => ({
    to: m.to.replace(/[-\s]/g, ""),
    from: process.env.SOLAPI_SENDER_NUMBER || "",
    kakaoOptions: {
      pfId: KAKAO_PF_ID,
      templateId: m.templateId,
      variables: m.variables || {},
    },
  }));

  const res = await solapi.send(formatted);
  return res;
}
