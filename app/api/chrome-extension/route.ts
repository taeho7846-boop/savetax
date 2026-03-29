import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import path from "path";
import { readdir, readFile, stat } from "fs/promises";
import archiver from "archiver";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const extDir = path.join(process.cwd(), "chrome-extension");

  try {
    const files = await readdir(extDir);
    const zipData = await new Promise<Buffer>(async (resolve, reject) => {
      const chunks: Buffer[] = [];
      const archive = archiver("zip");

      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", () => resolve(Buffer.concat(chunks)));
      archive.on("error", reject);

      for (const file of files) {
        const filePath = path.join(extDir, file);
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          const content = await readFile(filePath);
          archive.append(content, { name: file });
        }
      }

      await archive.finalize();
    });

    return new NextResponse(zipData, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="savetax-chrome-extension.zip"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
