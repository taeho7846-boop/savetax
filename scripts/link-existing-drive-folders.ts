// 기존 구글 드라이브 폴더를 거래처에 연결 (driveFolderId가 없는 거래처만)
// 사용: cd /root/savetax && npx tsx scripts/link-existing-drive-folders.ts [--dry-run]

import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { GoogleAuth } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" });
const adapter = new PrismaPg(pool as any);
const prisma = new PrismaClient({ adapter });
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const API = "https://www.googleapis.com/drive/v3";
const DRY_RUN = process.argv.includes("--dry-run");

let authClient: GoogleAuth | null = null;
function getAuth(): GoogleAuth {
  if (!authClient) {
    let credentials: Record<string, unknown> = {};
    const keyPath = path.join(process.cwd(), "google-credentials.json");
    if (fs.existsSync(keyPath)) {
      credentials = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    } else {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
    }
    authClient = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
  }
  return authClient;
}

async function getToken(): Promise<string> {
  const client = await getAuth().getClient();
  const t = await client.getAccessToken();
  return t.token || "";
}

type DriveFile = { id: string; name: string };
type DriveListResp = { files?: DriveFile[]; error?: { message: string } };

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const token = await getToken();
  const safeName = name.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    corpora: "allDrives",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const res = await fetch(`${API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as DriveListResp;
  if (data.error) {
    console.error(`  [Drive API 오류] ${data.error.message}`);
    return null;
  }
  if (data.files && data.files.length > 0) return data.files[0].id;
  return null;
}

async function main() {
  if (!ROOT_FOLDER_ID) {
    console.error("GOOGLE_DRIVE_FOLDER_ID 환경변수가 비어있습니다");
    process.exit(1);
  }

  console.log(`모드: ${DRY_RUN ? "DRY RUN (DB 변경 없음)" : "실제 연결"}`);
  console.log("미연결 거래처 조회 중...");

  const clients = await prisma.client.findMany({
    where: { isDeleted: false, driveFolderId: null, assignedUserId: { not: null } },
    include: { assignedUser: { select: { name: true } } },
    orderBy: [{ assignedUser: { name: "asc" } }, { name: "asc" }],
  });

  console.log(`처리 대상: ${clients.length}건\n`);

  const managerCache = new Map<string, string | null>();
  let linked = 0;
  let notFound = 0;
  let managerMissing = 0;
  const notFoundList: string[] = [];

  for (const c of clients) {
    const managerName = c.assignedUser?.name;
    if (!managerName) {
      managerMissing++;
      console.log(`✗ ${c.name} (담당자 없음)`);
      continue;
    }

    let managerFolderId = managerCache.get(managerName);
    if (managerFolderId === undefined) {
      managerFolderId = await findFolder(managerName, ROOT_FOLDER_ID);
      managerCache.set(managerName, managerFolderId);
      if (managerFolderId) console.log(`📁 매니저 폴더 발견: ${managerName} → ${managerFolderId}`);
      else console.log(`⚠️ 매니저 폴더 없음: ${managerName}`);
    }
    if (!managerFolderId) {
      notFound++;
      notFoundList.push(`[${managerName}] ${c.name}`);
      continue;
    }

    const clientFolderId = await findFolder(c.name, managerFolderId);
    if (!clientFolderId) {
      notFound++;
      notFoundList.push(`[${managerName}] ${c.name}`);
      console.log(`  ✗ ${c.name}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ✓ ${c.name} → ${clientFolderId} (DRY RUN)`);
    } else {
      await prisma.client.update({ where: { id: c.id }, data: { driveFolderId: clientFolderId } });
      console.log(`  ✓ ${c.name} → ${clientFolderId}`);
    }
    linked++;
  }

  console.log("\n=== 결과 ===");
  console.log(`연결 ${DRY_RUN ? "예정" : "성공"}: ${linked}건`);
  console.log(`폴더 없음: ${notFound}건`);
  console.log(`담당자 없음: ${managerMissing}건`);
  if (notFoundList.length > 0) {
    console.log("\n[폴더 못 찾은 목록]");
    notFoundList.forEach((s) => console.log(`  - ${s}`));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
