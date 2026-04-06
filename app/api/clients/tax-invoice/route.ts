import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

function getLastDay(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIds, yearMonth } = await req.json();
  if (!Array.isArray(clientIds) || clientIds.length === 0 || !yearMonth) {
    return NextResponse.json({ error: "clientIds와 yearMonth 필요" }, { status: 400 });
  }

  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = getLastDay(year, month);
  const dateStr = `${year}${String(month).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
  const dayStr = String(lastDay).padStart(2, "0");

  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds }, isDeleted: false },
    orderBy: { name: "asc" },
  });

  const rows = clients
    .filter((c) => c.monthlyFee && c.monthlyFee > 0)
    .map((c) => {
      const fee = c.monthlyFee!;
      const supply = Math.floor(fee / 1.1);
      const vat = fee - supply;
      const bizNum = (c.bizNumber ?? "").replace(/-/g, "");

      // A~AY 매핑 (빈 셀도 포함)
      const row: Record<string, string | number> = {};
      row["A"] = "01";
      row["B"] = dateStr;
      row["C"] = bizNum;
      row["D"] = "";
      row["E"] = c.name;
      row["F"] = c.ceoName ?? "";
      row["G"] = "";
      row["H"] = "";
      row["I"] = "";
      row["J"] = "";
      row["K"] = "";
      row["L"] = supply;
      row["M"] = vat;
      row["N"] = "";
      row["O"] = dayStr;
      row["P"] = "";
      row["Q"] = "";
      row["R"] = "";
      row["S"] = "";
      row["T"] = supply;
      row["U"] = vat;
      // V~AX 빈칸
      for (let i = 0; i < 26; i++) {
        row[String.fromCharCode(86 + i)] = ""; // V(86)~
      }
      // AW, AX는 위에서 커버됨 (V=86 ... 86+25=111)
      // AY = column index 50
      row["AY"] = "01";

      return row;
    });

  // 헤더 없이 데이터만 넣기 위해 aoa 방식 사용
  const aoa = rows.map((row) => {
    const arr: (string | number)[] = [];
    // A(0) ~ AY(50)
    const colKeys = [
      "A","B","C","D","E","F","G","H","I","J","K","L","M","N","O",
      "P","Q","R","S","T","U","V","W","X","Y","Z",
      "AA","AB","AC","AD","AE","AF","AG","AH","AI","AJ","AK","AL","AM","AN","AO","AP","AQ","AR","AS","AT","AU","AV","AW","AX","AY"
    ];
    for (const key of colKeys) {
      arr.push(row[key] ?? "");
    }
    return arr;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "세금계산서");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const fileName = `TI_${yearMonth}.xlsx`;

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
