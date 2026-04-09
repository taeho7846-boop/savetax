"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createClientFolder } from "@/lib/google-drive";
import { redirect } from "next/navigation";

async function parseWehagoUrl(url: string | null | undefined, clientId?: number) {
  if (!url || !url.includes("smarta.wehago.com")) return {};
  const getParam = (key: string) => {
    const match = url.match(new RegExp(`[?&]${key}=([^&]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  };
  const cno = getParam("cno");
  const cdCom = getParam("cd_com");
  const color = getParam("color");
  const yminsa = getParam("yminsa");
  const taxNum = getParam("taxNum");
  const companyID = getParam("companyID");
  if (!cno) return {};
  const result: any = { wehagoCno: cno };
  if (cdCom) result.wehagoCdCom = cdCom;
  if (color && yminsa) {
    let existing: Record<string, string> = {};
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { wehagoColors: true } });
      try { existing = JSON.parse(client?.wehagoColors || "{}"); } catch {}
    }
    existing[yminsa] = color;
    result.wehagoColors = JSON.stringify(existing);
  }
  // taxNum, companyID → Settings에 저장
  if (taxNum || companyID) {
    try {
      const session = await requireAuth();
      const updateData: any = {};
      if (taxNum) updateData.wehagoTaxNum = taxNum;
      if (companyID) updateData.wehagoId = companyID;
      await prisma.settings.upsert({
        where: { userId: session.id },
        update: updateData,
        create: { userId: session.id, ...updateData },
      });
    } catch {}
  }
  return result;
}

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

function getAccountingProgram(formData: FormData) {
  const types = ["위하고", "세무사랑"].filter(
    (t) => formData.get(`accountingProgram_${t}`) === t
  );
  return types.length > 0 ? types.join(",") : "위하고";
}

function getContactMethod(formData: FormData) {
  const methods = ["메일", "카톡", "문자"].filter(
    (t) => formData.get(`contactMethod_${t}`) === t
  );
  return methods.length > 0 ? methods.join(",") : "카톡";
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
      freeMonths: formData.get("freeMonths") ? parseInt(formData.get("freeMonths") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      openDate: (formData.get("openDate") as string) || null,
      halfYearTax: formData.get("halfYearTax") === "true",
      withholdingType: (formData.get("withholdingType") as string) || null,
      affiliation: (formData.get("affiliation") as string) || null,
      notes: (formData.get("notes") as string) || null,
      ...(await parseWehagoUrl(formData.get("wehagoPayrollUrl") as string)),
      accountingProgram: getAccountingProgram(formData),
      contactMethod: getContactMethod(formData),
      assignedUserId: formData.get("assignedUserId")
        ? parseInt(formData.get("assignedUserId") as string)
        : session.id,
    },
  });

  await prisma.commissionProcess.create({ data: { clientId: client.id } });

  // 구글 드라이브 폴더 자동 생성
  try {
    const user = await prisma.user.findUnique({ where: { id: client.assignedUserId ?? session.id }, select: { name: true } });
    if (user) {
      const { folderId } = await createClientFolder(user.name, client.name, client.clientType);
      await prisma.client.update({ where: { id: client.id }, data: { driveFolderId: folderId } });
    }
  } catch (e) {
    console.error("[Google Drive] 폴더 생성 실패:", e);
  }

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
      freeMonths: formData.get("freeMonths") ? parseInt(formData.get("freeMonths") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      openDate: (formData.get("openDate") as string) || null,
      halfYearTax: formData.get("halfYearTax") === "true",
      withholdingType: (formData.get("withholdingType") as string) || null,
      affiliation: (formData.get("affiliation") as string) || null,
      notes: (formData.get("notes") as string) || null,
      ...(await parseWehagoUrl(formData.get("wehagoPayrollUrl") as string, id)),
      accountingProgram: getAccountingProgram(formData),
      contactMethod: getContactMethod(formData),
      ...(formData.has("assignedUserId")
        ? { assignedUserId: formData.get("assignedUserId") ? parseInt(formData.get("assignedUserId") as string) : null }
        : {}),
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
      freeMonths: formData.get("freeMonths") ? parseInt(formData.get("freeMonths") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      openDate: (formData.get("openDate") as string) || null,
      halfYearTax: formData.get("halfYearTax") === "true",
      withholdingType: (formData.get("withholdingType") as string) || null,
      affiliation: (formData.get("affiliation") as string) || null,
      notes: (formData.get("notes") as string) || null,
      ...(await parseWehagoUrl(formData.get("wehagoPayrollUrl") as string, id)),
      accountingProgram: getAccountingProgram(formData),
      contactMethod: getContactMethod(formData),
      ...(formData.has("assignedUserId")
        ? { assignedUserId: formData.get("assignedUserId") ? parseInt(formData.get("assignedUserId") as string) : null }
        : {}),
    },
  });

  revalidatePath("/clients");
}

export async function getClientById(id: number) {
  const session = await requireAuth();
  const [client, allUsers, currentUser] = await Promise.all([
    prisma.client.findUnique({ where: { id, isDeleted: false } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, managerId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.id },
      select: { bizName1: true, bizName2: true, managerId: true },
    }),
  ]);

  // 세무사/관리자: 본인 + 소속 직원만 표시, 대표: 전체
  let users: { id: number; name: string }[];
  if (session.role === "accountant" || session.role === "admin") {
    users = allUsers.filter(u => u.id === session.id || u.managerId === session.id);
  } else if (session.role === "owner") {
    users = allUsers;
  } else {
    users = allUsers;
  }

  // 소속 옵션: 본인(세무사/관리자/대표)의 사업체명 또는 소속 세무사의 사업체명
  const affiliationSet = new Set<string>(["세이브택스"]);
  if (session.role === "employee" && currentUser?.managerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: currentUser.managerId },
      select: { bizName1: true, bizName2: true },
    });
    if (mgr?.bizName1) affiliationSet.add(mgr.bizName1);
    if (mgr?.bizName2) affiliationSet.add(mgr.bizName2);
  } else {
    if (currentUser?.bizName1) affiliationSet.add(currentUser.bizName1);
    if (currentUser?.bizName2) affiliationSet.add(currentUser.bizName2);
  }
  const affiliationOptions = [...affiliationSet];

  return { client, users, currentUserRole: session.role, affiliationOptions };
}

export async function getClientHistory(clientId: number) {
  await requireAuth();
  const [tasks, memos] = await Promise.all([
    prisma.task.findMany({
      where: { clientId, isDeleted: false },
      include: { assignedUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.memo.findMany({
      where: { clientId },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { tasks, memos };
}

export async function getCreateClientData() {
  const session = await requireAuth();
  const [allUsers, currentUser] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true, managerId: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.id },
      select: { bizName1: true, bizName2: true, managerId: true },
    }),
  ]);

  let users: { id: number; name: string }[];
  if (session.role === "accountant" || session.role === "admin") {
    users = allUsers.filter(u => u.id === session.id || u.managerId === session.id);
  } else {
    users = allUsers;
  }

  const affiliationSet = new Set<string>(["세이브택스"]);
  if (session.role === "employee" && currentUser?.managerId) {
    const mgr = await prisma.user.findUnique({
      where: { id: currentUser.managerId },
      select: { bizName1: true, bizName2: true },
    });
    if (mgr?.bizName1) affiliationSet.add(mgr.bizName1);
    if (mgr?.bizName2) affiliationSet.add(mgr.bizName2);
  } else {
    if (currentUser?.bizName1) affiliationSet.add(currentUser.bizName1);
    if (currentUser?.bizName2) affiliationSet.add(currentUser.bizName2);
  }

  return { users, currentUserRole: session.role, affiliationOptions: [...affiliationSet] };
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
      freeMonths: formData.get("freeMonths") ? parseInt(formData.get("freeMonths") as string) : null,
      firstWithdrawalMonth: (formData.get("firstWithdrawalMonth") as string) || null,
      bankName: (formData.get("bankName") as string) || null,
      bankAccount: (formData.get("bankAccount") as string) || null,
      openDate: (formData.get("openDate") as string) || null,
      halfYearTax: formData.get("halfYearTax") === "true",
      affiliation: (formData.get("affiliation") as string) || null,
      notes: (formData.get("notes") as string) || null,
      ...(await parseWehagoUrl(formData.get("wehagoPayrollUrl") as string)),
      accountingProgram: getAccountingProgram(formData),
      contactMethod: getContactMethod(formData),
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

export async function bulkDeleteClients(ids: number[]) {
  const session = await requireAuth();
  if (ids.length === 0) return { count: 0 };

  const result = await prisma.client.updateMany({
    where: {
      id: { in: ids },
      assignedUserId: session.id,
      isDeleted: false,
    },
    data: { isDeleted: true },
  });

  revalidatePath("/clients");
  revalidatePath("/commission");
  revalidatePath("/tax-agency");
  revalidatePath("/receivables");
  revalidatePath("/dashboard");
  return { count: result.count };
}

export async function restoreClient(id: number) {
  await requireAuth();
  await prisma.client.update({ where: { id }, data: { isDeleted: false } });
  revalidatePath("/clients");
}

export async function permanentDeleteClient(id: number) {
  await requireAuth();
  // 관련 데이터 삭제 후 클라이언트 삭제
  await prisma.feeRecord.deleteMany({ where: { clientId: id } });
  await prisma.withholdingRecord.deleteMany({ where: { clientId: id } });
  await prisma.withholdingLaborOverride.deleteMany({ where: { clientId: id } });
  await prisma.withholdingProcess.deleteMany({ where: { clientId: id } });
  await prisma.incomeTaxRecord.deleteMany({ where: { clientId: id } });
  await prisma.dataCollection.deleteMany({ where: { clientId: id } });
  const cp = await prisma.commissionProcess.findUnique({ where: { clientId: id } });
  if (cp) {
    await prisma.happyCall.deleteMany({ where: { commissionId: cp.id } });
    await prisma.commissionProcess.delete({ where: { id: cp.id } });
  }
  await prisma.memo.deleteMany({ where: { clientId: id } });
  await prisma.task.deleteMany({ where: { clientId: id } });
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
}

export async function bulkChangeAssignedUser(ids: number[], newUserId: number) {
  await requireAuth();
  if (ids.length === 0) return { count: 0 };

  const result = await prisma.client.updateMany({
    where: { id: { in: ids }, isDeleted: false },
    data: { assignedUserId: newUserId },
  });

  revalidatePath("/clients");
  revalidatePath("/commission");
  revalidatePath("/dashboard");
  return { count: result.count };
}

export async function getAssignableUsers() {
  const session = await requireAuth();
  const allUsers = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, role: true, managerId: true },
    orderBy: { name: "asc" },
  });

  if (session.role === "accountant" || session.role === "admin") {
    return allUsers.filter(u => u.id === session.id || u.managerId === session.id);
  }
  return allUsers;
}

export async function cycleCmsStatus(id: number) {
  await requireAuth();
  const client = await prisma.client.findUnique({ where: { id }, select: { cmsStatus: true } });
  if (!client) return;
  // none → pending → done → none 순환
  const next = client.cmsStatus === "none" ? "pending" : client.cmsStatus === "pending" ? "done" : "none";
  await prisma.client.update({ where: { id }, data: { cmsStatus: next } });
  revalidatePath("/receivables");
}

export async function bulkCmsRegister(ids: number[]) {
  const session = await requireAuth();
  if (ids.length === 0) return;
  await prisma.client.updateMany({
    where: { id: { in: ids }, assignedUserId: session.id },
    data: { cmsStatus: "done" },
  });
  revalidatePath("/receivables");
}
