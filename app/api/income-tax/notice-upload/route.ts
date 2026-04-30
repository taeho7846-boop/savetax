import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadFile, listFiles } from "@/lib/google-drive";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const formData = await req.formData();
  const clientIdRaw = formData.get("clientId");
  const file = formData.get("file");

  if (!clientIdRaw || !(file instanceof File)) {
    return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
  }
  const clientId = parseInt(String(clientIdRaw), 10);
  if (isNaN(clientId)) return NextResponse.json({ error: "INVALID_CLIENT_ID" }, { status: 400 });

  // 권한 체크: 종소세 페이지와 동일 범위
  const isManager = session.role === "accountant" || session.role === "admin" || session.role === "owner";
  let allowedUserIds: number[] = [session.id];
  if (isManager) {
    const employees = await prisma.user.findMany({
      where: { managerId: session.id, isActive: true },
      select: { id: true },
    });
    allowedUserIds = [session.id, ...employees.map((e) => e.id)];
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, isDeleted: false, assignedUserId: { in: allowedUserIds } },
    select: { id: true, name: true, driveFolderId: true },
  });
  if (!client) return NextResponse.json({ error: "FORBIDDEN_OR_NOT_FOUND" }, { status: 403 });
  if (!client.driveFolderId) return NextResponse.json({ error: "NO_DRIVE_FOLDER" }, { status: 400 });

  // 중복 체크
  try {
    const existing = await listFiles(client.driveFolderId);
    if (existing.find((f) => f.name === file.name)) {
      return NextResponse.json({ status: "skipped", reason: "이미 같은 파일명이 드라이브에 존재합니다" });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "DRIVE_LIST_FAILED", message: e?.message ?? "" }, { status: 500 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(client.driveFolderId, file.name, buffer, "application/pdf");
    return NextResponse.json({ status: "uploaded", fileId: result.fileId, fileUrl: result.fileUrl });
  } catch (e: any) {
    return NextResponse.json({ error: "UPLOAD_FAILED", message: e?.message ?? "" }, { status: 500 });
  }
}
