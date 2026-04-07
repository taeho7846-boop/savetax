import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GoogleAuth } from "google-auth-library";

const TRANSFER_DRIVE_ID = "0ACGF_pTVEHtDUk9PVA"; // SAVETAX논현지점 공유 드라이브
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

// GET: 이관자료 목록 조회
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const token = await getToken();

    // 공유 드라이브에서 최근 파일/폴더 조회
    const params = new URLSearchParams({
      q: `'${TRANSFER_DRIVE_ID}' in parents and trashed=false`,
      fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
      orderBy: "modifiedTime desc",
      pageSize: "50",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });

    const res = await fetch(`${API}/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    // 이미 확인 완료된 항목 조회
    const confirmed = await prisma.transferConfirm.findMany({
      select: { driveFileId: true },
    });
    const confirmedIds = new Set(confirmed.map(c => c.driveFileId));

    const files = (data.files || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`,
      confirmed: confirmedIds.has(f.id),
    }));

    // 미확인 항목만 필터
    const pending = files.filter((f: any) => !f.confirmed);
    const completedCount = files.filter((f: any) => f.confirmed).length;

    return NextResponse.json({ pending, completedCount, total: files.length });
  } catch (e: any) {
    console.error("[이관자료] 조회 실패:", e);
    return NextResponse.json({ error: e.message || "조회 실패" }, { status: 500 });
  }
}

// POST: 이관완료 처리
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { driveFileId, fileName } = await req.json();
  if (!driveFileId) return NextResponse.json({ error: "driveFileId 필요" }, { status: 400 });

  await prisma.transferConfirm.upsert({
    where: { driveFileId },
    update: { confirmedBy: session.id, confirmedAt: new Date() },
    create: { driveFileId, fileName: fileName || "", confirmedBy: session.id },
  });

  return NextResponse.json({ ok: true });
}
