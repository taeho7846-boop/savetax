#!/usr/bin/env node
//
// savetax DB 백업 파일을 구글드라이브로 업로드 (서버 밖 보관)
// - 앱과 동일한 구글 서비스 계정(google-credentials.json / GOOGLE_SERVICE_ACCOUNT_KEY)을 재활용
// - /root/backups/savetax-db 의 가장 최신 백업을 구글드라이브 'DB자동백업' 폴더에 업로드
// - 드라이브에는 최근 30개만 보관 (초과분 삭제)
//
// 수동 실행:
//   cd /root/savetax && node scripts/upload-backup-to-drive.mjs
//
// 크론 등록 (매일 새벽 3시 10분 — 백업이 끝난 뒤):
//   10 3 * * * bash -lc 'cd /root/savetax && node scripts/upload-backup-to-drive.mjs' >> /root/backups/savetax-db/drive-upload.log 2>&1
//
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import GoogleAuthLib from "google-auth-library";
const { GoogleAuth } = GoogleAuthLib;

const APP_DIR = "/root/savetax";
const BACKUP_DIR = "/root/backups/savetax-db";
const SUBFOLDER = "DB자동백업";
const KEEP = 30; // 드라이브 보관 개수

// --- .env 파싱 (cron 환경엔 env가 없어서 직접 읽음) ---
function loadEnv() {
  const out = {};
  try {
    const txt = readFileSync(join(APP_DIR, ".env"), "utf-8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* 무시 */ }
  return out;
}
const env = loadEnv();
const FOLDER_ID = env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || "";
if (!FOLDER_ID) { console.error("ERROR: GOOGLE_DRIVE_FOLDER_ID 를 찾을 수 없습니다 (.env 확인)"); process.exit(1); }

// --- 서비스 계정 자격증명 (앱과 동일 우선순위) ---
function loadCredentials() {
  const keyPath = join(APP_DIR, "google-credentials.json");
  if (existsSync(keyPath)) return JSON.parse(readFileSync(keyPath, "utf-8"));
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY) return JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  throw new Error("구글 서비스 계정 자격증명을 찾을 수 없습니다 (google-credentials.json / GOOGLE_SERVICE_ACCOUNT_KEY)");
}

const auth = new GoogleAuth({ credentials: loadCredentials(), scopes: ["https://www.googleapis.com/auth/drive"] });
const client = await auth.getClient();
async function token() { const t = await client.getAccessToken(); return t.token; }

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

async function driveGet(path, params) {
  const qs = new URLSearchParams({ ...params, supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  const res = await fetch(`${API}${path}?${qs}`, { headers: { Authorization: `Bearer ${await token()}` } });
  if (!res.ok) throw new Error(`Drive GET ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

// 'DB자동백업' 하위 폴더 find-or-create
async function ensureFolder() {
  const q = `name='${SUBFOLDER}' and '${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveGet("/files", { q, fields: "files(id,name)" });
  if (found.files?.length) return found.files[0].id;
  const res = await fetch(`${API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: SUBFOLDER, mimeType: "application/vnd.google-apps.folder", parents: [FOLDER_ID] }),
  });
  if (!res.ok) throw new Error(`폴더 생성 실패: ${res.status} ${await res.text()}`);
  return (await res.json()).id;
}

function latestBackup() {
  const files = readdirSync(BACKUP_DIR).filter((f) => /^savetax_.*\.sql\.gz$/.test(f));
  if (!files.length) throw new Error(`백업 파일이 없습니다 (${BACKUP_DIR})`);
  files.sort();
  return files[files.length - 1];
}

async function upload(folderId, fileName) {
  const buf = readFileSync(join(BACKUP_DIR, fileName));
  const boundary = "savetaxbackup" + Date.now();
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(head, "utf-8"), buf, Buffer.from(tail, "utf-8")]);
  const res = await fetch(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`업로드 실패: ${res.status} ${await res.text()}`);
  return res.json();
}

// 보관 개수 초과분 삭제 (오래된 것부터)
async function rotate(folderId) {
  const list = await driveGet("/files", {
    q: `'${folderId}' in parents and name contains 'savetax_' and trashed=false`,
    fields: "files(id,name)",
    orderBy: "name desc",
    pageSize: "1000",
  });
  const old = (list.files || []).slice(KEEP);
  for (const f of old) {
    await fetch(`${API}/files/${f.id}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await token()}` },
    });
  }
  return old.length;
}

try {
  const folderId = await ensureFolder();
  const fileName = latestBackup();
  const r = await upload(folderId, fileName);
  const deleted = await rotate(folderId);
  console.log(`[${new Date().toISOString()}] OK: 구글드라이브 업로드 → ${r.name} (id ${r.id})${deleted ? `, 오래된 ${deleted}개 삭제` : ""}`);
} catch (e) {
  console.error(`[${new Date().toISOString()}] ERROR: ${e.message}`);
  process.exit(1);
}
