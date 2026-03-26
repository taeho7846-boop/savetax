import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const existing = await pool.query("SELECT * FROM \"User\" WHERE username = $1", ["admin"]);
  if (existing.rows.length > 0) {
    console.log("이미 초기 계정이 존재합니다.");
    console.log("아이디: admin / 비밀번호: admin1234");
    return;
  }

  const hashed = await bcrypt.hash("admin1234", 10);
  await pool.query(
    `INSERT INTO "User" (username, password, name, role, "isActive", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
    ["admin", hashed, "관리자", "owner", true]
  );

  console.log("초기 계정 생성 완료!");
  console.log("아이디: admin");
  console.log("비밀번호: admin1234");
}

main()
  .catch(console.error)
  .finally(() => pool.end());
