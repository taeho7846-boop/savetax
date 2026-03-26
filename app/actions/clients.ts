"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function getTaxTypes(formData: FormData) {
  const types = ["기장대리", "신고대리"].filter(
    (t) => formData.get(`taxType_${t}`) === t
  );
  return types.length > 0 ? types.join(", ") : null;
}

function getLaborTypes(formData: FormData) {
  const types = ["1인사업자", "근로소득", "사업소득", "일용직"].filter(
    (t) => formData.get(`laborType_${t}`) === t
  );
  return types.length > 0 ? types.join(", ") : null;
}

export async function createClient(formData: FormData) {
  const session = await requireAuth();

  const client = await prisma.client.create({
    data: {
      name: formData.get("name") as string,
      bizNumber: (formData.get("bizNumber") as string) || null,
      ceoName: (formData.get("ceoName") as string) || null,
      residentNumber: (formData.get("residentNumber") as string) || null,
      phone: (formData.get("phone") as string) || null,
      address: (formData.get("address") as string) || null,
      clientType: (formData.get("clientType") as string) || "individual",
      taxationType: (formData.get("taxationType") as string) || null,
      taxTypes: getTaxTypes(formData),
      laborTypes: getLaborTypes(formData),
      hometaxId: (formData.get("hometaxId") as string) || null,
      hometaxPw: (formData.get("hometaxPw") as string) || null,
      monthlyFee: formData.get("monthlyFee") ? parseInt(formData.get("monthlyFee") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      notes: (formData.get("notes") as string) || null,
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : session.id,
    },
  });

  await prisma.commissionProcess.create({ data: { clientId: client.id } });

  revalidatePath("/clients");
  revalidatePath("/commission");
  redirect("/clients");
}

export async function updateClient(id: number, formData: FormData) {
  await requireAuth();

  await prisma.client.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      bizNumber: (formData.get("bizNumber") as string) || null,
      ceoName: (formData.get("ceoName") as string) || null,
      residentNumber: (formData.get("residentNumber") as string) || null,
      phone: (formData.get("phone") as string) || null,
      address: (formData.get("address") as string) || null,
      clientType: (formData.get("clientType") as string) || "individual",
      taxationType: (formData.get("taxationType") as string) || null,
      taxTypes: getTaxTypes(formData),
      laborTypes: getLaborTypes(formData),
      hometaxId: (formData.get("hometaxId") as string) || null,
      hometaxPw: (formData.get("hometaxPw") as string) || null,
      monthlyFee: formData.get("monthlyFee") ? parseInt(formData.get("monthlyFee") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      notes: (formData.get("notes") as string) || null,
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : null,
    },
  });

  revalidatePath("/clients");
  redirect("/clients");
}

export async function updateClientInModal(id: number, formData: FormData) {
  await requireAuth();

  await prisma.client.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      bizNumber: (formData.get("bizNumber") as string) || null,
      ceoName: (formData.get("ceoName") as string) || null,
      residentNumber: (formData.get("residentNumber") as string) || null,
      phone: (formData.get("phone") as string) || null,
      address: (formData.get("address") as string) || null,
      clientType: (formData.get("clientType") as string) || "individual",
      taxationType: (formData.get("taxationType") as string) || null,
      taxTypes: getTaxTypes(formData),
      laborTypes: getLaborTypes(formData),
      hometaxId: (formData.get("hometaxId") as string) || null,
      hometaxPw: (formData.get("hometaxPw") as string) || null,
      monthlyFee: formData.get("monthlyFee") ? parseInt(formData.get("monthlyFee") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      notes: (formData.get("notes") as string) || null,
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : null,
    },
  });

  revalidatePath("/clients");
}

export async function getClientById(id: number) {
  await requireAuth();
  const [client, users] = await Promise.all([
    prisma.client.findUnique({ where: { id, isDeleted: false } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { client, users };
}

export async function getCreateClientData() {
  await requireAuth();
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { users };
}

export async function createClientInModal(formData: FormData) {
  const session = await requireAuth();

  const client = await prisma.client.create({
    data: {
      name: formData.get("name") as string,
      bizNumber: (formData.get("bizNumber") as string) || null,
      ceoName: (formData.get("ceoName") as string) || null,
      residentNumber: (formData.get("residentNumber") as string) || null,
      phone: (formData.get("phone") as string) || null,
      address: (formData.get("address") as string) || null,
      clientType: (formData.get("clientType") as string) || "individual",
      taxationType: (formData.get("taxationType") as string) || null,
      taxTypes: getTaxTypes(formData),
      laborTypes: getLaborTypes(formData),
      hometaxId: (formData.get("hometaxId") as string) || null,
      hometaxPw: (formData.get("hometaxPw") as string) || null,
      monthlyFee: formData.get("monthlyFee") ? parseInt(formData.get("monthlyFee") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      notes: (formData.get("notes") as string) || null,
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : session.id,
    },
  });

  await prisma.commissionProcess.create({ data: { clientId: client.id } });

  revalidatePath("/clients");
  revalidatePath("/commission");
  revalidatePath("/tax-agency");
  revalidatePath("/dashboard");
}

export async function deleteClient(id: number) {
  await requireAuth();
  await prisma.client.update({ where: { id }, data: { isDeleted: true } });
  revalidatePath("/clients");
  revalidatePath("/commission");
  revalidatePath("/tax-agency");
  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  redirect("/clients");
}
