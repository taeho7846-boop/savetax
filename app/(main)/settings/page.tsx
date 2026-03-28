import { getSettings, saveSettings } from "@/app/actions/settings";
import SettingsUploads from "./SettingsUploads";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-lg">
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

      <div className="mt-6">
        <SettingsUploads
          commissionFormPath={settings?.commissionFormPath ?? null}
          agentIdCardPath={settings?.agentIdCardPath ?? null}
          cmsExcelPath={settings?.cmsExcelPath ?? null}
        />
      </div>
    </div>
  );
}
