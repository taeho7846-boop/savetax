import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: 불러오기
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isList = req.nextUrl.searchParams.get("list") === "1";
  const taxYear = req.nextUrl.searchParams.get("taxYear") || "";

  if (isList && taxYear) {
    const settings = await prisma.incomeTaxCalcSetting.findMany({
      where: { taxYear },
      select: { clientId: true },
    });
    return NextResponse.json({ clientIds: settings.map(s => s.clientId) });
  }

  const clientId = parseInt(req.nextUrl.searchParams.get("clientId") || "0");
  if (!clientId || !taxYear) return NextResponse.json({ error: "clientId, taxYear 필요" }, { status: 400 });

  const setting = await prisma.incomeTaxCalcSetting.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  return NextResponse.json({ setting });
}

// POST: 저장
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { clientId, taxYear, revenue, expense, income, useIncome, startupRate, smeRate, investCredit, employmentCredit, extraExpense } = body;

  if (!clientId || !taxYear) return NextResponse.json({ error: "clientId, taxYear 필요" }, { status: 400 });

  const setting = await prisma.incomeTaxCalcSetting.upsert({
    where: { clientId_taxYear: { clientId, taxYear } },
    update: { revenue, expense, income, useIncome, startupRate, smeRate, investCredit, employmentCredit, extraExpense },
    create: { clientId, taxYear, revenue, expense, income, useIncome, startupRate, smeRate, investCredit, employmentCredit, extraExpense },
  });

  return NextResponse.json({ ok: true, setting });
}
