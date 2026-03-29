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
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");

  // 홈택스만
  const hometaxDocs = DOC_TYPES.filter(d => d.source === "홈택스");

  function handleYearChange(delta: number) {
    const y = parseInt(taxYear) + delta;
    router.push(`/data-collect?year=${y}`);
  }

  function handleToggle(clientId: number, docType: string) {
    startTransition(async () => {
      await toggleDataCollection(clientId, docType, taxYear);
    });
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

  const totalDocs = hometaxDocs.length * clients.length;
  const collectedDocs = clients.reduce(
    (sum, c) => sum + c.dataCollections.filter(d => d.status === "collected").length,
    0
  );

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">자료수집</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            수집: <span className="font-medium text-[#1a2e4a]">{collectedDocs}</span> / {totalDocs}
          </div>
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
              const isSelected = selectedClient?.id === client.id;
              return (
                <div
                  key={client.id}
                  className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors border-b border-gray-50 ${
                    isSelected ? "bg-[#1a2e4a] text-white" : "hover:bg-gray-50"
                  }`}
                  onClick={() => setSelectedClient(client)}
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
                <div className="text-sm text-gray-500">
                  {selectedClient.dataCollections.filter(d => d.status === "collected").length} / {hometaxDocs.length} 수집완료
                </div>
              </div>

              <div className="inline-block px-2 py-0.5 rounded text-xs font-medium border mb-3 bg-blue-50 text-blue-600 border-blue-200">
                홈택스
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">요청서류</th>
                      <th className="text-left px-3 py-2 text-gray-600 font-medium">필수 선택사항</th>
                      <th className="text-center px-3 py-2 text-gray-600 font-medium w-20">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {hometaxDocs.map(doc => {
                      const status = getStatus(selectedClient, doc.key);
                      const isCollected = status === "collected";
                      const defaults = getDefaultParams(doc.settingType, taxYear);
                      const saved = getParams(selectedClient, doc.key);
                      const params = { ...defaults, ...saved };

                      return (
                        <tr key={doc.key} className={isCollected ? "bg-green-50/50" : "hover:bg-gray-50"}>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isCollected}
                              onChange={() => handleToggle(selectedClient.id, doc.key)}
                              disabled={isPending}
                              className="accent-[#1a2e4a] w-4 h-4"
                            />
                          </td>
                          <td className={`px-3 py-3 ${isCollected ? "text-green-700" : "text-gray-800"}`}>
                            {doc.label}
                          </td>
                          <td className="px-3 py-3">
                            <SettingInput type={doc.settingType} params={params} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            {isCollected ? (
                              <span className="text-xs text-green-600 font-medium">완료</span>
                            ) : status === "pending" ? (
                              <span className="text-xs text-yellow-600">대기</span>
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

function SettingInput({ type, params }: { type: SettingType; params: Record<string, string | undefined> }) {
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
        <div className="flex items-center gap-1">
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
