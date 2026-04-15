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

// "4. 이관자료" 하위폴더 찾기
async function findTransferFolder(token: string, clientDriveFolderId: string): Promise<string | null> {
  const params = new URLSearchParams({
    q: `'${clientDriveFolderId}' in parents and name contains '이관자료' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
  });

  const res = await fetch(`${API}/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

// 파일/폴더를 다른 폴더로 이동
async function moveFile(token: string, fileId: string, fromFolderId: string, toFolderId: string) {
  const res = await fetch(`${API}/files/${fileId}?addParents=${toFolderId}&removeParents=${fromFolderId}&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { driveFileId, fileName } = await req.json();
  if (!driveFileId || !fileName) {
    return NextResponse.json({ error: "driveFileId와 fileName이 필요합니다" }, { status: 400 });
  }

  try {
    // 1. 파일명에서 거래처명 매칭 시도
    const clients = await prisma.client.findMany({
      where: { isDeleted: false, driveFolderId: { not: null } },
      select: { id: true, name: true, driveFolderId: true },
    });

    // 파일명에 거래처명이 포함되어 있는지 확인
    const matched = clients.filter((c) => fileName.includes(c.name));

    if (matched.length === 0) {
      return NextResponse.json({
        error: "매칭 실패",
        message: `"${fileName}"에서 거래처명을 찾을 수 없습니다. 파일명에 거래처명이 포함되어 있는지 확인해주세요.`,
        clients: clients.map((c) => c.name).slice(0, 10),
      }, { status: 404 });
    }

    // 가장 긴 이름 매칭 (예: "ABC상사" vs "ABC" → "ABC상사" 우선)
    const client = matched.sort((a, b) => b.name.length - a.name.length)[0];

    if (!client.driveFolderId) {
      return NextResponse.json({
        error: "드라이브 없음",
        message: `"${client.name}"의 구글드라이브 폴더가 설정되지 않았습니다.`,
      }, { status: 404 });
    }

    // 2. "4. 이관자료" 폴더 찾기
    const token = await getToken();
    const transferFolderId = await findTransferFolder(token, client.driveFolderId);

    if (!transferFolderId) {
      return NextResponse.json({
        error: "폴더 없음",
        message: `"${client.name}"의 "4. 이관자료" 폴더를 찾을 수 없습니다.`,
      }, { status: 404 });
    }

    // 3. 파일 현재 부모 폴더 확인
    const fileInfo = await fetch(`${API}/files/${driveFileId}?fields=parents&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fileData = await fileInfo.json();
    const currentParent = fileData.parents?.[0] || "";

    // 4. 파일 이동
    await moveFile(token, driveFileId, currentParent, transferFolderId);

    return NextResponse.json({
      ok: true,
      clientName: client.name,
      message: `"${fileName}" → "${client.name}/4. 이관자료" 폴더로 이동 완료`,
    });
  } catch (e: any) {
    console.error("[이관자료 이동] 실패:", e);
    return NextResponse.json({ error: e.message || "이동 실패" }, { status: 500 });
  }
}
