import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleAuth } from "google-auth-library";

const API = "https://www.googleapis.com/drive/v3";

async function getToken() {
  let credentials: any = {};
  try {
    const fs = require("fs");
    const path = require("path");
    const keyPath = path.join(process.cwd(), "google-credentials.json");
    if (fs.existsSync(keyPath)) {
      credentials = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    }
  } catch {}
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return token.token || "";
}

async function listFolders(parentId: string) {
  const token = await getToken();
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
    pageSize: "500",
  });
  const res = await fetch(`${API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// GET: 매칭 미리보기 (dry run)
// POST: 실제 매칭 실행
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parentId = req.nextUrl.searchParams.get("parentId");
  if (!parentId) return NextResponse.json({ error: "parentId 필요" }, { status: 400 });

  // 드라이브 폴더 목록
  const driveData = await listFolders(parentId);
  const driveFolders: { id: string; name: string }[] = driveData.files || [];

  // DB 거래처 (driveFolderId가 비어있는 것만)
  const clients = await prisma.client.findMany({
    where: { isDeleted: false, driveFolderId: null },
    select: { id: true, name: true },
  });

  const matched: { clientId: number; clientName: string; folderId: string; folderName: string }[] = [];
  const unmatched: string[] = [];

  for (const folder of driveFolders) {
    // 정확히 일치하는 거래처 찾기
    const exact = clients.find(c => c.name === folder.name);
    if (exact) {
      matched.push({
        clientId: exact.id,
        clientName: exact.name,
        folderId: folder.id,
        folderName: folder.name,
      });
    } else {
      unmatched.push(folder.name);
    }
  }

  return NextResponse.json({ matched: matched.length, unmatched: unmatched.length, matchedList: matched, unmatchedList: unmatched });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { parentId } = await req.json();
  if (!parentId) return NextResponse.json({ error: "parentId 필요" }, { status: 400 });

  const driveData = await listFolders(parentId);
  const driveFolders: { id: string; name: string }[] = driveData.files || [];

  const clients = await prisma.client.findMany({
    where: { isDeleted: false, driveFolderId: null },
    select: { id: true, name: true },
  });

  let updated = 0;

  for (const folder of driveFolders) {
    const exact = clients.find(c => c.name === folder.name);
    if (exact) {
      await prisma.client.update({
        where: { id: exact.id },
        data: { driveFolderId: folder.id },
      });
      updated++;
    }
  }

  return NextResponse.json({ updated });
}
