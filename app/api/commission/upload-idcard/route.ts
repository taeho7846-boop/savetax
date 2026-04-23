import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const commissionIdRaw = formData.get("commissionId");
    const commissionId = parseInt(commissionIdRaw as string);

    console.log("[idcard] file:", file?.name, "size:", file?.size, "commissionId:", commissionId);

    if (!file || isNaN(commissionId)) {
      return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
    }

    // Delete old file if exists
    const existing = await prisma.commissionProcess.findUnique({
      where: { id: commissionId },
      select: { idCardPath: true },
    });
    if (existing?.idCardPath) {
      const oldPath = path.join(process.cwd(), "public", existing.idCardPath);
      try {
        await unlink(oldPath);
      } catch {}
    }

    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const filename = `${commissionId}_${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "idcards");

    console.log("[idcard] uploadDir:", uploadDir);
    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));

    const filePath = `/api/uploads/idcards/${filename}`;

    await prisma.commissionProcess.update({
      where: { id: commissionId },
      data: { idCardPath: filePath },
    });

    // 구글 드라이브 "0. 기본정보" 폴더에 업로드
    try {
      const commission = await prisma.commissionProcess.findUnique({
        where: { id: commissionId },
        select: { client: { select: { driveFolderId: true } } },
      });
      if (commission?.client?.driveFolderId) {
        const { uploadFile, createFolder } = await import("@/lib/google-drive");
        const basicFolderId = await createFolder("0. 기본정보", commission.client.driveFolderId);
        await uploadFile(
          basicFolderId,
          `대표자신분증_${file.name}`,
          Buffer.from(bytes),
          file.type || "application/octet-stream"
        );
        console.log("[idcard] 구글 드라이브 0.기본정보 업로드 완료");
      }
    } catch (e) {
      console.error("[idcard] 구글 드라이브 업로드 실패:", e);
    }

    revalidatePath("/commission");
    console.log("[idcard] success:", filePath);
    return NextResponse.json({ path: filePath });
  } catch (err) {
    console.error("[idcard] error:", err);
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
