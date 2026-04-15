import { getSettings, saveSettings } from "@/app/actions/settings";
import { getSession } from "@/lib/auth";
import { getBookmarks } from "@/app/actions/bookmarks";
import SettingsUploads from "./SettingsUploads";
import { WimembersButton } from "./WimembersButton";
import { BookmarkManager } from "./BookmarkManager";

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2e4a]/20 focus:border-[#1a2e4a]";

export default async function SettingsPage() {
  const session = await getSession();
  const settings = await getSettings();
  const bookmarks = await getBookmarks(session!.id);
  const isAdmin = session?.role === "admin" || session?.role === "owner";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-800 mb-6">설정</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ===== 왼쪽 열: 계정 설정 + 저장 ===== */}
        <form action={saveSettings} className="space-y-4">
          {/* 세무대리인 홈택스 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">세무대리인 홈택스 계정</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">홈택스 ID</label>
                <input name="agentHometaxId" type="text" defaultValue={settings?.agentHometaxId ?? ""} placeholder="아이디" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">홈택스 PW</label>
                <input name="agentHometaxPw" type="text" defaultValue={settings?.agentHometaxPw ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 공인인증서 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">공인인증서</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">인증서 이름</label>
                <input name="certName" type="text" defaultValue={settings?.certName ?? ""} placeholder="예: 홍길동세무사사무소" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">인증서 비밀번호</label>
                <input name="certPassword" type="text" defaultValue={settings?.certPassword ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 위하고 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">위하고 계정</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">위하고 ID</label>
                <input name="wehagoId" type="text" defaultValue={settings?.wehagoId ?? ""} placeholder="아이디" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">위하고 PW</label>
                <input name="wehagoPw" type="password" defaultValue={settings?.wehagoPw ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 위멤버스 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">위멤버스 계정</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">위멤버스 ID</label>
                <input name="wemembersId" type="text" defaultValue={settings?.wemembersId ?? ""} placeholder="아이디" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">위멤버스 PW</label>
                <input name="wemembersPw" type="password" defaultValue={settings?.wemembersPw ?? ""} placeholder="비밀번호" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 세금계산서 공급자 정보 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">세금계산서 공급자 정보</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">공급자 상호</label>
                <input name="tiSupplierName" type="text" defaultValue={settings?.tiSupplierName ?? ""} placeholder="상호명" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">대표자명</label>
                <input name="tiSupplierCeoName" type="text" defaultValue={settings?.tiSupplierCeoName ?? ""} placeholder="대표자" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">사업자등록번호</label>
                <input name="tiSupplierBizNum" type="text" defaultValue={settings?.tiSupplierBizNum ?? ""} placeholder="000-00-00000" className={inputClass} />
              </div>
            </div>
          </div>

          {/* 알림톡 템플릿 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">카카오 알림톡 템플릿 ID</h2>
            <p className="text-[10px] text-gray-400 mb-3">솔라피에서 검수 완료된 템플릿 코드를 입력하세요</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">해피콜 - 개인</label>
                <input name="alimtalkHappyCallIndiv" type="text" defaultValue={settings?.alimtalkHappyCallIndiv ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">해피콜 - 법인</label>
                <input name="alimtalkHappyCallCorp" type="text" defaultValue={settings?.alimtalkHappyCallCorp ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">자료 독촉</label>
                <input name="alimtalkDocRemind" type="text" defaultValue={settings?.alimtalkDocRemind ?? ""} placeholder="템플릿 코드" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">채권 독촉</label>
                <input name="alimtalkFeeRemind" type="text" defaultValue={settings?.alimtalkFeeRemind ?? ""} placeholder="템플릿 코드" className={inputClass} />
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

        {/* ===== 오른쪽 열: 북마크 + 도구 ===== */}
        <div className="space-y-4">
          {/* 검색 북마크 */}
          <BookmarkManager bookmarks={bookmarks} isAdmin={isAdmin} />

          {/* 크롬 확장 프로그램 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">크롬 확장 프로그램</h2>
            <p className="text-xs text-gray-500 mb-3">
              홈택스 자동 로그인 및 기장등록 자동화를 위한 확장 프로그램
            </p>
            <a
              href="/api/chrome-extension"
              className="inline-flex items-center gap-2 bg-[#1a2e4a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#243d61] transition-colors"
            >
              다운로드
            </a>
          </div>

          {/* 위멤버스 폴더 */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">구글드라이브 위멤버스 폴더</h2>
            <p className="text-xs text-gray-500 mb-3">
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
          />
        </div>
      </div>
    </div>
  );
}
