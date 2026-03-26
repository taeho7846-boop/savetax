import { PrismaClient } from "../app/generated/prisma/client.ts";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({ where: { username: "admin" } });
  if (existing) {
    console.log("이미 초기 계정이 존재합니다.");
    console.log("아이디: admin / 비밀번호: admin1234");
    return;
  }

  const hashed = await bcrypt.hash("admin1234", 10);
  await prisma.user.create({
    data: {
      username: "admin",
      password: hashed,
      name: "관리자",
      role: "owner",
    },
  });

  console.log("초기 계정 생성 완료!");
  console.log("아이디: admin");
  console.log("비밀번호: admin1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
