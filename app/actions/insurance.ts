"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

// 4대보험 신고 관리 (고객사수정 모달 원천세 탭)
// 단계: requested(대표자 요청) → filed(실무자 신고) → confirmed(확인)

export type InsuranceStep = "requested" | "filed" | "confirmed";

function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function getInsuranceReports(clientId: number) {
  await requireAuth();
  return prisma.insuranceReport.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addInsuranceReport(
  clientId: number,
  data: {
    reportType: "acquisition" | "loss";
    employeeName: string;
    residentNumber?: string | null;
    baseSalary?: number | null;
    mealAllowance?: number | null;
    carAllowance?: number | null;
    researchAllowance?: number | null;
    hireDate?: string | null;
    leaveDate?: string | null;
    lossReason?: string | null;
    jobCertNeeded?: boolean;
  }
) {
  await requireAuth();
  return prisma.insuranceReport.create({
    data: {
      clientId,
      reportType: data.reportType,
      employeeName: data.employeeName,
      residentNumber: data.residentNumber || null,
      baseSalary: data.baseSalary ?? null,
      mealAllowance: data.mealAllowance ?? null,
      carAllowance: data.carAllowance ?? null,
      researchAllowance: data.researchAllowance ?? null,
      hireDate: data.hireDate || null,
      leaveDate: data.leaveDate || null,
      lossReason: data.lossReason || null,
      jobCertNeeded: data.jobCertNeeded ?? false,
    },
  });
}

// 성립신고는 사업장(거래처)당 1건 — 없으면 만들어서 반환
async function getOrCreateEstablishment(clientId: number) {
  const existing = await prisma.insuranceReport.findFirst({
    where: { clientId, reportType: "establishment" },
  });
  if (existing) return existing;
  return prisma.insuranceReport.create({
    data: { clientId, reportType: "establishment" },
  });
}

export async function completeInsuranceStep(reportId: number, step: InsuranceStep) {
  const session = await requireAuth();
  return prisma.insuranceReport.update({
    where: { id: reportId },
    data: { [`${step}Date`]: todayKST(), [`${step}By`]: session.name },
  });
}

export async function completeEstablishmentStep(clientId: number, step: InsuranceStep) {
  const session = await requireAuth();
  const report = await getOrCreateEstablishment(clientId);
  return prisma.insuranceReport.update({
    where: { id: report.id },
    data: { [`${step}Date`]: todayKST(), [`${step}By`]: session.name },
  });
}

export async function undoInsuranceStep(reportId: number, step: InsuranceStep) {
  await requireAuth();
  return prisma.insuranceReport.update({
    where: { id: reportId },
    data: { [`${step}Date`]: null, [`${step}By`]: null },
  });
}

export async function updateInsuranceStepDate(reportId: number, step: InsuranceStep, date: string) {
  await requireAuth();
  return prisma.insuranceReport.update({
    where: { id: reportId },
    data: { [`${step}Date`]: date },
  });
}

export async function updateInsuranceReport(
  reportId: number,
  data: {
    employeeName?: string;
    residentNumber?: string | null;
    baseSalary?: number | null;
    mealAllowance?: number | null;
    carAllowance?: number | null;
    researchAllowance?: number | null;
    hireDate?: string | null;
    leaveDate?: string | null;
    lossReason?: string | null;
    jobCertNeeded?: boolean;
    memo?: string | null;
  }
) {
  await requireAuth();
  return prisma.insuranceReport.update({ where: { id: reportId }, data });
}

export async function deleteInsuranceReport(reportId: number) {
  await requireAuth();
  return prisma.insuranceReport.delete({ where: { id: reportId } });
}
