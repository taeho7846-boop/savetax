import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

  if (rows.length < 2) {
    return NextResponse.json({ error: "데이터가 없습니다 (헤더만 있음)" }, { status: 400 });
  }

  let created = 0;
  let errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue; // 빈 행 건너뛰기

    const name = String(row[0] ?? "").trim();
    if (!name) continue;

    try {
      const client = await prisma.client.create({
        data: {
          name,
          bizNumber: String(row[1] ?? "").trim() || null,
          ceoName: String(row[2] ?? "").trim() || null,
          residentNumber: String(row[3] ?? "").trim() || null,
          phone: String(row[4] ?? "").trim() || null,
          clientType: String(row[5] ?? "").trim() === "법인" ? "corporate" : "individual",
          taxationType: String(row[6] ?? "").trim() || null,
          hometaxId: String(row[7] ?? "").trim() || null,
          hometaxPw: String(row[8] ?? "").trim() || null,
          monthlyFee: row[9] ? parseInt(String(row[9])) || null : null,
          firstWithdrawalMonth: String(row[10] ?? "").trim() || null,
          bankName: String(row[11] ?? "").trim() || null,
          bankAccount: String(row[12] ?? "").trim() || null,
          address: String(row[13] ?? "").trim() || null,
          notes: String(row[14] ?? "").trim() || null,
          assignedUserId: session.id,
        },
      });

      await prisma.commissionProcess.create({ data: { clientId: client.id } });
      created++;
    } catch (e: any) {
      errors.push(`${i + 1}행 "${name}": ${e.message || "오류"}`);
    }
  }

  revalidatePath("/clients");
  revalidatePath("/commission");
  revalidatePath("/dashboard");

  return NextResponse.json({
    created,
    errors,
    message: `${created}건 등록 완료${errors.length > 0 ? `, ${errors.length}건 오류` : ""}`,
  });
}
