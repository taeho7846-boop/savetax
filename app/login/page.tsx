import { login } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen bg-[#f2f4f6] flex items-center justify-center px-6">
      <div className="w-full max-w-[420px] bg-white rounded-[20px] px-8 py-10 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-7 h-7 rounded-[8px] bg-[#3182F6] flex items-center justify-center">
              <span className="text-white text-[13px] font-bold">S</span>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#191F28]">
              Savetax
            </span>
          </div>
          <h1 className="text-[26px] font-bold text-[#191F28] leading-[1.3] tracking-tight">
            세무 업무 관리
          </h1>
          <p className="text-[14px] font-[500] text-[#8B95A1] mt-2 leading-[1.5]">
            내부 직원 전용 시스템입니다.
          </p>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 bg-[#FFF2F2] border border-[#FEC9C9] rounded-[12px] text-[#E02E2E] text-[13px] font-[500]">
            {error}
          </div>
        )}

        <form action={login} className="space-y-3">
          <div>
            <label className="block text-[13px] font-[600] text-[#4E5968] mb-1.5">
              아이디
            </label>
            <input
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full h-12 px-4 bg-[#F9FAFB] border border-[#F2F4F6] rounded-[12px] text-[15px] text-[#191F28] placeholder:text-[#B0B8C1] focus:outline-none focus:border-[#3182F6] focus:bg-white transition-colors"
              placeholder="아이디를 입력하세요"
            />
          </div>
          <div>
            <label className="block text-[13px] font-[600] text-[#4E5968] mb-1.5">
              비밀번호
            </label>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full h-12 px-4 bg-[#F9FAFB] border border-[#F2F4F6] rounded-[12px] text-[15px] text-[#191F28] placeholder:text-[#B0B8C1] focus:outline-none focus:border-[#3182F6] focus:bg-white transition-colors"
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          <button
            type="submit"
            className="w-full h-[52px] mt-4 rounded-[12px] bg-[#3182F6] text-white text-[16px] font-bold hover:bg-[#1B64DA] transition-colors"
          >
            로그인
          </button>
        </form>

        <p className="text-[12px] text-[#B0B8C1] mt-8 text-center">
          인가된 사용자만 접근할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
