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

// 간단한 유사도 점수 (0~100)
function similarity(a: string, b: string): number {
  const al = a.toLowerCase().replace(/\s/g, "");
  const bl = b.toLowerCase().replace(/\s/g, "");

  // 정확히 포함되면 높은 점수
  if (al.includes(bl) || bl.includes(al)) {
    const longer = Math.max(al.length, bl.length);
    const shorter = Math.min(al.length, bl.length);
    return Math.round((shorter / longer) * 100);
  }

  // Levenshtein 기반 유사도
  const m = al.length;
  const n = bl.length;
  if (m === 0 || n === 0) return 0;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = al[i - 1] === bl[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  const maxLen = Math.max(m, n);
  return Math.round(((maxLen - dp[m][n]) / maxLen) * 100);
}

// 파일명에서 거래처명 추출 시도 (언더스코어, 하이픈 등으로 분리)
function extractCandidates(fileName: string): string[] {
  const name = fileName.replace(/\.(xlsx?|pdf|zip|hwp|docx?|csv|txt)$/i, "");
  const parts = name.split(/[_\-\s]+/);
  // 파일명 전체 + 분리된 부분들
  return [name, ...parts].filter((p) => p.length >= 2);
}

// GET: 파일명 기반 거래처 추천
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fileName = req.nextUrl.searchParams.get("fileName") ?? "";
  const searchQuery = req.nextUrl.searchParams.get("q") ?? "";

  // 로그인한 사용자에게 배정된 거래처만 (관리자는 부하직원 포함)
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let assignedFilter: any = { assignedUserId: session.id };
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    const userIds = [session.id, ...employees.map((e) => e.id)];
    assignedFilter = { assignedUserId: { in: userIds } };
  }

  const clients = await prisma.client.findMany({
    where: { isDeleted: false, driveFolderId: { not: null }, ...assignedFilter },
    select: { id: true, name: true, bizNumber: true, driveFolderId: true },
  });

  // 직접 검색 모드
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    const results = clients
      .filter((c) => c.name.toLowerCase().includes(q) || (c.bizNumber && c.bizNumber.includes(q)))
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, score: 100 }));
    return NextResponse.json({ suggestions: results });
  }

  // 파일명 기반 추천
  if (!fileName) return NextResponse.json({ suggestions: [] });

  const candidates = extractCandidates(fileName);
  const scored = clients.map((c) => {
    let bestScore = 0;

    // 거래처명 포함 여부 (정확한 매칭)
    if (fileName.includes(c.name)) {
      bestScore = Math.max(bestScore, 95);
    }

    // 사업자번호 매칭
    if (c.bizNumber && fileName.includes(c.bizNumber.replace(/-/g, ""))) {
      bestScore = Math.max(bestScore, 90);
    }

    // 각 후보 문자열과 유사도 비교
    for (const cand of candidates) {
      const score = similarity(cand, c.name);
      bestScore = Math.max(bestScore, score);
    }

    return { id: c.id, name: c.name, score: bestScore };
  });

  // 60% 이상만, 상위 5개
  const suggestions = scored
    .filter((s) => s.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return NextResponse.json({ suggestions });
}

