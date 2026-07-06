"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDataCollection } from "@/app/actions/data-collect";
import { DOC_TYPES, getDefaultParams, type SettingType } from "@/lib/doc-types";

type DCRecord = { docType: string; status: string; params: string | null };

// hometax-credentials API 응답
type HometaxCreds = {
  hometaxId: string;
  hometaxPw: string;
  residentNumber?: string;
  bizNumber?: string;
  certName?: string;
  certPw?: string;
  collectToken?: string;
};

// 서류별 확장 수집 설정: 어떤 mode로, 폼에서 어떤 추가 파라미터를 뽑아 넘길지
type CollectConfig = {
  mode: string;
  useCert?: boolean; // 인증서(certName/certPw)를 페이로드에 실을지 (연말정산 본인인증용)
  build?: (container: Element | null, data: HometaxCreds, taxYear: string) => Record<string, unknown>;
};

// dateRange 입력칸(input[type=date] 2개) → startDate/endDate
function readDateRange(c: Element | null) {
  const dt = c?.querySelectorAll<HTMLInputElement>("input[type='date']");
  return { startDate: dt?.[0]?.value || "", endDate: dt?.[1]?.value || "" };
}
// monthRange 입력칸(input[type=month] 2개) → startMonth/endMonth
function readMonthRange(c: Element | null) {
  const m = c?.querySelectorAll<HTMLInputElement>("input[type='month']");
  return { startMonth: m?.[0]?.value || "", endMonth: m?.[1]?.value || "" };
}

const COLLECT_CONFIG: Record<string, CollectConfig> = {
  종합소득세_신고도움: {
    mode: "collect_income_help",
    build: (c, _d, ty) => {
      const n = c?.querySelectorAll<HTMLInputElement>("input[type='number']");
      return {
        startYear: parseInt(n?.[0]?.value || ty),
        endYear: parseInt(n?.[1]?.value || String(parseInt(ty) + 1)),
      };
    },
  },
  사업자등록증명원: {
    mode: "collect_biz_cert",
    build: (_c, d) => ({ bizNumber: d.bizNumber || "" }),
  },
  부가가치세_과세표준증명: {
    mode: "collect_vat_cert",
    build: (c, d, ty) => {
      const n = c?.querySelectorAll<HTMLInputElement>("input[type='number']");
      const s = c?.querySelectorAll<HTMLSelectElement>("select");
      return {
        bizNumber: d.bizNumber || "",
        startYear: parseInt(n?.[0]?.value || ty),
        endYear: parseInt(n?.[1]?.value || ty),
        startPeriod: s?.[0]?.value || "1",
        endPeriod: s?.[1]?.value || "2",
      };
    },
  },
  납부내역증명: {
    mode: "collect_payment_cert",
    build: (c, d) => ({ bizNumber: d.bizNumber || "", ...readDateRange(c) }),
  },
  종합소득세_신고서: { mode: "collect_tax_return", build: (c, d) => ({ returnType: "income", bizNumber: d.bizNumber || "", ...readDateRange(c) }) },
  부가가치세_신고서: { mode: "collect_tax_return", build: (c, d) => ({ returnType: "vat", bizNumber: d.bizNumber || "", ...readDateRange(c) }) },
  법인소득세_신고서: { mode: "collect_tax_return", build: (c, d) => ({ returnType: "corp", bizNumber: d.bizNumber || "", ...readDateRange(c) }) },
  양도소득세_신고서: { mode: "collect_tax_return", build: (c, d) => ({ returnType: "transfer", bizNumber: d.bizNumber || "", ...readDateRange(c) }) },
  증여세_신고서: { mode: "collect_tax_return", build: (c, d) => ({ returnType: "gift", bizNumber: d.bizNumber || "", ...readDateRange(c) }) },
  간이지급명세서: { mode: "collect_payment_statement", build: (c) => ({ stmtType: "simple", ...readMonthRange(c) }) },
  사업소득_지급명세서: { mode: "collect_payment_statement", build: (c) => ({ stmtType: "business", ...readMonthRange(c) }) },
  연말정산_간소화: {
    mode: "collect_yearend_simplified",
    useCert: true,
    build: (c, _d, ty) => {
      const n = c?.querySelectorAll<HTMLInputElement>("input[type='number']");
      return { year: parseInt(n?.[0]?.value || ty) };
    },
  },
};

