import { GoogleAuth } from "google-auth-library";

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

let authClient: GoogleAuth | null = null;

function getAuth(): GoogleAuth {
  if (!authClient) {
    let credentials: any = {};
    // 파일에서 읽기 시도, 없으면 환경변수에서
    try {
      const fs = require("fs");
      const path = require("path");
      const keyPath = path.join(process.cwd(), "google-credentials.json");
      if (fs.existsSync(keyPath)) {
        credentials = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
      } else {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
      }
    } catch {
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
  const token = await client.getAccessToken();
  return token.token || "";
}

async function driveGet(path: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken();
  // 공유 드라이브 지원
  const allParams = { ...params, supportsAllDrives: "true", includeItemsFromAllDrives: "true" };
  const qs = "?" + new URLSearchParams(allParams).toString();
  const res = await fetch(`${API}${path}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function drivePost(path: string, body: any, params?: Record<string, string>): Promise<any> {
  const token = await getToken();
  const allParams = { ...params, supportsAllDrives: "true" };
  const qs = "?" + new URLSearchParams(allParams).toString();
  const res = await fetch(`${API}${path}${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 폴더 생성 (이미 있으면 기존 폴더 ID 반환)
export async function createFolder(name: string, parentId?: string): Promise<string> {
  const parent = parentId || ROOT_FOLDER_ID;
  const safeName = name.replace(/'/g, "\\'");

  // 기존 폴더 확인
  const existing = await driveGet("/files", {
    q: `name='${safeName}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    corpora: "allDrives",
  });

  if (existing.files && existing.files.length > 0) {
    return existing.files[0].id;
  }

  // 새 폴더 생성
  if (!parent) {
    console.error("[Google Drive] ROOT_FOLDER_ID가 비어있습니다!");
    throw new Error("GOOGLE_DRIVE_FOLDER_ID not set");
  }
  console.log(`[Google Drive] 폴더 생성: "${name}" in parent: ${parent}`);
  const folder = await drivePost("/files", {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parent],
  });

  if (folder.error) {
    console.error(`[Google Drive] 폴더 생성 에러:`, folder.error.message);
    throw new Error(folder.error.message);
  }
  console.log(`[Google Drive] 폴더 생성 완료: ${folder.id}`);
  return folder.id;
}

// 세무사 폴더 → 거래처 폴더 생성 + 세부폴더
export async function createClientFolder(
  managerName: string,
  clientName: string,
  clientType: string = "individual"
): Promise<{ folderId: string; folderUrl: string }> {
  const managerFolderId = await createFolder(managerName);
  const clientFolderId = await createFolder(clientName, managerFolderId);

  // 세부폴더 자동 생성
  const subFolders = [
    "0. 기본정보",
    "1. 원천세",
    "2. 부가가치세",
    clientType === "corporate" ? "3. 법인세" : "3. 종합소득세",
    "4. 이관자료",
    "5. 위멤버스",
  ];
  await Promise.all(subFolders.map((name) => createFolder(name, clientFolderId)));

  // 위멤버스 하위폴더 생성
  const wimembersFolderId = await createFolder("5. 위멤버스", clientFolderId);
  await Promise.all([
    createFolder("근로소득", wimembersFolderId),
    createFolder("사업소득", wimembersFolderId),
    createFolder("일용직", wimembersFolderId),
  ]);

  return {
    folderId: clientFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${clientFolderId}`,
  };
}

// 파일 업로드 (공유 드라이브 지원)
export async function uploadFile(
  folderId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ fileId: string; fileUrl: string }> {
  const token = await getToken();

  const boundary = "----savetax_boundary";
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  const file = await res.json();
  if (file.error) {
    console.error(`[Google Drive] 업로드 에러:`, file.error.message);
    throw new Error(file.error.message);
  }
  console.log(`[Google Drive] 파일 업로드 성공: ${file.id}`);

  return {
    fileId: file.id,
    fileUrl: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
  };
}

// 폴더 내 파일 목록
export async function listFiles(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink: string }>> {
  const data = await driveGet("/files", {
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: "50",
    corpora: "allDrives",
  });

  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink || "",
  }));
}

export { ROOT_FOLDER_ID };
