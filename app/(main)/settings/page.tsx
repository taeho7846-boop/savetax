import { getSettings, saveSettings } from "@/app/actions/settings";
import { getSession } from "@/lib/auth";
import { getBookmarks } from "@/app/actions/bookmarks";
import SettingsUploads from "./SettingsUploads";
import { WimembersButton } from "./WimembersButton";
import { BookmarkManager } from "./BookmarkManager";
import { LocalPCSettings } from "./LocalPCSettings";

const inputClass = "w-full border border-[#F2F4F6] bg-[#F9FAFB] rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:border-[#3182F6]";

export default async function SettingsPage() {
  const session = await getSession();
  const settings = await getSettings();
  const bookmarks = await getBookmarks(session!.id);
  const isAdmin = session?.role === "admin" || session?.role === "owner";

  // 연동 상태 체크 (AI 제안 스트립용)
  const missingIntegrations: string[] = [];
  if (!settings?.agentHometaxId || !settings?.agentHometaxPw) missingIntegrations.push("홈택스");
  if (!settings?.certName || !settings?.certPassword) missingIntegrations.push("공인인증서");
  if (!settings?.wehagoId || !settings?.wehagoPw) missingIntegrations.push("위하고");
  if (!settings?.wemembersId || !settings?.wemembersPw) missingIntegrations.push("위멤버스");

  return (
    <div>
      <div className="mb-5">
        <div className="text-[12.5px] text-[#86868b] font-medium flex items-center gap-1.5">
          <span className="live-dot" />
          계정 · 연동 · 환경설정
        </div>
        <h1 className="text-[26px] font-bold text-[#191F28] tracking-tight">설정</h1>
      </div>

      {/* AI 제안 스트립 — 연동 미흡 알림 */}
      {missingIntegrations.length > 0 && (
        <div className="ai-strip rounded-xl px-4 py-2.5 mb-4 flex items-center gap-3">
          <div className="ai-icon-glow w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0">AI</div>
          <div className="flex-1 text-[12.5px] text-[#191F28]">
            <span className="font-semibold">{missingIntegrations.join(" · ")} 미연결</span>
            <span className="text-[#6B7684]"> · 자동 기능을 사용할 수 없습니다. 계정 연결을 추천합니다.</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== 왼쪽 열: 계정 설정 + 저장 ===== */}
        <form action={saveSettings} className="space-y-4">
          {/* 세무대리인 홈택스 */}
          <div className={`glass rounded-2xl p-5 accent-glow ${(!settings?.agentHometaxId || !settings?.agentHometaxPw) ? "border-l-2 border-[#DC2626]" : ""}`}>
            <SectionHeader
              title="세무대리인 홈택스 계정"
              desc="기본값으로 사용되며 거래처별 계정으로 덮어쓸 수 있어요"
              connected={!!(settings?.agentHometaxId && settings?.agentHometaxPw)}
            />
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
          </div>

          {/* 공인인증서 */}
          <div className={`glass rounded-2xl p-5 ${(!settings?.certName || !settings?.certPassword) ? "border-l-2 border-[#DC2626]" : ""}`}>
            <SectionHeader
              title="공인인증서"
              desc="홈택스 자동 로그인 시 사용"
              connected={!!(settings?.certName && settings?.certPassword)}
            />
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
          </div>

          {/* 위하고 + 위멤버스 (2-col grid) */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`glass rounded-2xl p-5 ${(!settings?.wehagoId || !settings?.wehagoPw) ? "border-l-2 border-[#DC2626]" : ""}`}>
              <SectionHeader
                title="위하고 계정"
                connected={!!(settings?.wehagoId && settings?.wehagoPw)}
              />
              <div className="section-hairline mb-3" />
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">ID</label>
                  <input name="wehagoId" type="text" defaultValue={settings?.wehagoId ?? ""} placeholder="아이디" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">PW</label>
                  <input name="wehagoPw" type="password" defaultValue={settings?.wehagoPw ?? ""} placeholder="비밀번호" className={inputClass} />
                </div>
              </div>
            </div>

            <div className={`glass rounded-2xl p-5 ${(!settings?.wemembersId || !settings?.wemembersPw) ? "border-l-2 border-[#DC2626]" : ""}`}>
              <SectionHeader
                title="위멤버스 계정"
                connected={!!(settings?.wemembersId && settings?.wemembersPw)}
              />
              <div className="section-hairline mb-3" />
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">ID</label>
                  <input name="wemembersId" type="text" defaultValue={settings?.wemembersId ?? ""} placeholder="아이디" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-[#6B7684] mb-1">PW</label>
                  <input name="wemembersPw" type="password" defaultValue={settings?.wemembersPw ?? ""} placeholder="비밀번호" className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* 세금계산서 공급자 정보 */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-bold text-[#333D4B] mb-3">세금계산서 공급자 정보</h2>
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
          </div>

          {/* 알림톡 템플릿 */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-bold text-[#333D4B] mb-3">카카오 알림톡 템플릿 ID</h2>
            <p className="text-[10px] text-[#8B95A1] mb-3">솔라피에서 검수 완료된 템플릿 코드를 입력하세요</p>
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
          </div>

          {/* 슬랙 알림 설정 */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-bold text-[#333D4B] mb-3">슬랙 알림 설정</h2>
            <p className="text-[10px] text-[#8B95A1] mb-3">슬랙 연동 후 자동 알림을 받을 수 있습니다</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input name="slackMorningEnabled" type="checkbox" defaultChecked={settings?.slackMorningEnabled ?? true} className="accent-[#3182F6] w-4 h-4 shrink-0" />
                <span className="text-sm text-[#333D4B] whitespace-nowrap">아침 브리핑</span>
                <input name="slackMorningTime" type="time" defaultValue={settings?.slackMorningTime ?? "08:00"} className={`${inputClass} w-28 text-center shrink-0`} />
              </div>
              <div className="flex items-center gap-3">
                <input name="slackEveningEnabled" type="checkbox" defaultChecked={settings?.slackEveningEnabled ?? true} className="accent-[#3182F6] w-4 h-4 shrink-0" />
                <span className="text-sm text-[#333D4B] whitespace-nowrap">저녁 내일 일정</span>
                <input name="slackEveningTime" type="time" defaultValue={settings?.slackEveningTime ?? "19:00"} className={`${inputClass} w-28 text-center shrink-0`} />
              </div>
              <div className="flex items-center gap-3">
                <input name="slackDistributionEnabled" type="checkbox" defaultChecked={settings?.slackDistributionEnabled ?? true} className="accent-[#3182F6] w-4 h-4 shrink-0" />
                <span className="text-sm text-[#333D4B] whitespace-nowrap">새 거래처 배분 알림</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#3182F6] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#1B64DA] transition-colors"
          >
            저장
          </button>
        </form>

        {/* ===== 오른쪽 열: 가이드 + 북마크 + 도구 ===== */}
        <div className="space-y-4">
          {/* 단축키 & 액션 가이드 */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-bold text-[#333D4B] mb-4">단축키 & 검색 가이드</h2>

            <div className="space-y-4">
              {/* 단축키 */}
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

              {/* 검색 사용법 */}
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

              {/* 액션 목록 */}
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
          </div>

          {/* 검색 북마크 */}
          <BookmarkManager bookmarks={bookmarks} isAdmin={isAdmin} />

          {/* 내 PC 연동 */}
          <LocalPCSettings />

          {/* 크롬 확장 프로그램 */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-bold text-[#333D4B] mb-2">크롬 확장 프로그램</h2>
            <p className="text-xs text-[#6B7684] mb-3">
              홈택스 자동 로그인 및 기장등록 자동화를 위한 확장 프로그램
            </p>
            <a
              href="/api/chrome-extension"
              className="inline-flex items-center gap-2 bg-[#3182F6] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#1B64DA] transition-colors"
            >
              다운로드
            </a>
          </div>

          {/* 위멤버스 폴더 */}
          <div className="glass rounded-2xl p-5">
            <h2 className="text-sm font-bold text-[#333D4B] mb-2">구글드라이브 위멤버스 폴더</h2>
            <p className="text-xs text-[#6B7684] mb-3">
              기존 거래처에 &quot;5. 위멤버스&quot; 폴더를 일괄 생성합니다
            </p>
            <WimembersButton />
          </div>

          {/* 파일 업로드 */}
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
      </div>
    </div>
  );
}

function SectionHeader({ title, desc, connected }: { title: string; desc?: string; connected?: boolean }) {
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
    </div>
  );
}
