"""
급여명세서 PDF 저장 (pyautogui)
- 위하고 인쇄 미리보기가 열린 후 호출됨
- 인쇄 미리보기 포커스 → Shift+P → 파일명 입력 → 경로 이동 → 저장
- 인자: python save_payslip_pdf.py {사용자이름} {거래처명} {년도} {월}
"""
import pyautogui
import pyperclip
import time
import sys
import json

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"ok": False, "error": "인자 부족: 사용자이름 거래처명 년도 월"}))
        sys.exit(1)

    user_name = sys.argv[1]
    client_name = sys.argv[2]
    year = sys.argv[3]
    month = sys.argv[4]

    save_dir = f"G:\\공유 드라이브\\도희수의 SAVETAX_NH\\{user_name}\\{client_name}\\5. 위멤버스\\근로소득"
    filename = f"{year}년 {month.zfill(2)}월 급여명세서_{client_name}"

    # 1. 인쇄 미리보기 창 포커스 (제목표시줄 클릭)
    pyautogui.click(1614, 340)
    time.sleep(0.5)

    # 2. Shift+P → PDF 저장 (파일탐색기 열기)
    pyautogui.hotkey("shift", "p")
    time.sleep(3)

    # 3. 파일명 입력
    pyperclip.copy(filename)
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    # 4. 주소창으로 이동 → 경로 입력
    pyautogui.hotkey("alt", "d")
    time.sleep(0.5)
    pyperclip.copy(save_dir)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.3)
    pyautogui.press("enter")
    time.sleep(2)

    # 5. 저장
    pyautogui.hotkey("alt", "s")
    time.sleep(2)

    # 덮어쓰기 확인
    try:
        pyautogui.hotkey("alt", "y")
    except:
        pass

    print(json.dumps({"ok": True, "message": f"{filename}.pdf 저장 완료", "path": f"{save_dir}\\{filename}.pdf"}))

if __name__ == "__main__":
    main()
