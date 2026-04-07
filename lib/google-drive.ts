import { google } from "googleapis";
import { Readable } from "stream";

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "{}");
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

// 폴더 생성 (이미 있으면 기존 폴더 ID 반환)
export async function createFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDrive();
  const parent = parentId || ROOT_FOLDER_ID;

  // 기존 폴더 확인
  const existing = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  // 새 폴더 생성
  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parent],
    },
    fields: "id",
  });

  return folder.data.id!;
}

// 세무사 폴더 → 거래처 폴더 생성
export async function createClientFolder(managerName: string, clientName: string): Promise<{ folderId: string; folderUrl: string }> {
  const managerFolderId = await createFolder(managerName);
  const clientFolderId = await createFolder(clientName, managerFolderId);
  return {
    folderId: clientFolderId,
    folderUrl: `https://drive.google.com/drive/folders/${clientFolderId}`,
  };
}

// 파일 업로드
export async function uploadFile(
  folderId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ fileId: string; fileUrl: string }> {
  const drive = getDrive();

  const file = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: "id, webViewLink",
  });

  return {
    fileId: file.data.id!,
    fileUrl: file.data.webViewLink || `https://drive.google.com/file/d/${file.data.id}/view`,
  };
}

// 폴더 내 파일 목록
export async function listFiles(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime: string; webViewLink: string }>> {
  const drive = getDrive();

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id, name, mimeType, modifiedTime, webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });

  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    modifiedTime: f.modifiedTime!,
    webViewLink: f.webViewLink || "",
  }));
}

// 폴더 존재 여부 확인
export async function folderExists(folderId: string): Promise<boolean> {
  try {
    const drive = getDrive();
    await drive.files.get({ fileId: folderId, fields: "id" });
    return true;
  } catch {
    return false;
  }
}

export { ROOT_FOLDER_ID };
