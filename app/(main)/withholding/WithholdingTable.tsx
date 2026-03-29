"use client";

const LABOR_TYPE_STYLES: Record<string, { border: string; text: string; bg: string }> = {
  "근로소득": { border: "border-red-400",   text: "text-red-600",   bg: "bg-red-50"   },
  "사업소득": { border: "border-blue-400",  text: "text-blue-600",  bg: "bg-blue-50"  },
  "일용직":   { border: "border-green-500", text: "text-green-700", bg: "bg-green-50" },
};

function LaborBadge({ type }: { type: string }) {
  const s = LABOR_TYPE_STYLES[type.trim()] ?? {
    border: "border-gray-300",
    text: "text-gray-500",
    bg: "bg-gray-50",
  };
  return (
    <span className={`inline-flex items-center justify-center border ${s.border} ${s.text} ${s.bg} rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap`}>
      {type.trim()}
    </span>
  );
}

type Client = {
  id: number;
  name: string;
  laborTypes: string | null;
  halfYearTax: boolean;
};

export function WithholdingTable({ clients }: { clients: Client[] }) {
  return (
    <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm border border-gray-100">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
          <tr>
            <th className="text-left px-4 py-3 text-gray-700 font-medium">고객사명</th>
            <th className="text-center px-4 py-3 text-gray-700 font-medium">인건비</th>
            <th className="text-center px-4 py-3 text-gray-700 font-medium">6개월납</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {clients.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-center py-12 text-gray-500">
                인건비(근로소득/사업소득/일용직)가 체크된 거래처가 없습니다
              </td>
            </tr>
          ) : (
            clients.map((client) => {
              const laborList = client.laborTypes
                ? client.laborTypes.split(",").map((t) => t.trim()).filter((t) => t && t !== "1인사업자")
                : [];

              return (
                <tr key={client.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3 text-[#1a2e4a] font-medium">{client.name}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {laborList.map((t) => <LaborBadge key={t} type={t} />)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {client.halfYearTax ? (
                      <span className="inline-flex items-center justify-center bg-orange-50 text-orange-600 border border-orange-300 rounded-md px-2 py-0.5 text-xs font-medium">
                        6개월납
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
