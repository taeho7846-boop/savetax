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
      noticeType: { type: ["string", "null"] },
      bookkeepingDuty: { type: ["string", "null"] },
      filingType: { type: ["string", "null"], enum: ["기준경비율", "단순경비율", null] },
      businessNumber: { type: ["string", "null"] },
      bizCode: { type: ["string", "null"] },
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
      const reductionInfo = await getReductionInfo(cached);
      return NextResponse.json({ cached: true, data: serializeAnalysis(cached), reductionInfo });
    }
  }

  // 거래처 + 드라이브 폴더
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, driveFolderId: true },
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

  const reductionInfo = await getReductionInfo(saved);
  return NextResponse.json({ cached: false, data: serializeAnalysis(saved), reductionInfo });
}

async function getReductionInfo(analysis: any) {
  let raw: any;
  try {
    raw = analysis?.rawJson ? JSON.parse(analysis.rawJson) : null;
  } catch {
    raw = null;
  }
  const bizCode = raw?.bizCode;
  if (!bizCode) return null;
  const code = await prisma.taxReductionCode.findUnique({ where: { bizCode } });
  return {
    bizCode,
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
  const reductionInfo = await getReductionInfo(cached);
  return NextResponse.json({ data: serializeAnalysis(cached), reductionInfo });
}
