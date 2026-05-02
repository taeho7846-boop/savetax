import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { listFiles } from "@/lib/google-drive";

const SYSTEM_PROMPT = [
  "당신은 한국 국세청의 종합소득세 신고안내문 PDF에서 데이터를 추출하는 도우미입니다.",
  "",
  "【중요 — 단위 규칙】",
  "- 1~2페이지 (사업장별 수입금액, 공제 참고자료, 가산세 항목): 표시값이 곧 원 단위입니다. 그대로 사용.",
  "- 3페이지 (최근 3년간 종합소득세 신고상황): 표 헤더 (단위:천원) → 1000을 곱해 원 단위로.",
  "- 4페이지 (최근 3년간 신고소득률, 매출액 대비 판관비율): (단위:천원) → 1000을 곱해 원 단위로.",
  "- 5페이지 (사업용 신용카드 사용현황): 원 단위 그대로.",
  "",
  "【filingType 규칙】",
  '- "기준경비율" 또는 "단순경비율" 두 값 중 하나만 가능. "안내유형" 줄에서 추출.',
  '- "추계신고"는 가산세 사유일 뿐 filingType이 아님.',
  "",
  "값이 없으면 null. 추측 금지.",
].join("\n");

const TOOL = {
  name: "submit_notice_data",
  description: "종합소득세 신고안내문에서 추출한 구조화 데이터 제출",
  input_schema: {
    type: "object" as const,
    properties: {
      ceoName: { type: ["string", "null"] },
      birthDate: { type: ["string", "null"], description: "YY.MM.DD" },
      noticeType: { type: ["string", "null"], description: "안내유형 줄 원문 (예: '간편장부대상자-기준경비율')" },
      bookkeepingDuty: {
        type: ["string", "null"],
        enum: ["간편장부", "복식부기", "성실신고", null],
        description: "기장의무. PDF의 '기장의무' 칸에서: '간편장부대상자'→'간편장부', '복식부기의무자'→'복식부기', '성실신고확인대상자'→'성실신고'",
      },
      filingType: {
        type: ["string", "null"],
        enum: ["기준경비율", "단순경비율", null],
        description: "추계 시 적용경비율 (PDF '추계시 적용경비율' 칸)",
      },
      businessForm: {
        type: ["string", "null"],
        enum: ["단독", "공동", null],
        description: "사업형태 (PDF '사업장별 수입금액' 표의 '사업형태' 컬럼). 사업장 여러 개면 첫 번째 또는 가장 빈도 높은 값",
      },
      businessNumber: { type: ["string", "null"], description: "대표 사업자등록번호 (1페이지 상단). 하이픈 포함 형식 예: '123-45-67890'" },
      bizCode: { type: ["string", "null"], description: "대표 업종코드 6자리 숫자 (1페이지 '사업장별 수입금액' 표 첫 행 또는 매출 가장 큰 행의 '업종코드' 컬럼). 숫자만, 하이픈/공백 제외" },
      businessSites: {
        type: "array",
        description: "사업장별 (사업자등록번호, 업종코드) 페어. PDF 1페이지 '사업장별 수입금액' 표의 모든 행 추출. 각 행의 사업자등록번호와 같은 행의 업종코드를 짝지어 추출",
        items: {
          type: "object",
          properties: {
            businessNumber: { type: "string", description: "사업자등록번호 (하이픈 포함 또는 숫자만)" },
            bizCode: { type: "string", description: "업종코드 6자리 숫자" },
            sales: { type: ["number", "null"], description: "해당 사업장 수입금액 (원)" },
          },
          required: ["businessNumber", "bizCode"],
        },
      },
      currYearBusinessSales: { type: ["number", "null"], description: "부가가치세 업종별 수입금액 (사업장 매출, 원)" },
      currYearTaxCreditSales: { type: ["number", "null"], description: "전자신고세액공제 등 (원)" },
      currYearCardCreditSales: { type: ["number", "null"], description: "신용카드매출전표 등 발행세액공제 (원)" },
      currYearOtherBusinessSales: { type: ["number", "null"], description: "기타 사업장 관련 수입금액(위 3개 외)" },
      currYearTotalSales: { type: ["number", "null"], description: "사업장별 수입금액 총계 (원)" },
      currYearFreelanceSales: { type: ["number", "null"], description: "사업소득 지급명세서 등 결정자료(인적용역) (원)" },
      currYearWithholdingTax: { type: ["number", "null"] },
      currYearPrepaidTax: { type: ["number", "null"] },
      otherIncomeFlags: {
        type: "object",
        description: "타소득(합산대상) 자료유무. 각 항목은 'O' 또는 'X'",
        properties: {
          interest: { type: "string", enum: ["O", "X"] },
          dividend: { type: "string", enum: ["O", "X"] },
          salarySingle: { type: "string", enum: ["O", "X"], description: "근로 단일" },
          salaryMulti: { type: "string", enum: ["O", "X"], description: "근로 복수" },
          pension: { type: "string", enum: ["O", "X"] },
          etc: { type: "string", enum: ["O", "X"] },
          religion: { type: "string", enum: ["O", "X"] },
        },
      },
      incomeHistory: {
        type: "array",
        description: "최근 3년 신고상황 (3페이지). 천원→원 변환.",
        items: {
          type: "object",
          properties: {
            year: { type: "number" },
            totalIncome: { type: ["number", "null"] },
            taxBase: { type: ["number", "null"] },
            calculatedTax: { type: ["number", "null"] },
            decidedTax: { type: ["number", "null"] },
            effectiveRate: { type: ["number", "null"] },
          },
          required: ["year"],
        },
      },
      salesHistory: {
        type: "array",
        description: "최근 3년 신고소득률 (4페이지). 천원→원 변환.",
        items: {
          type: "object",
          properties: {
            year: { type: "number" },
            sales: { type: ["number", "null"] },
            expenses: { type: ["number", "null"] },
            income: { type: ["number", "null"] },
            rate: { type: ["number", "null"] },
          },
          required: ["year"],
        },
      },
      sincerityNoticeTarget: { type: ["boolean", "null"] },
      additionalTaxItems: { type: "array", items: { type: "string" } },
      deductionItems: {
        type: "array",
        description: "공제 참고자료 (PDF 1페이지 '공제 참고자료' 표). 모든 행 추출 — 0원이어도 포함",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["기납부세액", "소득공제", "세액공제"],
              description: "구분 컬럼: 기납부세액 / 소득공제 항목 / 세액공제 항목",
            },
            name: { type: "string", description: "항목명 (예: '중간예납세액', '원천징수세액(인적용역 사업소득)', '국민연금보험료')" },
            amount: { type: "number", description: "납입액(부담액) - 원 단위" },
            note: { type: ["string", "null"], description: "공제 가능액 안내 문구 (옵션, 길면 짧게 요약)" },
          },
          required: ["category", "name", "amount"],
        },
      },
      additionalTaxes: {
        type: "array",
        description: "가산세 항목 (PDF 2페이지). '※ 가산세 항목' 표에서 해당사유/금액이 있는 행만 추출. 사유나 금액이 없는(빈/0원) 항목은 제외",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "가산세 항목명 (예: '현금영수증미발급', '무신고 또는 무기장가산세')" },
            reason: { type: ["string", "null"], description: "적용사유 또는 대상 (예: '추계신고시', '미(지연) 제출금액 0 원')" },
            amount: { type: ["number", "null"], description: "관련 금액 (원). 텍스트 내 숫자 추출. 없으면 null" },
          },
          required: ["name"],
        },
      },
    },
    required: ["ceoName", "businessNumber"],
  },
};

