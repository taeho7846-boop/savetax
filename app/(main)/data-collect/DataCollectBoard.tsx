"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DOC_TYPES, toggleDataCollection } from "@/app/actions/data-collect";

type DCRecord = { docType: string; status: string };

type Client = {
  id: number;
  name: string;
  clientType: string;
  dataCollections: DCRecord[];
};

// 수집기관별 그룹
const SOURCE_GROUPS = [
  { source: "홈택스", color: "bg-blue-50 text-blue-600 border-blue-200" },
  { source: "건강보험공단", color: "bg-green-50 text-green-600 border-green-200" },
  { source: "고용산재포탈", color: "bg-orange-50 text-orange-600 border-orange-200" },
  { source: "대법원", color: "bg-purple-50 text-purple-600 border-purple-200" },
  { source: "은행", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { source: "인터넷등기소", color: "bg-pink-50 text-pink-600 border-pink-200" },
  { source: "정부24", color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
];

export function DataCollectBoard({ clients, taxYear }: { clients: Client[]; taxYear: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [search, setSearch] = useState("");

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

  const filteredClients = search
    ? clients.filter(c => c.name.includes(search))
    : clients;

  // 전체 진행률
  const totalDocs = DOC_TYPES.length * clients.length;
  const collectedDocs = clients.reduce(
    (sum, c) => sum + c.dataCollections.filter(d => d.status === "collected").length,
    0
  );

  return (
    <>
      {/* 헤더 */}
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
                      {collected}/{DOC_TYPES.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 우측: 자료 수집 체크리스트 */}
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
                  {selectedClient.dataCollections.filter(d => d.status === "collected").length} / {DOC_TYPES.length} 수집완료
                </div>
              </div>

              <div className="space-y-5">
                {SOURCE_GROUPS.map(group => {
                  const docs = DOC_TYPES.filter(d => d.source === group.source);
                  if (docs.length === 0) return null;
                  return (
                    <div key={group.source}>
                      <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium border mb-2 ${group.color}`}>
                        {group.source}
                      </div>
                      <div className="space-y-1">
                        {docs.map(doc => {
                          const status = getStatus(selectedClient, doc.key);
                          const isCollected = status === "collected";
                          return (
                            <label
                              key={doc.key}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                isCollected ? "bg-green-50" : "hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isCollected}
                                onChange={() => handleToggle(selectedClient.id, doc.key)}
                                disabled={isPending}
                                className="accent-[#1a2e4a] w-4 h-4"
                              />
                              <span className={`text-sm ${isCollected ? "text-green-700 line-through" : "text-gray-800"}`}>
                                {doc.label}
                              </span>
                              {isCollected && (
                                <span className="text-[10px] text-green-500 ml-auto">수집완료</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
