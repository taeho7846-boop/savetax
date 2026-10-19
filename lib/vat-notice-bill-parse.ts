import "@/lib/polyfills-node"; // Promise.withResolvers (Node 20 호환) — pdfjs보다 먼저
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * 홈택스 '부가가치세 예정고지납부서' PDF 1장에서 사업자번호·납부기한·납부금액 추출.
 * 텍스트가 글자 단위로 쪼개져 나오므로 공백을 전부 제거한 문자열에서 패턴을 찾는다.
 */
export type ParsedBill = {
  biz: string;        // 10자리 숫자
  dueDate: string;    // YYYY-MM-DD
  amount: number;     // 원
  issuedAt: string | null; // YYYY-MM-DD (납부서발행일)
};

export async function parseNoticeBillPdf(bytes: Uint8Array): Promise<ParsedBill | null> {
  // pdfjs는 넘긴 버퍼를 워커로 이전(detach)해 버리므로 복사본을 넘긴다 — 호출자가 같은 bytes로 파일을 저장할 수 있게
  const doc = await getDocument({ data: bytes.slice(), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    let text = "";
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      text += it.str;
      if (it.hasEOL) text += "\n";
    }
    const compact = text.replace(/\s+/g, "");
    const biz = compact.match(/(\d{3})-(\d{2})-(\d{5})/);
    const due = compact.match(/납부기한(\d{4})년(\d{1,2})월(\d{1,2})일/);
    const issued = compact.match(/발행일:?(\d{4})년(\d{1,2})월(\d{1,2})일/);
    const amtStr = compact.match(/(?:^|[^회])계([\d,]{3,})/)?.[1] ?? compact.match(/부가가치세([\d,]{3,})/)?.[1];
    if (!biz || !due || !amtStr) return null;
    const ymd = (m: RegExpMatchArray) => `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const amount = parseInt(amtStr.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(amount)) return null;
    return { biz: biz[1] + biz[2] + biz[3], dueDate: ymd(due), amount, issuedAt: issued ? ymd(issued) : null };
  } finally {
    await doc.destroy();
  }
}