async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const { GoogleAuth } = await import("google-auth-library");
  const fs = await import("fs");
  const path = await import("path");
  let credentials: any = {};
  try {
    const keyPath = path.join(process.cwd(), "google-credentials.json");
    if (fs.existsSync(keyPath)) credentials = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    else credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
  } catch {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
  }
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
  const client = await auth.getClient();
  const tokenObj = await client.getAccessToken();
  const token = tokenObj.token || "";
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { clientId, taxYear, force } = (await req.json()) as { clientId: number; taxYear: string; force?: boolean };
  if (!clientId || !taxYear) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  // 캐시 (force=false일 때 기존 결과 반환)
  if (!force) {
    const cached = await prisma.clientNoticeAnalysis.findUnique({
      where: { clientId_taxYear: { clientId, taxYear } },
    });
    if (cached) {
      const c = await prisma.client.findUnique({ where: { id: clientId }, select: { bizNumber: true } });
      const reductionInfo = await getReductionInfo(cached, c?.bizNumber);
      return NextResponse.json({ cached: true, data: serializeAnalysis(cached), reductionInfo });
    }
  }

  // 거래처 + 드라이브 폴더
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, driveFolderId: true, bizNumber: true },
  });
  if (!client?.driveFolderId) return NextResponse.json({ error: "NO_DRIVE_FOLDER" }, { status: 400 });

  // 드라이브에서 신고안내문 PDF 찾기
  const files = await listFiles(client.driveFolderId);
  const target = files.find(
    (f) => f.name.includes("종합소득세신고안내문") && f.name.startsWith(taxYear)
  );
  if (!target) return NextResponse.json({ error: "PDF_NOT_FOUND" }, { status: 404 });

  // PDF 다운로드
  const buffer = await downloadDriveFile(target.id);
  const base64 = buffer.toString("base64");

  // Haiku 호출
  const anthropic = new Anthropic();
  const apiRes = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [TOOL as any],
    tool_choice: { type: "tool", name: "submit_notice_data" } as any,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "PDF에서 데이터를 추출해 submit_notice_data 도구를 호출하세요." },
        ],
      },
    ],
  });

  const toolUse = apiRes.content.find((b: any) => b.type === "tool_use") as any;
  if (!toolUse) return NextResponse.json({ error: "EXTRACTION_FAILED" }, { status: 500 });

  const data = toolUse.input;
  const flags = data.otherIncomeFlags || {};
  const hasOtherIncome = Object.values(flags).some((v) => v === "O");

  // upsert
  const saved = await prisma.clientNoticeAnalysis.upsert({
    where: { clientId_taxYear: { clientId, taxYear } },
    create: {
      clientId,
      taxYear,
      analyzedById: session.id,
      pdfFileId: target.id,
      filingType: data.filingType ?? null,
      totalSales: data.currYearTotalSales ? BigInt(Math.round(data.currYearTotalSales)) : null,
      businessSales: data.currYearBusinessSales ? BigInt(Math.round(data.currYearBusinessSales)) : null,
      freelanceSales: data.currYearFreelanceSales ? BigInt(Math.round(data.currYearFreelanceSales)) : null,
      hasOtherIncome,
      otherIncomeFlags: JSON.stringify(flags),
      incomeHistory: JSON.stringify(data.incomeHistory ?? []),
      rawJson: JSON.stringify(data),
    },
    update: {
      analyzedAt: new Date(),
      analyzedById: session.id,
      pdfFileId: target.id,
      filingType: data.filingType ?? null,
      totalSales: data.currYearTotalSales ? BigInt(Math.round(data.currYearTotalSales)) : null,
      businessSales: data.currYearBusinessSales ? BigInt(Math.round(data.currYearBusinessSales)) : null,
      freelanceSales: data.currYearFreelanceSales ? BigInt(Math.round(data.currYearFreelanceSales)) : null,
      hasOtherIncome,
      otherIncomeFlags: JSON.stringify(flags),
      incomeHistory: JSON.stringify(data.incomeHistory ?? []),
      rawJson: JSON.stringify(data),
      reviewedByStaffAt: null,
      reviewedByAccountantAt: null,
    },
  });

  const reductionInfo = await getReductionInfo(saved, client.bizNumber);
  return NextResponse.json({ cached: false, data: serializeAnalysis(saved), reductionInfo });
}

