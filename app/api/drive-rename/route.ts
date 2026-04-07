import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listFiles, ROOT_FOLDER_ID } from "@/lib/google-drive";
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

async function renameFile(fileId: string, newName: string) {
  const token = await getToken();
  const res = await fetch(`${API}/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  return res.json();
}

async function listFolders(parentId: string) {
  const token = await getToken();
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
    pageSize: "200",
  });
  const res = await fetch(`${API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

// GET: 현재 폴더 목록 보기
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parentId = req.nextUrl.searchParams.get("parentId") || ROOT_FOLDER_ID;
  const data = await listFolders(parentId);
  return NextResponse.json(data);
}

// POST: 번호 제거 실행
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { parentId } = await req.json();
  const folderId = parentId || ROOT_FOLDER_ID;

  const data = await listFolders(folderId);
  if (!data.files) return NextResponse.json({ error: "폴더 조회 실패", data });

  const results: { old: string; new: string; id: string }[] = [];

  for (const folder of data.files) {
    // "33. 인텍" → "인텍", "0. 표본" → "표본"
    const match = folder.name.match(/^\d+\.\s*(.+)$/);
    if (match) {
      const newName = match[1].trim();
      await renameFile(folder.id, newName);
      results.push({ old: folder.name, new: newName, id: folder.id });
    }
  }

  return NextResponse.json({ renamed: results.length, results });
}
