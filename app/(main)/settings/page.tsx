import { getSettings, saveSettings } from "@/app/actions/settings";
import SettingsUploads from "./SettingsUploads";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-gray-800 mb-6">설정</h1>

      <form action={saveSettings} className="space-y-6">
        {/* 세무대리인 홈택스 계정 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">
            세무대리인 홈택스 계정
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">홈택스 ID</label>
              <input
                name="agentHometaxId"
                type="text"
                defaultValue={settings?.agentHometaxId ?? ""}
                placeholder="세무대리인 홈택스 아이디"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">홈택스 PW</label>
              <input
                name="agentHometaxPw"
                type="text"
                defaultValue={settings?.agentHometaxPw ?? ""}
                placeholder="세무대리인 홈택스 비밀번호"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a]"
              />
            </div>
          </div>
        </div>

        {/* 공인인증서 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">공인인증서</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">인증서 이름</label>
              <input
                name="certName"
                type="text"
                defaultValue={settings?.certName ?? ""}
                placeholder="예: 홍길동세무사사무소"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">인증서 비밀번호</label>
              <input
                name="certPassword"
                type="text"
                defaultValue={settings?.certPassword ?? ""}
                placeholder="공인인증서 비밀번호"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a]"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-[#1a2e4a] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#243d61] transition-colors"
        >
          저장
        </button>
      </form>

      {/* 크롬 확장 프로그램 */}
      <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">크롬 확장 프로그램</h2>
        <p className="text-xs text-gray-500 mb-4">
          홈택스 자동 로그인 및 기장등록 자동화를 위한 크롬 확장 프로그램입니다.<br />
          다운로드 후 압축 해제 → Chrome 주소창에 chrome://extensions 입력 → 개발자 모드 켜기 → &quot;압축해제된 확장 프로그램을 로드합니다&quot; 클릭 → 폴더 선택
        </p>
        <a
          href="/api/chrome-extension"
          className="inline-flex items-center gap-2 bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
        >
          크롬 확장 프로그램 다운로드
        </a>
      </div>

      <div className="mt-6">
        <SettingsUploads
          commissionFormPath={settings?.commissionFormPath ?? null}
          agentIdCardPath={settings?.agentIdCardPath ?? null}
          cmsExcelPath={settings?.cmsExcelPath ?? null}
          cmsBulkExcelPath={settings?.cmsBulkExcelPath ?? null}
          pensionExcelPath={settings?.pensionExcelPath ?? null}
          healthExcelPath={settings?.healthExcelPath ?? null}
        />
      </div>
    </div>
  );
}
