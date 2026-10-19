// 페이지 전환 중 보이는 공용 스켈레톤 — 서버에서 데이터를 읽는 동안 빈 화면 대신 글래스 카드 윤곽을 보여준다
export default function MainLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="불러오는 중">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 h-3 w-28 rounded-full bg-white/70" />
          <div className="h-7 w-56 rounded-xl bg-white/80" />
        </div>
        <div className="h-10 w-36 rounded-2xl bg-white/70" />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass h-[96px] rounded-2xl" />
        ))}
      </div>
      <div className="glass overflow-hidden rounded-3xl">
        <div className="h-11 border-b border-white/60 bg-white/60" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-white/40 px-5 py-3.5">
            <div className="h-3.5 rounded-full bg-white/80" style={{ width: `${30 + ((i * 17) % 40)}%` }} />
            <div className="ml-auto h-3.5 w-16 rounded-full bg-white/70" />
            <div className="h-3.5 w-10 rounded-full bg-white/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
