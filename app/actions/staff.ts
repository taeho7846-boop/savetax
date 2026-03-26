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

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { username, name, password: hashed, role },
  });

  revalidatePath("/staff");
}

export async function updateStaff(id: number, formData: FormData) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const role = formData.get("role") as string;
  const isActive = formData.get("isActive") === "true";
  const newPassword = formData.get("newPassword") as string;

  const data: Record<string, unknown> = { name, role, isActive };
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
