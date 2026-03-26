/**
 * SQLite → PostgreSQL 데이터 마이그레이션 스크립트
 */
import "dotenv/config";
import Database from "better-sqlite3";
import pg from "pg";
import path from "path";

const sqliteDb = new Database(path.join(process.cwd(), "dev.db"));
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
});

async function main() {
  console.log("SQLite → PostgreSQL 마이그레이션 시작...\n");

  // 1. Users (admin 이미 있으므로 중복 체크)
  const users = sqliteDb.prepare("SELECT * FROM User").all() as any[];
  for (const u of users) {
    const exists = await pool.query('SELECT id FROM "User" WHERE username = $1', [u.username]);
    if (exists.rows.length > 0) continue;
    await pool.query(
      `INSERT INTO "User" (id, username, password, name, role, "isActive", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [u.id, u.username, u.password, u.name, u.role, Boolean(u.isActive), new Date(u.createdAt), new Date(u.updatedAt)]
    );
  }
  console.log(`  User: ${users.length}건`);

  // 2. Settings
  const settings = sqliteDb.prepare("SELECT * FROM Settings").all() as any[];
  for (const s of settings) {
    await pool.query(
      `INSERT INTO "Settings" (id, "agentHometaxId", "agentHometaxPw", "certName", "certPassword", "commissionFormPath", "agentIdCardPath") VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [s.id, s.agentHometaxId, s.agentHometaxPw, s.certName, s.certPassword, s.commissionFormPath, s.agentIdCardPath]
    );
  }
  console.log(`  Settings: ${settings.length}건`);

  // 3. Clients
  const clients = sqliteDb.prepare("SELECT * FROM Client").all() as any[];
  for (const c of clients) {
    await pool.query(
      `INSERT INTO "Client" (id, name, "bizNumber", "ceoName", phone, email, address, "bizType", "clientType", "contractStatus", "taxationType", "taxTypes", "laborTypes", "residentNumber", "hometaxId", "hometaxPw", "monthlyFee", "firstWithdrawalMonth", "bankName", "bankAccount", notes, "assignedUserId", "isDeleted", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [c.id, c.name, c.bizNumber, c.ceoName, c.phone, c.email, c.address, c.bizType, c.clientType, c.contractStatus, c.taxationType, c.taxTypes, c.laborTypes, c.residentNumber, c.hometaxId, c.hometaxPw, c.monthlyFee, c.firstWithdrawalMonth, c.bankName, c.bankAccount, c.notes, c.assignedUserId, Boolean(c.isDeleted), new Date(c.createdAt), new Date(c.updatedAt)]
    );
  }
  console.log(`  Client: ${clients.length}건`);

  // 4. FeeRecords
  const fees = sqliteDb.prepare("SELECT * FROM FeeRecord").all() as any[];
  for (const f of fees) {
    await pool.query(
      `INSERT INTO "FeeRecord" (id, "clientId", "yearMonth", status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
      [f.id, f.clientId, f.yearMonth, f.status, new Date(f.createdAt), new Date(f.updatedAt)]
    );
  }
  console.log(`  FeeRecord: ${fees.length}건`);

  // 5. Tasks
  const tasks = sqliteDb.prepare("SELECT * FROM Task").all() as any[];
  for (const t of tasks) {
    await pool.query(
      `INSERT INTO "Task" (id, "clientId", "assignedUserId", title, "taskType", status, priority, "dueDate", "completedAt", notes, "isDeleted", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [t.id, t.clientId, t.assignedUserId, t.title, t.taskType, t.status, t.priority, t.dueDate ? new Date(t.dueDate) : null, t.completedAt ? new Date(t.completedAt) : null, t.notes, Boolean(t.isDeleted), new Date(t.createdAt), new Date(t.updatedAt)]
    );
  }
  console.log(`  Task: ${tasks.length}건`);

  // 6. CommissionProcess
  const commissions = sqliteDb.prepare("SELECT * FROM CommissionProcess").all() as any[];
  for (const cp of commissions) {
    await pool.query(
      `INSERT INTO "CommissionProcess" (id, "clientId", "hasIdCard", "hasHometaxCredentials", "hometaxCommissionDone", "hometaxCommissionAt", "wihagoType", "wihagoDone", "wihagoAt", "hasEmployees", "nationalPensionDone", "nationalPensionAt", "healthInsuranceDone", "healthInsuranceAt", "idCardPath", notes, "completedAt", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [cp.id, cp.clientId, Boolean(cp.hasIdCard), Boolean(cp.hasHometaxCredentials), Boolean(cp.hometaxCommissionDone), cp.hometaxCommissionAt ? new Date(cp.hometaxCommissionAt) : null, cp.wihagoType, Boolean(cp.wihagoDone), cp.wihagoAt ? new Date(cp.wihagoAt) : null, Boolean(cp.hasEmployees), Boolean(cp.nationalPensionDone), cp.nationalPensionAt ? new Date(cp.nationalPensionAt) : null, Boolean(cp.healthInsuranceDone), cp.healthInsuranceAt ? new Date(cp.healthInsuranceAt) : null, cp.idCardPath, cp.notes, cp.completedAt ? new Date(cp.completedAt) : null, new Date(cp.createdAt), new Date(cp.updatedAt)]
    );
  }
  console.log(`  CommissionProcess: ${commissions.length}건`);

  // 7. HappyCalls
  const calls = sqliteDb.prepare("SELECT * FROM HappyCall").all() as any[];
  for (const h of calls) {
    await pool.query(
      `INSERT INTO "HappyCall" (id, "commissionId", "attemptNo", result, notes, "calledAt") VALUES ($1,$2,$3,$4,$5,$6)`,
      [h.id, h.commissionId, h.attemptNo, h.result, h.notes, new Date(h.calledAt)]
    );
  }
  console.log(`  HappyCall: ${calls.length}건`);

  // 8. Memos
  const memos = sqliteDb.prepare("SELECT * FROM Memo").all() as any[];
  for (const m of memos) {
    await pool.query(
      `INSERT INTO "Memo" (id, "clientId", "taskId", "authorId", content, "memoType", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.id, m.clientId, m.taskId, m.authorId, m.content, m.memoType, new Date(m.createdAt), new Date(m.updatedAt)]
    );
  }
  console.log(`  Memo: ${memos.length}건`);

  // 시퀀스 리셋 (autoincrement ID 충돌 방지)
  const tables = ["User", "Client", "FeeRecord", "Task", "CommissionProcess", "HappyCall", "Memo"];
  for (const table of tables) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`
    );
  }
  console.log("\n  시퀀스 리셋 완료");

  console.log("\n마이그레이션 완료!");
}

main()
  .catch(console.error)
  .finally(() => {
    sqliteDb.close();
    pool.end();
  });
