"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

async function requireAdmin() {
  const session = await requireAuth();
  if (session.role !== "owner" && session.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session;
}

export async function getStaffList() {
  await requireAdmin();
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      managerId: true,
      useSemoReport: true,
      taehoFeeRate: true,
      taehoOneoffRate: true,
      bizName1: true,
      bizName2: true,
      allowedMenus: true,
      googleEmail: true,
      googleCalendarId: true,
      createdAt: true,
    },
  });
}

export async function createStaff(formData: FormData) {
  await requireAdmin();

  const username = formData.get("username") as string;
  const name = formData.get("name") as string;
  const password = formData.get("password") as string;
  const role = (formData.get("role") as string) || "staff";

  if (!username || !name || !password) {
    throw new Error("아이디, 이름, 비밀번호를 모두 입력하세요.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new Error("이미 존재하는 아이디입니다.");
  }

  const managerId = formData.get("managerId") ? parseInt(formData.get("managerId") as string) : null;

  const hashed = await bcrypt.hash(password, 10);
  const bizName1 = (formData.get("bizName1") as string) || null;
  const bizName2 = (formData.get("bizName2") as string) || null;

  await prisma.user.create({
    data: { username, name, password: hashed, role, managerId, bizName1, bizName2 },
  });

  revalidatePath("/staff");
}

export async function updateStaff(id: number, formData: FormData) {
  await requireAdmin();

  const username = (formData.get("username") as string)?.trim();
  const name = formData.get("name") as string;
  const role = formData.get("role") as string;
  const isActive = formData.get("isActive") === "true";
  const newPassword = formData.get("newPassword") as string;

  if (!username) {
    throw new Error("아이디를 입력하세요.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing && existing.id !== id) {
    throw new Error("이미 존재하는 아이디입니다.");
  }

  const managerId = formData.get("managerId") ? parseInt(formData.get("managerId") as string) : null;
  const bizName1 = (formData.get("bizName1") as string) || null;
  const bizName2 = (formData.get("bizName2") as string) || null;
  const allowedMenus = (formData.get("allowedMenus") as string) || null;
  const googleEmail = (formData.get("googleEmail") as string) || null;
  const googleCalendarId = (formData.get("googleCalendarId") as string) || null;
  const data: Record<string, unknown> = { username, name, role, isActive, managerId, bizName1, bizName2, allowedMenus, googleEmail, googleCalendarId };
  // 세모리포트 사용 여부 — 세무사/대표/관리자 행에서만 보내짐 (직원은 소속 세무사 설정을 따름)
  if (formData.has("useSemoReport")) data.useSemoReport = formData.get("useSemoReport") === "true";
  // 세무회계태호 정산 수수료율(%) — 둘 다 비우면 정산 참여자에서 빠진다. 기장료율만 있으면 단건율은 0 취급.
  if (formData.has("taehoFeeRate")) {
    const parseRate = (key: string) => {
      const raw = String(formData.get(key) ?? "").trim();
      if (raw === "") return null;
      const n = Math.round(Number(raw));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("수수료율은 0~100 사이 숫자로 입력하세요.");
      return n;
    };
    const feeRate = parseRate("taehoFeeRate");
    const oneoffRate = parseRate("taehoOneoffRate");
    data.taehoFeeRate = feeRate ?? (oneoffRate != null ? 0 : null);
    data.taehoOneoffRate = feeRate == null && oneoffRate == null ? null : (oneoffRate ?? 0);
  }
  if (newPassword) {
    data.password = await bcrypt.hash(newPassword, 10);
  }

  await prisma.user.update({ where: { id }, data });
  revalidatePath("/staff");
}

export async function deleteStaff(id: number) {
  const session = await requireAdmin();
  if (session.id === id) {
    throw new Error("자기 자신은 삭제할 수 없습니다.");
  }
  await prisma.user.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/staff");
}
