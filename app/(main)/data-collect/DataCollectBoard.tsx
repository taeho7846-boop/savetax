"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleDataCollection } from "@/app/actions/data-collect";
import { DOC_TYPES, getDefaultParams, type SettingType } from "@/lib/doc-types";

type DCRecord = { docType: string; status: string; params: string | null };

type Client = {
  id: number;
  name: string;
  clientType: string;
  dataCollections: DCRecord[];
};

export function DataCollectBoard({ clients, taxYear }: { clients: Client[]; taxYear: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [checkedDocs, setCheckedDocs] = useState<Set<string>>(new Set());

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

  const [collecting, setCollecting] = useState(false);

  async function handleCollect() {
    if (!selectedClient || checkedDocs.size === 0) return;

    // 종합소득세 신고도움 서비스
    if (checkedDocs.has("종합소득세_신고도움")) {
      const doc = hometaxDocs.find(d => d.key === "종합소득세_신고도움")!;
      const defaults = getDefaultParams(doc.settingType, taxYear);
      const saved = getParams(selectedClient, doc.key);
      const params = { ...defaults, ...saved };

      // 폼에서 실제 입력값 가져오기
      const container = document.querySelector(`div[data-doc="종합소득세_신고도움"]`);
      const inputs = container?.querySelectorAll<HTMLInputElement>("input[type='number']");
      const startYear = inputs?.[0]?.value || params.startYear || taxYear;
      const endYear = inputs?.[1]?.value || params.endYear || String(parseInt(taxYear) + 1);

      setCollecting(true);
      try {
        const res = await fetch("/api/data-collect/income-help", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedClient.id,
            startYear: parseInt(startYear),
            endYear: parseInt(endYear),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          alert(`수집 실패: ${data.error}`);
        } else {
          // ZIP 다운로드
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${selectedClient.name}_신고도움서비스.zip`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (e: any) {
        alert(`오류: ${e.message}`);
      } finally {
        setCollecting(false);
      }
      return;
    }

    // 사업자등록증명 (크롬 확장으로 실행)
    if (checkedDocs.has("사업자등록증명원")) {
      try {
        const res = await fetch("/api/automation/hometax-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: selectedClient.id }),
        });
        const data = await res.json();
        if (!res.ok) { alert(`오류: ${data.error}`); return; }

        const creds = btoa(unescape(encodeURIComponent(JSON.stringify({
          mode: "collect_biz_cert",
          id: data.hometaxId,
          pw: data.hometaxPw,
          certName: "",
          certPw: "",
          bizNumber: data.bizNumber || "",
          clientName: selectedClient.name,
        }))));

        window.open(
          `https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3#savetax=${creds}`,
          "_blank"
        );
        return;
      } catch (e: any) {
        alert(`오류: ${e.message}`);
        return;
      }
    }

    alert(`${selectedClient.name}: 선택한 자료의 자동 수집은 추후 연결 예정`);
  }

  function getStatus(client: Client, docType: string): string {
    const rec = client.dataCollections.find(d => d.docType === docType);
    return rec?.status ?? "none";
  }

  function getParams(client: Client, docType: string): Record<string, string> {
    const rec = client.dataCollections.find(d => d.docType === docType);
    if (rec?.params) {
      try { return JSON.parse(rec.params); } catch { return {}; }
    }
    return {};
  }

  const filteredClients = search
    ? clients.filter(c => c.name.includes(search))
    : clients;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">자료수집</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-1 py-1">
            <button onClick={() => handleYearChange(-1)} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">◀</button>
            <span className="text-sm font-medium text-gray-800 min-w-[80px] text-center">{taxYear}년 귀속</span>
            <button onClick={() => handleYearChange(1)} className="px-2 py-1 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded text-sm">▶</button>
          </div>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* 좌측: 거래처 목록 */}
        <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-100 flex flex-col shrink-0">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="거래처 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredClients.map(client => {
              const collected = client.dataCollections.filter(d => d.status === "collected").length;
              const isSelected = selectedClientId === client.id;
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors border-b border-gray-50 ${
                    isSelected ? "bg-[#1a2e4a] text-white" : "hover:bg-gray-50"
                  }`}
                  onClick={() => handleClientSelect(client.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isSelected ? "text-white" : "text-gray-900"}`}>
                      {client.name}
                    </div>
                    <div className={`text-[10px] ${isSelected ? "text-gray-300" : "text-gray-400"}`}>
                      {client.clientType === "corporate" ? "법인" : "개인"}
                    </div>
                  </div>
                  {collected > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isSelected ? "bg-white/20 text-white" : "bg-green-100 text-green-700"
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
        <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 overflow-y-auto">
          {!selectedClient ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              좌측에서 거래처를 선택하세요
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selectedClient.name}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{taxYear}년 귀속 자료수집</p>
                </div>
                <button
                  onClick={handleCollect}
                  disabled={checkedDocs.size === 0 || collecting}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    checkedDocs.size > 0 && !collecting
                      ? "bg-[#1a2e4a] text-white hover:bg-[#243d61]"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {collecting ? "수집 중..." : `자료수집 (${checkedDocs.size}건)`}
                </button>
              </div>

              <div className="inline-block px-2 py-0.5 rounded text-xs font-medium border mb-3 bg-blue-50 text-blue-600 border-blue-200">
                홈택스
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-10 px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checkedDocs.size === hometaxDocs.length}
                          onChange={toggleAll}
                          className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                        />
                      </th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">요청서류</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">필수 선택사항</th>
                      <th className="text-center px-3 py-2 text-gray-600 font-medium w-20">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hometaxDocs.map(doc => {
                      const status = getStatus(selectedClient, doc.key);
                      const isCollected = status === "collected";
                      const isChecked = checkedDocs.has(doc.key);
                      const defaults = getDefaultParams(doc.settingType, taxYear);
                      const saved = getParams(selectedClient, doc.key);
                      const params = { ...defaults, ...saved };

                      return (
                        <tr key={doc.key} className={`${isCollected ? "bg-green-50/50" : isChecked ? "bg-blue-50/30" : "hover:bg-gray-50"}`}>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleDoc(doc.key)}
                              className="accent-[#1a2e4a] w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className={`px-3 py-3 ${isCollected ? "text-green-700" : "text-gray-800"}`}>
                            {doc.label}
                          </td>
                          <td className="px-3 py-3" data-doc={doc.key}>
                            <SettingInput type={doc.settingType} params={params} docKey={doc.key} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {isCollected ? (
                              <span className="text-xs text-green-600 font-medium">완료</span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
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
  const inputClass = "border border-gray-300 rounded px-2 py-1 text-xs w-28 focus:outline-none";
  const selectClass = "border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none";

  switch (type) {
    case "year":
      return (
        <div className="flex items-center gap-1">
          <input type="number" defaultValue={params.year} className={`${inputClass} w-20`} /> <span className="text-xs text-gray-500">년</span>
        </div>
      );
    case "yearRange":
      return (
        <div className="flex items-center gap-1" data-doc={docKey}>
          <input type="number" defaultValue={params.startYear} className={`${inputClass} w-20`} />
          <span className="text-xs text-gray-400">~</span>
          <input type="number" defaultValue={params.endYear} className={`${inputClass} w-20`} />
          <span className="text-xs text-gray-500">년</span>
        </div>
      );
    case "monthRange":
      return (
        <div className="flex items-center gap-1">
          <input type="month" defaultValue={params.startMonth} className={inputClass} />
          <span className="text-xs text-gray-400">~</span>
          <input type="month" defaultValue={params.endMonth} className={inputClass} />
        </div>
      );
    case "dateRange":
      return (
        <div className="flex items-center gap-1">
          <input type="date" defaultValue={params.startDate} className={inputClass} />
          <span className="text-xs text-gray-400">~</span>
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
          <span className="text-xs text-gray-400">~</span>
          <input type="number" defaultValue={params.endYear} className={`${inputClass} w-20`} />
          <select defaultValue={params.endPeriod} className={selectClass}>
            <option value="1">1기</option>
            <option value="2">2기</option>
          </select>
        </div>
      );
    case "none":
      return <span className="text-xs text-gray-400">-</span>;
  }
}
