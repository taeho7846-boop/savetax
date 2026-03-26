"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    redirect("/login?error=" + encodeURIComponent("아이디와 비밀번호를 입력하세요."));
  }

  const user = await prisma.user.findUnique({ where: { username } });

  if (!user || !user.isActive) {
    redirect("/login?error=" + encodeURIComponent("아이디 또는 비밀번호가 올바르지 않습니다."));
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    redirect("/login?error=" + encodeURIComponent("아이디 또는 비밀번호가 올바르지 않습니다."));
  }

  const cookieStore = await cookies();
  cookieStore.set("session_user_id", String(user.id), {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 8, // 8시간
  });

  redirect("/dashboard");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete("session_user_id");
  redirect("/login");
}
