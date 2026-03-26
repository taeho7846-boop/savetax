/**
 * SQLite → PostgreSQL 데이터 마이그레이션 스크립트
 *
 * 사용법:
 * 1. .env에 PostgreSQL DATABASE_URL 설정
 * 2. npx prisma migrate dev (테이블 생성)
 * 3. npx tsx scripts/migrate-data.ts
 */
import Database from "better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client.ts";
import path from "path";

const sqliteDb = new Database(path.join(process.cwd(), "dev.db"));
const prisma = new PrismaClient();

async function main() {
  console.log("SQLite → PostgreSQL 마이그레이션 시작...\n");

  // 1. Users
  const users = sqliteDb.prepare("SELECT * FROM User").all() as any[];
  for (const u of users) {
    await prisma.user.create({
      data: {
        id: u.id,
        username: u.username,
        password: u.password,
        name: u.name,
        role: u.role,
        isActive: Boolean(u.isActive),
        createdAt: new Date(u.createdAt),
        updatedAt: new Date(u.updatedAt),
      },
    });
  }
  console.log(`  User: ${users.length}건`);

  // 2. Settings
  const settings = sqliteDb.prepare("SELECT * FROM Settings").all() as any[];
  for (const s of settings) {
    await prisma.settings.create({
      data: {
        id: s.id,
        agentHometaxId: s.agentHometaxId,
        agentHometaxPw: s.agentHometaxPw,
        certName: s.certName,
        certPassword: s.certPassword,
        commissionFormPath: s.commissionFormPath,
        agentIdCardPath: s.agentIdCardPath,
      },
    });
  }
  console.log(`  Settings: ${settings.length}건`);

  // 3. Clients
  const clients = sqliteDb.prepare("SELECT * FROM Client").all() as any[];
  for (const c of clients) {
    await prisma.client.create({
      data: {
        id: c.id,
        name: c.name,
        bizNumber: c.bizNumber,
        ceoName: c.ceoName,
        phone: c.phone,
        email: c.email,
        address: c.address,
        bizType: c.bizType,
        clientType: c.clientType,
        contractStatus: c.contractStatus,
        taxationType: c.taxationType,
        taxTypes: c.taxTypes,
        laborTypes: c.laborTypes,
        residentNumber: c.residentNumber,
        hometaxId: c.hometaxId,
        hometaxPw: c.hometaxPw,
        monthlyFee: c.monthlyFee,
        firstWithdrawalMonth: c.firstWithdrawalMonth,
        bankName: c.bankName,
        bankAccount: c.bankAccount,
        notes: c.notes,
        assignedUserId: c.assignedUserId,
        isDeleted: Boolean(c.isDeleted),
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt),
      },
    });
  }
  console.log(`  Client: ${clients.length}건`);

  // 4. FeeRecords
  const fees = sqliteDb.prepare("SELECT * FROM FeeRecord").all() as any[];
  for (const f of fees) {
    await prisma.feeRecord.create({
      data: {
        id: f.id,
        clientId: f.clientId,
        yearMonth: f.yearMonth,
        status: f.status,
        createdAt: new Date(f.createdAt),
        updatedAt: new Date(f.updatedAt),
      },
    });
  }
  console.log(`  FeeRecord: ${fees.length}건`);

  // 5. Tasks
  const tasks = sqliteDb.prepare("SELECT * FROM Task").all() as any[];
  for (const t of tasks) {
    await prisma.task.create({
      data: {
        id: t.id,
        clientId: t.clientId,
        assignedUserId: t.assignedUserId,
        title: t.title,
        taskType: t.taskType,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        notes: t.notes,
        isDeleted: Boolean(t.isDeleted),
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
      },
    });
  }
  console.log(`  Task: ${tasks.length}건`);

  // 6. CommissionProcess
  const commissions = sqliteDb.prepare("SELECT * FROM CommissionProcess").all() as any[];
  for (const cp of commissions) {
    await prisma.commissionProcess.create({
      data: {
        id: cp.id,
        clientId: cp.clientId,
        hasIdCard: Boolean(cp.hasIdCard),
        hasHometaxCredentials: Boolean(cp.hasHometaxCredentials),
        hometaxCommissionDone: Boolean(cp.hometaxCommissionDone),
        hometaxCommissionAt: cp.hometaxCommissionAt ? new Date(cp.hometaxCommissionAt) : null,
        wihagoType: cp.wihagoType,
        wihagoDone: Boolean(cp.wihagoDone),
        wihagoAt: cp.wihagoAt ? new Date(cp.wihagoAt) : null,
        hasEmployees: Boolean(cp.hasEmployees),
        nationalPensionDone: Boolean(cp.nationalPensionDone),
        nationalPensionAt: cp.nationalPensionAt ? new Date(cp.nationalPensionAt) : null,
        healthInsuranceDone: Boolean(cp.healthInsuranceDone),
        healthInsuranceAt: cp.healthInsuranceAt ? new Date(cp.healthInsuranceAt) : null,
        idCardPath: cp.idCardPath,
        notes: cp.notes,
        completedAt: cp.completedAt ? new Date(cp.completedAt) : null,
        createdAt: new Date(cp.createdAt),
        updatedAt: new Date(cp.updatedAt),
      },
    });
  }
  console.log(`  CommissionProcess: ${commissions.length}건`);

  // 7. HappyCalls
  const calls = sqliteDb.prepare("SELECT * FROM HappyCall").all() as any[];
  for (const h of calls) {
    await prisma.happyCall.create({
      data: {
        id: h.id,
        commissionId: h.commissionId,
        attemptNo: h.attemptNo,
        result: h.result,
        notes: h.notes,
        calledAt: new Date(h.calledAt),
      },
    });
  }
  console.log(`  HappyCall: ${calls.length}건`);

  // 8. Memos
  const memos = sqliteDb.prepare("SELECT * FROM Memo").all() as any[];
  for (const m of memos) {
    await prisma.memo.create({
      data: {
        id: m.id,
        clientId: m.clientId,
        taskId: m.taskId,
        authorId: m.authorId,
        content: m.content,
        memoType: m.memoType,
        createdAt: new Date(m.createdAt),
        updatedAt: new Date(m.updatedAt),
      },
    });
  }
  console.log(`  Memo: ${memos.length}건`);

  // PostgreSQL 시퀀스 리셋 (autoincrement ID 충돌 방지)
  const tables = ["User", "Client", "FeeRecord", "Task", "CommissionProcess", "HappyCall", "Memo"];
  for (const table of tables) {
    const tableName = `"${table}"`;
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence(${`'${table}'`}, 'id'), COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1, false)`
    );
  }
  console.log("\n  시퀀스 리셋 완료");

  console.log("\n마이그레이션 완료!");
}

main()
  .catch(console.error)
  .finally(() => {
    sqliteDb.close();
    prisma.$disconnect();
  });
