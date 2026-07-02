"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientInModal, getCreateClientData } from "@/app/actions/clients";
import { EditClientForm } from "@/app/(main)/clients/[id]/edit/EditClientForm";

type CreateData = Awaited<ReturnType<typeof getCreateClientData>>;

const emptyClient = {
  name: "",
  bizNumber: null as string | null,
  ceoName: null as string | null,
  residentNumber: null as string | null,
  phone: null as string | null,
  address: null as string | null,
  clientType: "individual",
  taxationType: null as string | null,
  hometaxId: null as string | null,
  hometaxPw: null as string | null,
  monthlyFee: null as number | null,
  freeMonths: null as number | null,
  firstWithdrawalMonth: null as string | null,
  bankName: null as string | null,
  bankAccount: null as string | null,
  openDate: null as string | null,
  contractDate: null as string | null,
  notes: null as string | null,
  accountingProgram: "위하고",
  halfYearTax: false,
  affiliation: null as string | null,
  myboxLink: null as string | null,
  assignedUserId: null as number | null,
};

// 신규 거래처 양식("● 라벨 : 값") → 폼 필드 자동 파싱
// 운영 필드(인건비/원천세유형/과세유형)는 손대지 않고, 합의된 필수 항목만 채운다.
function parseOnboarding(text: string): { values: Partial<typeof emptyClient>; count: number } {
  const pairs: Record<string, string> = {};
  let curKey: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue; // 빈 줄은 건너뛰되 현재 항목 유지 (특이사항 등 여러 줄 값 보존)
    if (line.startsWith("■")) { curKey = null; continue; } // 섹션이 바뀌면 항목 종료
    const m = line.match(/^[●•▶·]\s*(.+?)\s*[:：]\s*(.*)$/);
    if (m) {
      curKey = m[1].replace(/\s+/g, "");
      pairs[curKey] = m[2].trim();
    } else if (curKey) {
      // 여러 줄 값(특별요청사항 등)은 다음 라벨 전까지 이어붙임
      pairs[curKey] += (pairs[curKey] ? "\n" : "") + line;
    }
  }
  const pick = (...names: string[]): string => {
    for (const n of names) {
      const key = n.replace(/\s+/g, "");
      if (pairs[key]) return pairs[key];
      const found = Object.keys(pairs).find((k) => k.includes(key));
      if (found && pairs[found]) return pairs[found];
    }
    return "";
  };

  const out: Partial<typeof emptyClient> = {};

  const name = pick("거래처명", "상호");
  if (name) out.name = name;

  const ceo = pick("대표자명", "계약자명");
  if (ceo) out.ceoName = ceo;

  const phone = pick("대표자연락처", "연락처");
  if (phone) out.phone = phone;

  const addr = pick("대표자자택주소", "자택주소", "사업장주소", "주소");
  if (addr) out.address = addr;

  // 사업자번호: 라벨 우선, 없으면 본문 어디든 000-00-00000 패턴 탐색
  let biz = pick("사업자번호", "사업자등록번호");
  if (!biz) {
    const bm = text.match(/\d{3}-\d{2}-\d{5}/);
    if (bm) biz = bm[0];
  }
  if (biz) out.bizNumber = biz;

  // 계약일자: ISO(2026-07-01T…) 또는 YYYY-MM-DD
  const contract = pick("계약일자");
  if (contract) {
    const cm = contract.match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
    if (cm) out.contractDate = `${cm[1]}-${cm[2]}-${cm[3]}`;
  }

  // 개업시기: 20101118 → 2010-11-18
  const open = pick("개업시기", "개업일");
  if (open) {
    const d = open.replace(/[^0-9]/g, "");
    if (d.length === 8) out.openDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }

  // 무료프로모션: "2개월" → 2
  const free = pick("무료프로모션", "무료기장", "무료");
  if (free) {
    const n = parseInt(free.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) out.freeMonths = n;
  }

  // 월 기장료(VAT 제외) → ×1.1 반올림 (VAT 포함 금액으로 저장)
  const fee = pick("월기장료", "기장료");
  if (fee) {
    const n = parseInt(fee.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n) && n > 0) out.monthlyFee = Math.round(n * 1.1);
  }

  // 출금연월: 26-09 → 2026-09
  const wd = pick("출금연월", "최초출금월", "출금월");
  if (wd) {
    const wm = wd.match(/(\d{2,4})[-.](\d{1,2})/);
    if (wm) {
      const y = wm[1].length === 2 ? `20${wm[1]}` : wm[1];
      out.firstWithdrawalMonth = `${y}-${wm[2].padStart(2, "0")}`;
    }
  }

  // 특이사항: 특별요청사항/주의사항 + 기타특이사항
  const noteParts: string[] = [];
  const special = pick("특별요청사항/주의사항", "특별요청사항", "주의사항");
  if (special) noteParts.push(special);
  const etc = pick("기타특이사항", "기타");
  if (etc && etc !== special) noteParts.push(etc);
  if (noteParts.length) out.notes = noteParts.join("\n");

  return { values: out, count: Object.keys(out).length };
}

