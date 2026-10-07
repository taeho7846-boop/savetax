// 로컬 도우미(launcher) 원본을 사이트 다운로드 위치로 복사한다.
//
//   원본:   scripts/launcher/{launcher.ps1,install.ps1,install.bat}
//   배포본: public/launcher/  (설정 > 내 PC 연동의 다운로드 링크가 가리키는 곳)
//
// public/launcher/ 는 git에 올리지 않고 `npm run dev` / `npm run build` 직전에
// (package.json의 predev·prebuild) 매번 새로 만든다. 원본이 하나뿐이라 사이트가
// 옛 버전을 내려주는 일이 없다.
//
// 바이트 그대로 복사한다. launcher.ps1은 UTF-8 BOM + CRLF여야 Windows PowerShell 5.1이
// 한글 문자열을 올바로 읽으므로, 텍스트로 읽어서 다시 쓰지 않는다.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = ["launcher.ps1", "install.ps1", "install.bat"];

const srcDir = dirname(fileURLToPath(import.meta.url));
const destDir = join(srcDir, "..", "..", "public", "launcher");

mkdirSync(destDir, { recursive: true });

for (const name of FILES) {
  const src = join(srcDir, name);
  const dest = join(destDir, name);
  copyFileSync(src, dest);
  if (!readFileSync(src).equals(readFileSync(dest))) {
    throw new Error(`launcher 복사 검증 실패: ${name}`);
  }
}

// BOM이 빠지면 설치한 PC에서 한글 창 제목('폴더 선택' 등)을 못 찾아 조용히 실패한다.
const head = readFileSync(join(destDir, "launcher.ps1")).subarray(0, 3);
if (!head.equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
  throw new Error("launcher.ps1에 UTF-8 BOM이 없습니다. BOM 포함 UTF-8로 다시 저장하세요.");
}

console.log(`[launcher] ${FILES.length}개 파일을 public/launcher/ 로 복사했습니다.`);