const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// 폴더 생성
async function createDriveFolder(token: string, name: string, parentId: string): Promise<string> {
  const res = await fetch(`${API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const data = await res.json();
  return data.id;
}

// 단일 파일 다운로드 → 업로드
async function copyFile(token: string, fileId: string, destFolderId: string): Promise<string | null> {
  // 파일 정보
  const infoRes = await fetch(`${API}/files/${fileId}?fields=mimeType,name&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const info = await infoRes.json();
  const mimeType = info.mimeType || "application/octet-stream";
  const name = info.name || "file";

  // Google Docs 계열은 스킵 (폴더 안의 문서는 드물고, export가 복잡)
  if (mimeType === "application/vnd.google-apps.folder") return null;

  let fileBuffer: ArrayBuffer;
  let uploadMime = mimeType;
  let uploadName = name;

  if (mimeType.startsWith("application/vnd.google-apps.")) {
    // Google Docs → PDF export
    const exportMime = "application/pdf";
    const exportRes = await fetch(`${API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!exportRes.ok) return null;
    fileBuffer = await exportRes.arrayBuffer();
    uploadMime = exportMime;
    uploadName = `${name}.pdf`;
  } else {
    const dlRes = await fetch(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!dlRes.ok) return null;
    fileBuffer = await dlRes.arrayBuffer();
  }

  const metadata = JSON.stringify({ name: uploadName, parents: [destFolderId] });
  const boundary = "savetax_boundary_" + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${uploadMime}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
    Buffer.from(fileBuffer).toString("base64") +
    `\r\n--${boundary}--`;

  const uploadRes = await fetch(`${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await uploadRes.json();
  return data.id || null;
}

// 폴더 재귀 복사 (폴더 생성 + 내부 파일 다운로드→업로드)
async function copyFolderRecursive(token: string, sourceFolderId: string, destFolderId: string, folderName: string): Promise<{ folderId: string; fileCount: number }> {
  // 대상에 폴더 생성
  const newFolderId = await createDriveFolder(token, folderName, destFolderId);
  let fileCount = 0;

  // 원본 폴더 내용 조회
  const listParams = new URLSearchParams({
    q: `'${sourceFolderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType)",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
    pageSize: "100",
  });
  const listRes = await fetch(`${API}/files?${listParams}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listData = await listRes.json();
  const items = listData.files || [];

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      // 하위 폴더 재귀 처리
      const sub = await copyFolderRecursive(token, item.id, newFolderId, item.name);
      fileCount += sub.fileCount;
    } else {
      // 파일 복사
      const copied = await copyFile(token, item.id, newFolderId);
      if (copied) fileCount++;
    }
  }

  return { folderId: newFolderId, fileCount };
}

// POST: 거래처 4.이관자료 폴더로 복사 (원본 유지)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { driveFileId, fileName, clientId } = await req.json();
  if (!driveFileId || !clientId) {
    return NextResponse.json({ error: "driveFileId와 clientId가 필요합니다" }, { status: 400 });
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, driveFolderId: true },
    });

    if (!client?.driveFolderId) {
      return NextResponse.json({ error: `거래처의 구글드라이브 폴더가 없습니다` }, { status: 404 });
    }

    const token = await getToken();

    // "4. 이관자료" 하위폴더 찾기
    const folderParams = new URLSearchParams({
      q: `'${client.driveFolderId}' in parents and name contains '이관자료' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });

    const folderRes = await fetch(`${API}/files?${folderParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const folderData = await folderRes.json();
    const transferFolderId = folderData.files?.[0]?.id;

    if (!transferFolderId) {
      return NextResponse.json({
        error: `"${client.name}"의 "4. 이관자료" 폴더를 찾을 수 없습니다`,
      }, { status: 404 });
    }

    // 파일/폴더 정보 확인
    const fileInfoRes = await fetch(`${API}/files/${driveFileId}?fields=mimeType,name&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const fileInfo = await fileInfoRes.json();
    const isFolder = fileInfo.mimeType === "application/vnd.google-apps.folder";

    let copiedId: string | null = null;
    let message = "";

    if (isFolder) {
      // 폴더: 안의 파일들만 꺼내서 대상 폴더에 직접 업로드
      const listParams = new URLSearchParams({
        q: `'${driveFileId}' in parents and trashed=false`,
        fields: "files(id,name,mimeType)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
        pageSize: "100",
      });
      const listRes = await fetch(`${API}/files?${listParams}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();
      const items = listData.files || [];

      let fileCount = 0;
      for (const item of items) {
        if (item.mimeType === "application/vnd.google-apps.folder") {
          // 하위 폴더는 재귀 복사
          const sub = await copyFolderRecursive(token, item.id, transferFolderId, item.name);
          fileCount += sub.fileCount;
        } else {
          const copied = await copyFile(token, item.id, transferFolderId);
          if (copied) fileCount++;
        }
      }
      copiedId = transferFolderId;
      message = `"${client.name}/4. 이관자료"에 ${fileCount}개 파일 복사 완료`;
    } else {
      // 단일 파일
      copiedId = await copyFile(token, driveFileId, transferFolderId);
      if (!copiedId) return NextResponse.json({ error: "파일 복사 실패" }, { status: 500 });
      message = `"${client.name}/4. 이관자료" 폴더로 복사 완료`;
    }

    return NextResponse.json({
      ok: true,
      copiedFileId: copiedId,
      clientName: client.name,
      message,
    });
  } catch (e: any) {
    console.error("[이관자료 복사] 실패:", e);
    return NextResponse.json({ error: e.message || "복사 실패" }, { status: 500 });
  }
}