type Client = {
  id: number;
  name: string;
  clientType: string;
  dataCollections: DCRecord[];
};

export function DataCollectBoard({ clients, taxYear }: { clients: Client[]; taxYear: string }) {
  const router = useRouter();
  const refreshListenerRef = useRef<(() => void) | null>(null);
  const [isDeleting, startDelete] = useTransition();
  // 첫 진입 시 좌측 첫 번째 거래처를 자동 선택 (매번 클릭할 필요 없게)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(clients[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(new Set());

  // 수집 왕복(홈택스 새 탭 다녀오기) 후 화면이 새로 마운트되면 useState 초기값 때문에
  // 좌측 선택이 첫 거래처로 리셋된다 → 직전 선택/검색을 sessionStorage로 복원.
  useEffect(() => {
    try {
      const savedId = sessionStorage.getItem("dc_selectedClientId");
      const savedSearch = sessionStorage.getItem("dc_search");
      if (savedId && clients.some(c => c.id === Number(savedId))) {
        setSelectedClientId(Number(savedId));
      }
      if (savedSearch) setSearch(savedSearch);
    } catch {}
    // 마운트 시 1회만 복원 (이후 변경은 아래 저장 effect가 담당)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 선택/검색이 바뀔 때마다 저장 (다음 마운트에서 복원용)
  useEffect(() => {
    try {
      if (selectedClientId != null) sessionStorage.setItem("dc_selectedClientId", String(selectedClientId));
      else sessionStorage.removeItem("dc_selectedClientId");
      sessionStorage.setItem("dc_search", search);
    } catch {}
  }, [selectedClientId, search]);

  const hometaxDocs = DOC_TYPES.filter(d => d.source === "홈택스");
  const selectedClient = selectedClientId ? clients.find(c => c.id === selectedClientId) ?? null : null;

  function handleYearChange(delta: number) {
    const y = parseInt(taxYear) + delta;
    router.push(`/data-collect?year=${y}`);
  }

  function handleClientSelect(clientId: number) {
    setSelectedClientId(clientId);
    setCheckedDocs(new Set());
  }

  function toggleDoc(docKey: string) {
    setCheckedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docKey)) next.delete(docKey); else next.add(docKey);
      return next;
    });
  }

  function toggleAll() {
    if (checkedDocs.size === hometaxDocs.length) {
      setCheckedDocs(new Set());
    } else {
      setCheckedDocs(new Set(hometaxDocs.map(d => d.key)));
    }
  }

  // 홈택스 탭에서 수집이 끝나고 앱 탭으로 돌아오면 상태 컬럼 갱신.
  // 같은 창 안 탭 전환은 window 'focus'가 안 뜨므로 visibilitychange로 감지.
  function refreshOnReturn() {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      router.refresh();
    };
    // 중복 등록 방지: 직전 리스너를 먼저 제거
    if (refreshListenerRef.current) {
      document.removeEventListener("visibilitychange", refreshListenerRef.current);
      window.removeEventListener("focus", refreshListenerRef.current);
    }
    refreshListenerRef.current = onVisible;
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible); // 별도 창으로 열린 경우 대비
  }

  // 서류 1건을 홈택스 새 탭에서 수집 (홈택스 탭이 로그인 세션을 점유하므로 항상 1건씩).
  async function collectOne(docKey: string) {
    if (!selectedClient) return;
    const target = hometaxDocs.find(d => d.key === docKey);
    if (!target) return;

    // 본인인증(인증서)이 필요한 서류는 아이디 로그인만으로 불가 → 안내 후 중단
    if (target.auth === "cert") {
      alert(
        `"${target.label}"은(는) 아이디 로그인만으로 수집할 수 없습니다.\n\n` +
        `${target.authNote ?? "발급에 거래처 본인인증이 필요합니다."}\n\n` +
        `세무사가 거래처에 직접 요청하거나, 거래처 인증서 등록 후 처리하세요.`
      );
      return;
    }

    const cfg = COLLECT_CONFIG[docKey];
    if (!cfg) {
      alert(`'${target.label}'의 자동 수집은 아직 지원되지 않습니다.`);
      return;
    }
    try {
      const res = await fetch("/api/automation/hometax-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClient.id }),
      });
      const data: HometaxCreds = await res.json();
      if (!res.ok) { alert(`오류: ${(data as { error?: string }).error}`); return; }

      const container = document.querySelector(`[data-doc="${docKey}"]`);
      const extra = cfg.build ? cfg.build(container, data, taxYear) : {};

      const payload = {
        mode: cfg.mode,
        id: data.hometaxId,
        pw: data.hometaxPw,
        rn: data.residentNumber || "",
        certName: cfg.useCert ? (data.certName || "") : "",
        certPw: cfg.useCert ? (data.certPw || "") : "",
        clientName: selectedClient.name,
        clientId: selectedClient.id,
        taxYear,
        docType: docKey,
        appOrigin: window.location.origin,
        token: data.collectToken || "",
        ...extra,
      };
      const creds = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));

      window.open(
        `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
        "_blank"
      );
      refreshOnReturn();
    } catch (e) {
      alert(`오류: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 일괄 자료수집: 체크된 서류 중 자동수집(아이디) 가능한 첫 서류부터 1건 실행.
  async function handleCollect() {
    if (!selectedClient || checkedDocs.size === 0) return;
    const checkedList = hometaxDocs.filter(d => checkedDocs.has(d.key));
    const target = checkedList.find(d => d.auth === "id") ?? checkedList[0];
    if (!target) return;
    if (checkedList.length > 1 && target.auth === "id") {
      if (!confirm(`한 번에 한 서류만 수집됩니다.\n먼저 "${target.label}"부터 수집할까요?`)) return;
    }
    await collectOne(target.key);
  }

  function getStatus(client: Client, docType: string): string {
    const rec = client.dataCollections.find(d => d.docType === docType);
    return rec?.status ?? "none";
  }

  function getParams(client: Client, docType: string): Record<string, string> {
    const rec = client.dataCollections.find(d => d.docType === docType);
    if (rec?.params) {
      try {
        const parsed = JSON.parse(rec.params);
        // _files 같은 내부 키(비문자열 값)는 입력 폼 파라미터에서 제외
        return Object.fromEntries(
          Object.entries(parsed).filter(([, v]) => typeof v === "string")
        ) as Record<string, string>;
      } catch { return {}; }
    }
    return {};
  }

  // 수집 기록 + 업로드 파일 삭제 (재수집을 위한 초기화)
  function handleDelete(docType: string, docLabel: string) {
    if (!selectedClient) return;
    if (!confirm(`${selectedClient.name} · ${docLabel}\n수집된 파일과 상태를 삭제하고 처음부터 다시 수집할 수 있게 합니다.\n삭제할까요?`)) return;
    startDelete(async () => {
      await deleteDataCollection(selectedClient.id, docType, taxYear);
      router.refresh();
    });
  }

  // 수집된 파일 목록 (upload API가 params._files에 기록)
  function getFiles(client: Client, docType: string): { name: string; url: string }[] {
    const rec = client.dataCollections.find(d => d.docType === docType);
    if (!rec?.params) return [];
    try {
      const files = JSON.parse(rec.params)._files;
      return Array.isArray(files) ? files : [];
    } catch { return []; }
  }

  const filteredClients = search
    ? clients.filter(c => c.name.includes(search))
    : clients;

  return (
    <>
      <div className="flex items-end justify-between mb-3 gap-4 flex-wrap">
        <div>
          <div className="text-[12.5px] text-[#86868b] font-medium">거래처 자료 수령 현황</div>
          <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">자료수집 · {taxYear}년 귀속</h1>
        </div>
        <div className="flex items-center gap-1 glass rounded-xl px-1 h-9">
          <button onClick={() => handleYearChange(-1)} className="w-7 h-7 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">◀</button>
          <span className="text-[12.5px] font-bold text-[#191F28] min-w-[70px] text-center">{taxYear}년</span>
          <button onClick={() => handleYearChange(1)} className="w-7 h-7 rounded-lg text-[#6B7684] hover:text-[#191F28] hover:bg-white/60 text-sm flex items-center justify-center">▶</button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* 좌측: 거래처 목록 */}
        <div className="w-64 glass rounded-2xl flex flex-col shrink-0">
          <div className="p-3 border-b border-[#F2F4F6]">
            <input
              type="text"
              placeholder="거래처 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredClients.map(client => {
              const collected = client.dataCollections.filter(d => d.status === "collected").length;
              const isSelected = selectedClientId === client.id;
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors border-b border-[#F2F4F6] ${
                    isSelected ? "bg-[#3182F6] text-white" : "hover:bg-[#F9FAFB]"
                  }`}
                  onClick={() => handleClientSelect(client.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isSelected ? "text-white" : "text-[#191F28]"}`}>
                      {client.name}
                    </div>
                    <div className={`text-[10px] ${isSelected ? "text-[#B0B8C1]" : "text-[#8B95A1]"}`}>
                      {client.clientType === "corporate" ? "법인" : "개인"}
                    </div>
                  </div>
                  {collected > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isSelected ? "bg-white/20 text-white" : "bg-[#E7F7EE] text-[#15803D]"
                    }`}>
                      {collected}/{hometaxDocs.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측: 자료 체크리스트 */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-[#F2F4F6] overflow-y-auto">
          {!selectedClient ? (
            <div className="flex items-center justify-center h-full text-[#8B95A1] text-sm">
              좌측에서 거래처를 선택하세요
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-[#191F28]">{selectedClient.name}</h2>
                  <p className="text-xs text-[#6B7684] mt-0.5">{taxYear}년 귀속 자료수집</p>
                </div>
                <button
                  onClick={handleCollect}
                  disabled={checkedDocs.size === 0}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    checkedDocs.size > 0
                      ? "bg-[#3182F6] text-white hover:bg-[#1B64DA]"
                      : "bg-[#E5E8EB] text-[#8B95A1] cursor-not-allowed"
                  }`}
                >
                  일괄 자료수집 ({checkedDocs.size}건)
                </button>
              </div>

              <div className="inline-block px-2 py-0.5 rounded text-xs font-medium border mb-3 bg-[#F5F9FF] text-[#3182F6] border-[#A3CAFD]">
                홈택스
              </div>

              <div className="border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#F9FAFB] border-b border-[#E5E8EB]">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checkedDocs.size === hometaxDocs.length}
                          onChange={toggleAll}
                          className="accent-[#3182F6] w-4 h-4 cursor-pointer"
                        />
                      </th>
                      <th className="text-left px-3 py-2 text-[#4E5968] font-medium">요청서류</th>
                      <th className="text-left px-3 py-2 text-[#4E5968] font-medium">필수 선택사항</th>
                      <th className="text-center px-3 py-2 text-[#4E5968] font-medium w-24">상태</th>
                      <th className="text-center px-2 py-2 text-[#4E5968] font-medium w-[84px]">수집</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F4F6]">
                    {hometaxDocs.map(doc => {
                      const status = getStatus(selectedClient, doc.key);
                      const isCollected = status === "collected";
                      const isEmpty = status === "empty";
                      const isChecked = checkedDocs.has(doc.key);
                      const defaults = getDefaultParams(doc.settingType, taxYear, doc.key);
                      const saved = getParams(selectedClient, doc.key);
                      const params = { ...defaults, ...saved };
                      const files = getFiles(selectedClient, doc.key);

                      return (
                        <tr key={doc.key} className={`${isCollected ? "bg-[#F1FBF4]/50" : isChecked ? "bg-[#F5F9FF]/30" : "hover:bg-[#F9FAFB]"}`}>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDoc(doc.key)}
                              className="accent-[#3182F6] w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className={`px-3 py-3 ${isCollected ? "text-[#15803D]" : "text-[#191F28]"}`}>
                            <div className="flex items-center gap-2">
                              {doc.auth === "cert" ? (
                                <span
                                  title={doc.authNote}
                                  className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]"
                                >
                                  본인인증
                                </span>
                              ) : (
                                <span
                                  title="홈택스 아이디 로그인만으로 자동 수집"
                                  className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-[#F0F7FF] text-[#1B64DA] border-[#BEDBFF]"
                                >
                                  아이디
                                </span>
                              )}
                              <span>{doc.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-3" data-doc={doc.key}>
                            <SettingInput type={doc.settingType} params={params} docKey={doc.key} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {isCollected ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-[#16A865] font-medium">완료</span>
                                  <button
                                    onClick={() => handleDelete(doc.key, doc.label)}
                                    disabled={isDeleting}
                                    title="수집 기록·파일 삭제 (다시 수집)"
                                    className="text-[11px] px-2 py-0.5 rounded-[6px] border border-[#E5E8EB] text-[#6B7684] hover:text-[#dc2626] hover:border-[#FCA5A5] hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
                                  >
                                    삭제
                                  </button>
                                </div>
                                {files.map(f => (
                                  <a
                                    key={f.url}
                                    href={encodeURI(f.url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={f.name}
                                    className="text-[11px] text-[#3182F6] hover:underline whitespace-nowrap"
                                  >
                                    📄 {f.name.replace(/\.pdf$/i, "").slice(-14).replace(/^_/, "")}
                                  </a>
                                ))}
                              </div>
                            ) : isEmpty ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="text-xs text-[#8B95A1]" title="홈택스에서 조회했으나 해당 기간 신고/발급 내역이 없음">조회 결과 없음</span>
                                <button
                                  onClick={() => handleDelete(doc.key, doc.label)}
                                  disabled={isDeleting}
                                  title="기록 삭제 (다시 수집)"
                                  className="text-[11px] px-2 py-0.5 rounded-[6px] border border-[#E5E8EB] text-[#6B7684] hover:text-[#dc2626] hover:border-[#FCA5A5] hover:bg-[#FEF2F2] transition-colors disabled:opacity-50"
                                >
                                  삭제
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-[#8B95A1]">-</span>
                            )}
                          </td>
                          <td className="px-2 py-3 text-center">
                            {doc.auth === "cert" ? (
                              <button
                                onClick={() => collectOne(doc.key)}
                                title={doc.authNote}
                                className="text-[11px] whitespace-nowrap px-2 py-1 rounded-[6px] border border-[#FED7AA] text-[#C2410C] bg-[#FFF7ED] hover:bg-[#FFEDD5] transition-colors"
                              >
                                본인인증
                              </button>
                            ) : (
                              <button
                                onClick={() => collectOne(doc.key)}
                                title={`${doc.label} 수집`}
                                className="text-[11px] whitespace-nowrap px-2 py-1 rounded-[6px] border border-[#3182F6]/40 text-[#1B64DA] hover:bg-[#F0F7FF] transition-colors"
                              >
                                {isCollected || isEmpty ? "다시 수집" : "수집"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SettingInput({ type, params, docKey }: { type: SettingType; params: Record<string, string | undefined>; docKey?: string }) {
  const inputClass = "border border-[#D1D6DB] rounded px-2 py-1 text-xs w-28 focus:outline-none";
  const selectClass = "border border-[#D1D6DB] rounded px-2 py-1 text-xs focus:outline-none";

  switch (type) {
    case "year":
      return (
        <div className="flex items-center gap-1">
          <input type="number" defaultValue={params.year} className={`${inputClass} w-20`} /> <span className="text-xs text-[#6B7684]">년</span>
        </div>
      );
    case "yearRange":
      return (
        <div className="flex items-center gap-1" data-doc={docKey}>
          <input type="number" defaultValue={params.startYear} className={`${inputClass} w-20`} />
          <span className="text-xs text-[#8B95A1]">~</span>
          <input type="number" defaultValue={params.endYear} className={`${inputClass} w-20`} />
          <span className="text-xs text-[#6B7684]">년</span>
        </div>
      );
    case "monthRange":
      return (
        <div className="flex items-center gap-1">
          <input type="month" defaultValue={params.startMonth} className={inputClass} />
          <span className="text-xs text-[#8B95A1]">~</span>
          <input type="month" defaultValue={params.endMonth} className={inputClass} />
        </div>
      );
    case "dateRange":
      return (
        <div className="flex items-center gap-1">
          <input type="date" defaultValue={params.startDate} className={inputClass} />
          <span className="text-xs text-[#8B95A1]">~</span>
          <input type="date" defaultValue={params.endDate} className={inputClass} />
        </div>
      );
    case "vatPeriod":
      return (
        <div className="flex items-center gap-1">
          <input type="number" defaultValue={params.startYear} className={`${inputClass} w-20`} />
          <select defaultValue={params.startPeriod} className={selectClass}>
            <option value="1">1기</option>
            <option value="2">2기</option>
          </select>
          <span className="text-xs text-[#8B95A1]">~</span>
          <input type="number" defaultValue={params.endYear} className={`${inputClass} w-20`} />
          <select defaultValue={params.endPeriod} className={selectClass}>
            <option value="1">1기</option>
            <option value="2">2기</option>
          </select>
        </div>
      );
    case "none":
      return <span className="text-xs text-[#8B95A1]">-</span>;
  }
}