export function ClientCreateButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? "bg-[#3182F6] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#1B64DA] transition-colors shrink-0"}
      >
        + 고객사 등록
      </button>
      {open && <ClientCreateModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ClientCreateModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<CreateData | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<Partial<typeof emptyClient>>({});
  const [formKey, setFormKey] = useState(0);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    getCreateClientData().then(setData);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleFill() {
    if (!pasteText.trim()) return;
    const { values, count } = parseOnboarding(pasteText);
    if (count === 0) {
      setParseMsg("인식된 항목이 없어요. 양식 형식(● 라벨 : 값)을 확인해주세요.");
      return;
    }
    setParsed(values);
    setFormKey((k) => k + 1); // 폼 리마운트 → 새 기본값 반영
    setParseMsg(`${count}개 항목을 채웠어요. 내용을 확인하고 등록하세요.`);
  }

  function handleSuccess() {
    router.refresh();
    onClose();
  }

  const client = useMemo(() => ({ ...emptyClient, ...parsed }), [parsed]);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F2F4F6] shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[#191F28]">고객사 등록</h2>
            {data && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const form = document.querySelector<HTMLFormElement>('[data-modal-form]');
                    form?.requestSubmit();
                  }}
                  className="bg-[#3182F6] text-white text-sm px-4 py-1.5 rounded-lg hover:bg-[#1B64DA] transition-colors"
                >
                  등록
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="border border-[#D1D6DB] text-[#333D4B] text-sm px-4 py-1.5 rounded-lg hover:bg-[#F9FAFB] transition-colors"
                >
                  취소
                </button>
              </>
            )}
          </div>
        </div>

        {/* 바디 */}
        <div className="flex-1 px-6 py-5">
          {/* 붙여넣기 자동 채우기 */}
          <div className="mb-5 rounded-xl border border-[#E8F3FF] bg-[#F5F9FF] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#1B64DA]">📋 양식 붙여넣기 자동 채우기</span>
              </div>
              <span className="text-[11px] text-[#8B95A1]">기장계약 정보 텍스트를 그대로 붙여넣으세요</span>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"● 거래처명 : ...\n● 대표자명 : ...\n● 월 기장료(VAT 제외) : ...\n  전체 내용을 붙여넣고 '자동 채우기'를 누르세요"}
              rows={4}
              className="w-full border border-[#CBE2FF] bg-white rounded-[10px] px-3 py-2 text-xs text-[#191F28] focus:outline-none focus:border-[#3182F6] resize-none"
            />
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className={`text-[11px] ${parseMsg?.includes("없어요") ? "text-[#E02E2E]" : "text-[#15803D]"}`}>
                {parseMsg ?? ""}
              </span>
              <div className="flex items-center gap-2">
                {pasteText && (
                  <button
                    type="button"
                    onClick={() => { setPasteText(""); setParseMsg(null); }}
                    className="text-xs text-[#6B7684] px-3 py-1.5 rounded-lg hover:bg-white transition-colors"
                  >
                    지우기
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFill}
                  disabled={!pasteText.trim()}
                  className="bg-[#3182F6] text-white text-xs font-medium px-4 py-1.5 rounded-lg hover:bg-[#1B64DA] disabled:opacity-40 transition-colors"
                >
                  자동 채우기
                </button>
              </div>
            </div>
            <p className="text-[10.5px] text-[#8B95A1] mt-2 leading-relaxed">
              * 월 기장료는 VAT 포함(×1.1)으로 채워집니다. 인건비·원천세 유형·과세유형은 자동 채우지 않으니 아래에서 직접 선택하세요.
            </p>
          </div>

          {!data ? (
            <div className="text-center py-16 text-[#8B95A1] text-sm">불러오는 중...</div>
          ) : (
            <EditClientForm
              key={formKey}
              action={createClientInModal}
              client={client}
              users={data.users}
              currentTaxTypes={[]}
              currentLaborTypes={[]}
              currentUserRole={data.currentUserRole}
              affiliationOptions={data.affiliationOptions}
              onSuccess={handleSuccess}
              hideButtons
            />
          )}
        </div>
      </div>
    </div>
  );
}
