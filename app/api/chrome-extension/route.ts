import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import path from "path";
import archiver from "archiver";
import { PassThrough } from "stream";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const extDir = path.join(process.cwd(), "chrome-extension");

  try {
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();

    passthrough.on("data", (chunk: Buffer) => chunks.push(chunk));

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(passthrough);
    archive.directory(extDir, "chrome-extension");

    await archive.finalize();
    await new Promise((resolve) => passthrough.on("end", resolve));

    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="savetax-chrome-extension.zip"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
