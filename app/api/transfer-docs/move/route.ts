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

  const clients = await prisma.client.findMany({
    where: { isDeleted: false, driveFolderId: { not: null } },
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

    // 파일 복사 (원본 유지)
    const copyRes = await fetch(`${API}/files/${driveFileId}/copy?supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fileName || undefined,
        parents: [transferFolderId],
      }),
    });
    const copyData = await copyRes.json();

    if (copyData.error) {
      return NextResponse.json({ error: copyData.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      copiedFileId: copyData.id,
      clientName: client.name,
      message: `"${client.name}/4. 이관자료" 폴더로 복사 완료`,
    });
  } catch (e: any) {
    console.error("[이관자료 복사] 실패:", e);
    return NextResponse.json({ error: e.message || "복사 실패" }, { status: 500 });
  }
}
