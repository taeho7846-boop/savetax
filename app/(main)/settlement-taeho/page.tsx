import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  canEditTaehoSettlement,
  canViewTaehoSettlement,
  currentYM,
  getTaehoParticipants,
  isValidYM,
  loadTaehoSettlement,
} from "@/lib/taeho-settlement";
import { TaehoSettlementView } from "./TaehoSettlementView";

/**
 * 세무회계태호 정산 — 참여자(이휘언) 월 손익계산서.
 * 대표/관리자와 정산 참여자(직원관리에서 수수료율이 설정된 사용자)만 볼 수 있다.
 * 열 때마다 DB에서 다시 계산한다.
 */
export const dynamic = "force-dynamic";

export default async function TaehoSettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string; u?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const participants = await getTaehoParticipants();
  const isParticipant = participants.some((p) => p.id === session.id);
  if (!canViewTaehoSettlement(session, isParticipant)) redirect("/dashboard");

  const params = await searchParams;
  const yearMonth = isValidYM(params.ym) ? params.ym : currentYM();
  const canEdit = canEditTaehoSettlement(session);

  // 참여자 선택: 참여자 본인은 자기 것만, 대표는 ?u= 로 고르고 기본은 첫 번째
  let participant = isParticipant && !canEdit ? participants.find((p) => p.id === session.id)! : undefined;
  if (!participant) {
    const wanted = params.u ? Number(params.u) : NaN;
    participant = participants.find((p) => p.id === wanted) ?? participants[0];
  }

  if (!participant) {
    return (
      <div className="flex flex-col pb-4">
        <Header />
        <div className="glass-strong rounded-3xl p-10 text-center max-w-xl mx-auto mt-6">
          <div className="w-12 h-12 rounded-2xl gradient-amber mx-auto mb-4 flex items-center justify-center text-white text-xl font-bold">%</div>
          <div className="text-[15px] font-bold text-[#191F28]">정산 참여자가 아직 없어요</div>
          <p className="text-[12.5px] text-[#6B7684] mt-2 leading-relaxed">
            운영 → 직원관리에서 정산 대상 사용자(예: 이휘언)의 수정 폼을 열고
            <br />
            <b className="text-[#4E5968]">태호 정산 수수료율(기장료 %, 단건 %)</b>을 입력하면 여기에 손익계산서가 나타납니다.
          </p>
        </div>
      </div>
    );
  }

  const data = await loadTaehoSettlement(participant, yearMonth);

  return (
    <div className="flex flex-col pb-4">
      <TaehoSettlementView
        data={data}
        participants={participants.map((p) => ({ id: p.id, name: p.name }))}
        canEdit={canEdit}
        viewerName={session.name}
      />
    </div>
  );
}

function Header() {
  return (
    <div className="mb-5">
      <div className="text-[12.5px] text-[#8B95A1] font-medium">월 손익계산서</div>
      <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">세무회계태호 정산</h1>
    </div>
  );
}
