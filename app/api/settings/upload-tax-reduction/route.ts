import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

    const existing = await prisma.settings.findUnique({
      where: { userId: session.id },
      select: { taxReductionExcelPath: true },
    });
    if (existing?.taxReductionExcelPath) {
      const oldPath = path.join(process.cwd(), "public", existing.taxReductionExcelPath.replace(/^\/api\/uploads\//, "/uploads/"));
      try { await unlink(oldPath); } catch {}
    }

    const ext = (file.name.split(".").pop() ?? "xlsx").toLowerCase();
    const filename = `tax-reduction-${session.id}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "settings");
    await mkdir(uploadDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(path.join(uploadDir, filename), buffer);

    const filePath = `/api/uploads/settings/${filename}`;

    await prisma.settings.upsert({
      where: { userId: session.id },
      update: { taxReductionExcelPath: filePath },
      create: { userId: session.id, taxReductionExcelPath: filePath },
    });

    // 결과 시트 + 연계표 파싱 → DB 저장
    const wb = XLSX.read(buffer, { type: "buffer" });

    // 1) 연계표에서 업종코드 → 분류 정보 매핑
    const categoryMap = new Map<string, { categoryL: string; categoryM: string; categoryS: string; categoryD: string; categoryDD: string }>();
    const wsLink = wb.Sheets["연계표"];
    if (wsLink) {
      const linkData: any[] = XLSX.utils.sheet_to_json(wsLink, { header: 1, defval: "" });
      for (let i = 5; i < linkData.length; i++) {
        const row = linkData[i];
        const code = String(row[2] || "").trim();
        if (code && code.length >= 5) {
          categoryMap.set(code, {
            categoryL: String(row[4] || "").trim(),
            categoryM: String(row[6] || "").trim(),
            categoryS: String(row[8] || "").trim(),
            categoryD: String(row[10] || "").trim(),
            categoryDD: String(row[11] || "").trim(),
          });
        }
      }
    }

    // 2) 결과 시트에서 감면 O/X
    const ws = wb.Sheets["결과"];
    if (ws) {
      const data: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      await prisma.taxReductionCode.deleteMany({});
      const records: any[] = [];
      for (let i = 1; i < data.length; i++) {
        const code = String(data[i][0] || "").trim();
        const startup = String(data[i][1] || "X").trim();
        const sme = String(data[i][2] || "X").trim();
        if (code && code.length >= 5) {
          const cat = categoryMap.get(code);
          records.push({
            bizCode: code,
            startupReduction: startup,
            smeReduction: sme,
            categoryL: cat?.categoryL || null,
            categoryM: cat?.categoryM || null,
            categoryS: cat?.categoryS || null,
            categoryD: cat?.categoryD || null,
            categoryDD: cat?.categoryDD || null,
          });
        }
      }
      for (let i = 0; i < records.length; i += 100) {
        await prisma.taxReductionCode.createMany({ data: records.slice(i, i + 100), skipDuplicates: true });
      }
      console.log(`[감면코드] ${records.length}건 DB 저장 (분류 정보 포함)`);
    }

    revalidatePath("/settings");
    return NextResponse.json({ path: filePath });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

    const existing = await prisma.settings.findUnique({
      where: { userId: session.id },
      select: { taxReductionExcelPath: true },
    });
    if (existing?.taxReductionExcelPath) {
      const oldPath = path.join(process.cwd(), "public", existing.taxReductionExcelPath.replace(/^\/api\/uploads\//, "/uploads/"));
      try { await unlink(oldPath); } catch {}
    }

    await prisma.settings.upsert({
      where: { userId: session.id },
      update: { taxReductionExcelPath: null },
      create: { userId: session.id },
    });

    revalidatePath("/settings");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