function normalizeBizNumber(s: string | null | undefined): string {
  return (s || "").replace(/[^0-9]/g, "");
}

function normalizeBizCode(s: string | null | undefined): string {
  return (s || "").replace(/[^0-9]/g, "");
}

async function getReductionInfo(analysis: any, clientBizNumber?: string | null) {
  let raw: any;
  try {
    raw = analysis?.rawJson ? JSON.parse(analysis.rawJson) : null;
  } catch {
    raw = null;
  }

  // 1) 거래처 사업자등록번호와 매칭되는 행의 업종코드 우선
  let bizCode: string | null = null;
  let matchSource: "client_match" | "first_site" | "fallback_top" | null = null;

  const sites: Array<{ businessNumber?: string; bizCode?: string }> = Array.isArray(raw?.businessSites) ? raw.businessSites : [];
  const clientNum = normalizeBizNumber(clientBizNumber);

  if (clientNum && sites.length > 0) {
    const matched = sites.find((s) => normalizeBizNumber(s.businessNumber) === clientNum);
    if (matched?.bizCode) {
      bizCode = normalizeBizCode(matched.bizCode);
      matchSource = "client_match";
    }
  }

  // 2) 매칭 실패 시 첫 사업장 또는 최상위 bizCode
  if (!bizCode && sites.length > 0 && sites[0]?.bizCode) {
    bizCode = normalizeBizCode(sites[0].bizCode);
    matchSource = "first_site";
  }
  if (!bizCode && raw?.bizCode) {
    bizCode = normalizeBizCode(raw.bizCode);
    matchSource = "fallback_top";
  }

  if (!bizCode) return null;

  // 3) 정확 6자리 매칭 → 실패 시 5자리 prefix fallback
  let code = await prisma.taxReductionCode.findUnique({ where: { bizCode } });
  let matchedBizCode = bizCode;
  let partialMatch = false;
  if (!code && bizCode.length >= 5) {
    const partial = await prisma.taxReductionCode.findFirst({
      where: { bizCode: { startsWith: bizCode.slice(0, 5) } },
    });
    if (partial) {
      code = partial;
      matchedBizCode = partial.bizCode;
      partialMatch = true;
    }
  }

  return {
    bizCode,
    matchedBizCode,
    partialMatch,
    matchSource,
    startupReduction: code?.startupReduction ?? null,
    smeReduction: code?.smeReduction ?? null,
    found: !!code,
  };
}

