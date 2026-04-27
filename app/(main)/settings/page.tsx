import { getSettings, saveSettings } from "@/app/actions/settings";
import { getSession } from "@/lib/auth";
import { getBookmarks } from "@/app/actions/bookmarks";
import SettingsUploads from "./SettingsUploads";
import { WimembersButton } from "./WimembersButton";
import { BookmarkManager } from "./BookmarkManager";
import { LocalPCSettings } from "./LocalPCSettings";
import { SettingsShell } from "./SettingsShell";

const inputClass = "w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]";

export default async function SettingsPage() {
  const session = await getSession();
  const settings = await getSettings();
  const bookmarks = await getBookmarks(session!.id);
  const isAdmin = session?.role === "admin" || session?.role === "owner";

  // 연동 상태
  const hometaxConnected = !!(settings?.agentHometaxId && settings?.agentHometaxPw);
  const certConnected = !!(settings?.certName && settings?.certPassword);
  const wehagoConnected = !!(settings?.wehagoId && settings?.wehagoPw);
  const wemembersConnected = !!(settings?.wemembersId && settings?.wemembersPw);
  const integrationCount = [hometaxConnected, certConnected, wehagoConnected, wemembersConnected].filter(Boolean).length;
  const integrationPct = Math.round((integrationCount / 4) * 100);

  // 알림톡 채워진 개수
  const alimtalkFilled = [
    settings?.alimtalkHappyCallIndiv, settings?.alimtalkHappyCallCorp,
    settings?.alimtalkDocRemind, settings?.alimtalkFeeRemind,
  ].filter(Boolean).length;

  const missingIntegrations: string[] = [];
  if (!hometaxConnected) missingIntegrations.push("홈택스");
  if (!certConnected) missingIntegrations.push("공인인증서");
  if (!wehagoConnected) missingIntegrations.push("위하고");
  if (!wemembersConnected) missingIntegrations.push("위멤버스");

  const navGroups = [
    {
      cat: "계정",
      links: [
        { tab: "hometax", label: "홈택스", status: hometaxConnected },
        { tab: "cert", label: "공인인증서", status: certConnected },
        { tab: "wehago", label: "위하고", status: wehagoConnected },
        { tab: "wemembers", label: "위멤버스", status: wemembersConnected },
      ],
    },
    {
      cat: "발송",
      links: [
        { tab: "tax-invoice", label: "세금계산서" },
        { tab: "alimtalk", label: "알림톡 템플릿", badge: `${alimtalkFilled}/4` },
        { tab: "slack", label: "슬랙 알림" },
      ],
    },
    {
      cat: "가이드",
      links: [
        { tab: "shortcut", label: "단축키 / 검색" },
      ],
    },
    {
      cat: "연동",
      links: [
        { tab: "bookmark", label: "검색 북마크" },
        { tab: "localpc", label: "로컬 PC" },
        { tab: "chrome", label: "크롬 확장" },
        { tab: "folder", label: "위멤버스 폴더" },
        { tab: "files", label: "파일 업로드" },
      ],
    },
  ];

  const progressNode = (
    <div className="glass rounded-xl p-3">
      <div className="text-[10.5px] font-bold text-[#8B95A1] uppercase tracking-wider mb-2">연동 완성도</div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[18px] font-bold text-[#191F28] tracking-tight">{integrationCount}<span className="text-[11px] text-[#8B95A1] font-medium">/4</span></div>
        <div className={`text-[11px] font-semibold ${integrationCount === 4 ? "text-[#10B981]" : "text-[#F59E0B]"}`}>{integrationPct}%</div>
      </div>
      <div className="h-1.5 bg-[#F2F4F6] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${integrationCount === 4 ? "bg-[#10B981]" : "bg-[#F59E0B]"}`} style={{ width: `${integrationPct}%` }} />
      </div>
      {missingIntegrations.length > 0 && (
        <div className="text-[10.5px] text-[#DC2626] mt-2">{missingIntegrations.join(" · ")} 미연결</div>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-4">
        <div className="text-[12.5px] text-[#86868b] font-medium flex items-center gap-1.5">
          <span className="live-dot" />
          계정 · 연동 · 환경설정
        </div>
        <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">설정</h1>
      </div>

      {/* AI 제안 스트립 — 연동 미흡 알림 (탭 무관, 항상 표시) */}
      {missingIntegrations.length > 0 && (
        <div className="ai-strip rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3">
          <div className="ai-icon-glow w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0">AI</div>
          <div className="flex-1 text-[12.5px] text-[#191F28]">
            <span className="font-semibold">{missingIntegrations.join(" · ")} 미연결</span>
            <span className="text-[#6B7684]"> · 자동 기능을 사용할 수 없습니다. 계정 연결을 추천합니다.</span>
          </div>
          <a href="#hometax" className="text-[11.5px] bg-white border border-[#6366F1]/30 text-[#6366F1] px-2.5 py-1 rounded-md font-semibold hover:bg-[#6366F1] hover:text-white transition">지금 연결</a>
        </div>
      )}

      <SettingsShell navGroups={navGroups} progressNode={progressNode} defaultActive="hometax">
        {/* ===== form: 모든 저장 가능 섹션 한 form 안에 ===== */}
        <form id="settings-form" action={saveSettings} className="space-y-3">
          {/* 홈택스 */}
          <section data-tab="hometax" className={`glass rounded-2xl p-5 accent-glow ${!hometaxConnected ? "border-l-2 border-[#DC2626]" : ""}`}>
            <SectionHeader title="세무대리인 홈택스 계정" desc="기본값으로 사용되며 거래처별 계정으로 덮어쓸 수 있어요" connected={hometaxConnected} />
            <div className="section-hairline mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">홈택스 ID</label>
                <input name="agentHometaxId" type="text" defaultValue={settings?.agentHometaxId ?? ""} placeholder="아이디" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">홈택스 PW</label>
                <input name="agentHometaxPw" type="text" defaultValue={settings?.agentHometaxPw ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 공인인증서 */}
          <section data-tab="cert" className={`glass rounded-2xl p-5 ${!certConnected ? "border-l-2 border-[#DC2626]" : ""}`}>
            <SectionHeader title="공인인증서" desc="홈택스 자동 로그인 시 사용" connected={certConnected} />
            <div className="section-hairline mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">인증서 이름</label>
                <input name="certName" type="text" defaultValue={settings?.certName ?? ""} placeholder="예: 홍길동세무사사무소" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">인증서 비밀번호</label>
                <input name="certPassword" type="text" defaultValue={settings?.certPassword ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 위하고 */}
          <section data-tab="wehago" className={`glass rounded-2xl p-5 ${!wehagoConnected ? "border-l-2 border-[#DC2626]" : ""}`}>
            <SectionHeader title="위하고 계정" desc="위하고 서비스 자동 로그인 / 자료 다운로드" connected={wehagoConnected} />
            <div className="section-hairline mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">위하고 ID</label>
                <input name="wehagoId" type="text" defaultValue={settings?.wehagoId ?? ""} placeholder="아이디" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">위하고 PW</label>
                <input name="wehagoPw" type="password" defaultValue={settings?.wehagoPw ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 위멤버스 */}
          <section data-tab="wemembers" className={`glass rounded-2xl p-5 ${!wemembersConnected ? "border-l-2 border-[#DC2626]" : ""}`}>
            <SectionHeader title="위멤버스 계정" desc="위멤버스 자동 업로드 / 급여 자료 동기화" connected={wemembersConnected} />
            <div className="section-hairline mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">위멤버스 ID</label>
                <input name="wemembersId" type="text" defaultValue={settings?.wemembersId ?? ""} placeholder="아이디" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">위멤버스 PW</label>
                <input name="wemembersPw" type="password" defaultValue={settings?.wemembersPw ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 세금계산서 */}
          <section data-tab="tax-invoice" className="glass rounded-2xl p-5">
            <SectionHeader title="세금계산서 공급자 정보" desc="세금계산서 발행 시 공급자 기본 정보로 사용" />
            <div className="section-hairline mb-3" />
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">공급자 상호</label>
                <input name="tiSupplierName" type="text" defaultValue={settings?.tiSupplierName ?? ""} placeholder="상호명" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">대표자명</label>
                <input name="tiSupplierCeoName" type="text" defaultValue={settings?.tiSupplierCeoName ?? ""} placeholder="대표자" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">사업자등록번호</label>
                <input name="tiSupplierBizNum" type="text" defaultValue={settings?.tiSupplierBizNum ?? ""} placeholder="000-00-00000" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 알림톡 */}
          <section data-tab="alimtalk" className="glass rounded-2xl p-5">
            <SectionHeader
              title="카카오 알림톡 템플릿"
              desc="솔라피에서 검수 완료된 템플릿 코드를 입력하세요"
              countLabel={`${alimtalkFilled} / 4`}
              countTone={alimtalkFilled === 4 ? "ok" : "info"}
            />
            <div className="section-hairline mb-3" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">해피콜 - 개인</label>
                <input name="alimtalkHappyCallIndiv" type="text" defaultValue={settings?.alimtalkHappyCallIndiv ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">해피콜 - 법인</label>
                <input name="alimtalkHappyCallCorp" type="text" defaultValue={settings?.alimtalkHappyCallCorp ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">자료 독촉</label>
                <input name="alimtalkDocRemind" type="text" defaultValue={settings?.alimtalkDocRemind ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-[#6B7684] mb-1">채권 독촉</label>
                <input name="alimtalkFeeRemind" type="text" defaultValue={settings?.alimtalkFeeRemind ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 슬랙 */}
          <section data-tab="slack" className="glass rounded-2xl p-5">
            <SectionHeader title="슬랙 알림 설정" desc="슬랙 연동 후 자동 알림을 받을 수 있습니다" />
            <div className="section-hairline mb-3" />
            <div className="space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input name="slackMorningEnabled" type="checkbox" defaultChecked={settings?.slackMorningEnabled ?? true} className="accent-[#3182F6] w-4 h-4 shrink-0" />
                <span className="text-sm text-[#333D4B] flex-1 whitespace-nowrap">아침 브리핑</span>
                <input
                  name="slackMorningTime"
                  type="time"
                  defaultValue={settings?.slackMorningTime ?? "08:00"}
                  className="w-28 shrink-0 border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm text-center focus:outline-none focus:border-[#3182F6]"
                />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input name="slackEveningEnabled" type="checkbox" defaultChecked={settings?.slackEveningEnabled ?? true} className="accent-[#3182F6] w-4 h-4 shrink-0" />
                <span className="text-sm text-[#333D4B] flex-1 whitespace-nowrap">저녁 내일 일정</span>
                <input
                  name="slackEveningTime"
                  type="time"
                  defaultValue={settings?.slackEveningTime ?? "19:00"}
                  className="w-28 shrink-0 border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm text-center focus:outline-none focus:border-[#3182F6]"
                />
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input name="slackDistributionEnabled" type="checkbox" defaultChecked={settings?.slackDistributionEnabled ?? true} className="accent-[#3182F6] w-4 h-4 shrink-0" />
                <span className="text-sm text-[#333D4B] flex-1 whitespace-nowrap">새 거래처 배분 알림</span>
              </label>
            </div>
          </section>
        </form>

        {/* ===== 비-form 섹션 (form 밖) ===== */}

        {/* 단축키 가이드 */}
        <section data-tab="shortcut" className="glass rounded-2xl p-5">
          <SectionHeader title="단축키 & 검색 가이드" />
          <div className="section-hairline mb-4" />
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-bold text-[#6B7684] mb-2 uppercase tracking-wider">단축키</h3>
              <div className="space-y-1.5">
                {[
                  { keys: "/", desc: "전역 검색 열기" },
                  { keys: "Shift + A", desc: "AI 어시스턴트 열기/닫기" },
                ].map((s) => (
                  <div key={s.keys} className="flex items-center gap-3">
                    <kbd className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-[#4E5968] bg-[#F2F4F6] rounded border border-[#E5E8EB] min-w-[80px] justify-center">
                      {s.keys}
                    </kbd>
                    <span className="text-xs text-[#4E5968]">{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#6B7684] mb-2 uppercase tracking-wider">검색 사용법</h3>
              <div className="space-y-2 text-xs text-[#4E5968]">
                <div className="bg-[#F9FAFB] rounded-lg p-3 space-y-1.5">
                  <div className="font-medium text-[#333D4B]">거래처 바로 이동</div>
                  <div className="text-[#8B95A1]">/ → 거래처명 검색 → Enter → 수정 페이지 이동</div>
                </div>
                <div className="bg-[#F9FAFB] rounded-lg p-3 space-y-1.5">
                  <div className="font-medium text-[#333D4B]">거래처 + 액션</div>
                  <div className="text-[#8B95A1]">/ → 거래처명 검색 → Space → 액션 선택 → Enter</div>
                </div>
                <div className="bg-[#F9FAFB] rounded-lg p-3 space-y-1.5">
                  <div className="font-medium text-[#333D4B]">외부 사이트</div>
                  <div className="text-[#8B95A1]">/ → 사이트명 검색 → Enter → 새 탭으로 열기</div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#6B7684] mb-2 uppercase tracking-wider">액션 목록 (거래처 선택 후 Space)</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { icon: "✏️", key: "수정", desc: "거래처 정보 수정" },
                  { icon: "📝", key: "메모", desc: "메모 작성" },
                  { icon: "📋", key: "히스토리", desc: "업무/메모 내역" },
                  { icon: "🧾", key: "원천세", desc: "원천세 현황" },
                  { icon: "📑", key: "종소세", desc: "종합소득세 현황" },
                  { icon: "📥", key: "자료", desc: "자료수집 현황" },
                  { icon: "🔐", key: "로그인", desc: "홈택스 로그인" },
                ].map((a) => (
                  <div key={a.key} className="flex items-center gap-2 bg-[#F9FAFB] rounded-lg px-2.5 py-2">
                    <span className="text-sm">{a.icon}</span>
                    <div>
                      <div className="text-xs font-medium text-[#333D4B]">{a.key}</div>
                      <div className="text-[10px] text-[#8B95A1]">{a.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 검색 북마크 */}
        <div data-tab="bookmark">
          <BookmarkManager bookmarks={bookmarks} isAdmin={isAdmin} />
        </div>

        {/* 내 PC 연동 */}
        <div data-tab="localpc">
          <LocalPCSettings />
        </div>

        {/* 크롬 확장 */}
        <section data-tab="chrome" className="glass rounded-2xl p-5">
          <SectionHeader title="크롬 확장 프로그램" desc="홈택스 자동 로그인 및 기장등록 자동화를 위한 확장 프로그램" />
          <div className="section-hairline mb-3" />
          <a href="/api/chrome-extension" className="inline-flex items-center gap-2 bg-[#3182F6] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#1B64DA] transition-colors">
            다운로드
          </a>
        </section>

        {/* 위멤버스 폴더 */}
        <section data-tab="folder" className="glass rounded-2xl p-5">
          <SectionHeader title="구글드라이브 위멤버스 폴더" desc="기존 거래처에 &quot;5. 위멤버스&quot; 폴더를 일괄 생성합니다" />
          <div className="section-hairline mb-3" />
          <WimembersButton />
        </section>

        {/* 파일 업로드 */}
        <div data-tab="files">
          <SettingsUploads
            commissionFormPath={settings?.commissionFormPath ?? null}
            agentIdCardPath={settings?.agentIdCardPath ?? null}
            cmsExcelPath={settings?.cmsExcelPath ?? null}
            cmsBulkExcelPath={settings?.cmsBulkExcelPath ?? null}
            pensionExcelPath={settings?.pensionExcelPath ?? null}
            healthExcelPath={settings?.healthExcelPath ?? null}
            tiNormalExcelPath={settings?.tiNormalExcelPath ?? null}
            tiBulkExcelPath={settings?.tiBulkExcelPath ?? null}
            taxReductionExcelPath={settings?.taxReductionExcelPath ?? null}
          />
        </div>

        {/* 저장 버튼 — 폼 밖에 있지만 form="settings-form" 속성으로 제출 */}
        <div className="mt-4 flex justify-end">
          <button
            form="settings-form"
            type="submit"
            className="bg-[#3182F6] text-white px-6 h-10 rounded-xl text-[13px] font-bold hover:bg-[#1B64DA] shadow-md shadow-[#3182F6]/20 transition-colors"
          >
            저장
          </button>
        </div>
      </SettingsShell>
    </div>
  );
}

function SectionHeader({ title, desc, connected, countLabel, countTone }: {
  title: string;
  desc?: string;
  connected?: boolean;
  countLabel?: string;
  countTone?: "ok" | "info";
}) {
  return (
    <div className="flex items-start justify-between mb-2 gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-[#191F28]">{title}</h2>
        {desc && <p className="text-[11px] text-[#8B95A1] mt-0.5">{desc}</p>}
      </div>
      {connected !== undefined && (
        connected ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            연결됨
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
            미연결
          </span>
        )
      )}
      {countLabel && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-semibold border shrink-0 ${
          countTone === "ok"
            ? "bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]"
            : "bg-[#EDF3FF] text-[#1B64DA] border-[#A3CAFD]"
        }`}>{countLabel}</span>
      )}
    </div>
  );
}
