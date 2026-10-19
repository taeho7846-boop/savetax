import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { parseNoticeBillPdf, type ParsedBill } from "@/lib/vat-notice-bill-parse";
import { periodSlug, type NoticeBill } from "@/lib/vat-notice-bill";

export const runtime = "nodejs";

const digits = (s: unknown) => String(s ?? "").replace(/[^0-9]/g, "");

/**
 * 홈택스 '예정고지납부서 일괄다운로드' zip(또는 PDF 여러 개)을 올리면
 * 사업자번호로 거래처를 매칭해 PDF를 저장하고 납부기한·금액을 VatRecord.noticeBill 에 기록한다.
 * 같은 거래처에 납부서가 둘 이상이면(재발행) 납부기한이 늦은 것을 쓴다.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const period = formData.get("period") as string | null; // "2026-2-예정"
  const files = formData.getAll("file").filter((f): f is File => f instanceof File);
  if (!period) return NextResponse.json({ error: "신고 기수가 지정되지 않았습니다" }, { status: 400 });
  if (!period.endsWith("예정")) return NextResponse.json({ error: "예정고지 납부서는 예정 기간에서만 올릴 수 있습니다" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "파일이 없습니다" }, { status: 400 });

  // zip 풀기 / PDF 모으기
  const pdfs: { name: string; bytes: Uint8Array }[] = [];
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".zip")) {
      let zip: JSZip;
      try { zip = await JSZip.loadAsync(buf); } catch { return NextResponse.json({ error: `zip 파일을 읽을 수 없습니다: ${f.name}` }, { status: 400 }); }
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir || !name.toLowerCase().endsWith(".pdf")) continue;
        pdfs.push({ name: path.basename(name), bytes: new Uint8Array(await entry.async("uint8array")) });
      }
    } else if (lower.endsWith(".pdf")) {
      pdfs.push({ name: f.name, bytes: new Uint8Array(buf) });
    }
  }
  if (pdfs.length === 0) return NextResponse.json({ error: "zip 안에 PDF가 없습니다" }, { status: 400 });

  // 파싱 (사업자번호는 PDF 본문 우선, 실패 시 파일명의 (10자리))
  const parsedByBiz = new Map<string, { parsed: ParsedBill; name: string; bytes: Uint8Array }>();
  const unreadable: string[] = [];
  for (const p of pdfs) {
    let parsed: ParsedBill | null = null;
    try { parsed = await parseNoticeBillPdf(p.bytes); } catch { parsed = null; }
    if (!parsed) {
      const fromName = p.name.match(/\((\d{10})\)/)?.[1];
      if (!fromName) { unreadable.push(p.name); continue; }
      unreadable.push(p.name); // 금액·기한을 못 읽으면 저장하지 않음
      continue;
    }
    const prev = parsedByBiz.get(parsed.biz);
    // 재발행분: 납부기한이 늦은 쪽 (같으면 나중 파일)
    if (!prev || parsed.dueDate >= prev.parsed.dueDate) parsedByBiz.set(parsed.biz, { parsed, name: p.name, bytes: p.bytes });
  }

  // 매칭 대상 거래처 (부가세 페이지와 동일 범위: 관리자=본인+소속직원, 직원=본인담당)
  const isManager = ["accountant", "admin", "owner"].includes(session.role);
  let assignedFilter: Record<string, unknown> = { OR: [{ assignedUserId: session.id }, { subAssignedUserId: session.id }] };
  if (isManager) {
    const employees = await prisma.user.findMany({ where: { managerId: session.id, isActive: true }, select: { id: true } });
    assignedFilter = { assignedUserId: { in: [session.id, ...employees.map((e) => e.id)] } };
  }
  const dbClients = await prisma.client.findMany({
    where: { isDeleted: false, bizNumber: { not: null }, ...assignedFilter },
    select: { id: true, name: true, bizNumber: true },
  });
  const clientByBiz = new Map<string, { id: number; name: string }>();
  for (const c of dbClients) {
    const b = digits(c.bizNumber);
    if (b && !clientByBiz.has(b)) clientByBiz.set(b, { id: c.id, name: c.name });
  }

  const slug = periodSlug(period);
  const dir = path.join(process.cwd(), "public", "uploads", "vat-bills", slug);
  await mkdir(dir, { recursive: true });

  const uploadedAt = new Date().toISOString();
  const matched: { clientId: number; name: string; amount: number; dueDate: string }[] = [];
  const unmatched: { name: string; biz: string }[] = [];

  for (const [biz, { parsed, name, bytes }] of parsedByBiz) {
    const client = clientByBiz.get(biz);
    if (!client) { unmatched.push({ name, biz }); continue; }
    const fileName = `${client.id}.pdf`;
    await writeFile(path.join(dir, fileName), bytes);
    const bill: NoticeBill = {
      v: 1,
      url: `/api/uploads/vat-bills/${slug}/${fileName}`,
      amount: parsed.amount,
      dueDate: parsed.dueDate,
      srcName: name,
      uploadedAt,
    };
    const data = { noticeBill: JSON.stringify(bill), noticeTax: parsed.amount }; // 납부서 금액이 가장 정확하므로 고지세액도 맞춰 둠
    await prisma.vatRecord.upsert({
      where: { clientId_period: { clientId: client.id, period } },
      update: data,
      create: { clientId: client.id, period, ...data },
    });
    matched.push({ clientId: client.id, name: client.name, amount: parsed.amount, dueDate: parsed.dueDate });
  }

  revalidatePath("/vat");

  return NextResponse.json({
    ok: true,
    period,
    totalPdfs: pdfs.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    unmatched: unmatched.slice(0, 100),
    unreadableCount: unreadable.length,
    unreadable: unreadable.slice(0, 50),
  });
}
