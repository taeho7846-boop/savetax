"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function toggleIncomeTaxCheck(
  clientId: number,
  taxYear: string,
  field: string
) {
  await requireAuth();

  const boolFields = [
    "noticeSent", "linkPass", "depreciation", "interestExpense",
    "insurance", "donation", "preSettlement",
    "bookkeepingCredit", "startupReduction", "smeReduction",
    "investCredit", "employmentCredit", "depositReceived", "filingDone", "paymentSent",
  ];
  if (!boolFields.includes(field)) return;

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data: { [field]: !(existing as any)[field] },
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, [field]: true },
    });
  }

  revalidatePath("/income-tax");
}

export async function updateIncomeTaxField(
  clientId: number,
  taxYear: string,
  field: string,
  value: string
) {
  await requireAuth();

  const textFields = ["bookkeepingDuty", "filingType"];
  const numberFields = ["prevSales", "prevIncome", "prevTax", "currSales", "currIncome", "currTax", "adjustmentFee"];

  let data: Record<string, any> = {};
  if (textFields.includes(field)) {
    data[field] = value || null;
  } else if (numberFields.includes(field)) {
    data[field] = value ? BigInt(value.replace(/[^0-9-]/g, "")) : null;
  } else {
    return;
  }

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, ...data },
    });
  }

  revalidatePath("/income-tax");
}

export async function setIncomeTaxMemo(
  clientId: number,
  taxYear: string,
  memo: string
) {
  await requireAuth();

  const existing = await prisma.incomeTaxRecord.findUnique({
    where: { clientId_taxYear: { clientId, taxYear } },
  });

  if (existing) {
    await prisma.incomeTaxRecord.update({
      where: { id: existing.id },
      data: { memo: memo || null },
    });
  } else {
    await prisma.incomeTaxRecord.create({
      data: { clientId, taxYear, memo: memo || null },
    });
  }

  revalidatePath("/income-tax");
}