function serializeAnalysis(a: any) {
  return {
    id: a.id,
    clientId: a.clientId,
    taxYear: a.taxYear,
    analyzedAt: a.analyzedAt instanceof Date ? a.analyzedAt.toISOString() : a.analyzedAt,
    pdfFileId: a.pdfFileId,
    filingType: a.filingType,
    totalSales: a.totalSales ? Number(a.totalSales) : null,
    businessSales: a.businessSales ? Number(a.businessSales) : null,
    freelanceSales: a.freelanceSales ? Number(a.freelanceSales) : null,
    hasOtherIncome: a.hasOtherIncome,
    otherIncomeFlags: a.otherIncomeFlags ? JSON.parse(a.otherIncomeFlags) : {},
    incomeHistory: a.incomeHistory ? JSON.parse(a.incomeHistory) : [],
    raw: a.rawJson ? JSON.parse(a.rawJson) : null,
    reviewedByStaffAt: a.reviewedByStaffAt instanceof Date ? a.reviewedByStaffAt.toISOString() : a.reviewedByStaffAt,
    reviewedByAccountantAt: a.reviewedByAccountantAt instanceof Date ? a.reviewedByAccountantAt.toISOString() : a.reviewedByAccountantAt,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const url = new URL(req.url);
  const clientId = parseInt(url.searchParams.get("clientId") ?? "0", 10);
  const taxYear = url.searchParams.get("taxYear") ?? "";
  if (!clientId || !taxYear) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const cached = await prisma.clientNoticeAnalysis.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });
  if (!cached) return NextResponse.json({ data: null });
  const c = await prisma.client.findUnique({ where: { id: clientId }, select: { bizNumber: true } });
  const reductionInfo = await getReductionInfo(cached, c?.bizNumber);
  return NextResponse.json({ data: serializeAnalysis(cached), reductionInfo });
}
