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

    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
    }

    // Delete old file if exists
    const existing = await prisma.settings.findUnique({
      where: { id: 1 },
      select: { agentIdCardPath: true },
    });
    if (existing?.agentIdCardPath) {
      const oldPath = path.join(process.cwd(), "public", existing.agentIdCardPath);
      try { await unlink(oldPath); } catch {}
    }

    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const filename = `agent-idcard.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "settings");
    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(path.join(uploadDir, filename), Buffer.from(bytes));

    const filePath = `/uploads/settings/${filename}`;

    await prisma.settings.upsert({
      where: { id: 1 },
      update: { agentIdCardPath: filePath },
      create: { id: 1, agentIdCardPath: filePath },
    });

    revalidatePath("/settings");
    return NextResponse.json({ path: filePath });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
    }

    const existing = await prisma.settings.findUnique({
      where: { id: 1 },
      select: { agentIdCardPath: true },
    });
    if (existing?.agentIdCardPath) {
      const oldPath = path.join(process.cwd(), "public", existing.agentIdCardPath);
      try { await unlink(oldPath); } catch {}
    }

    await prisma.settings.upsert({
      where: { id: 1 },
      update: { agentIdCardPath: null },
      create: { id: 1 },
    });

    revalidatePath("/settings");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
