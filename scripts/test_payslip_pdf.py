"""
급여명세서 PDF 저장 테스트
- 위하고 인쇄 미리보기에서 Shift+P 누른 후 파일탐색기가 열린 상태에서 실행
- 또는 인쇄 미리보기 열린 상태에서 Shift+P부터 자동 실행
"""
import pyautogui
import time
import sys

pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3

# ── 설정 ──
USER_NAME = "김태호"           # 로그인한 사용자 이름
CLIENT_NAME = "어른김밥"       # 거래처명
YEAR = "2026"
MONTH = "3"

# 저장 경로
SAVE_DIR = f"G:\\공유 드라이브\\도희수의 SAVETAX_NH\\{USER_NAME}\\{CLIENT_NAME}\\1. 원천세"
FILENAME = f"{YEAR}년 {MONTH}월 급여명세서_{CLIENT_NAME}"

def main():
    print(f"저장 경로: {SAVE_DIR}")
    print(f"파일명: {FILENAME}.pdf")
    print()
    print("5초 후 시작합니다.")
    print("위하고 인쇄 미리보기 창을 앞으로 가져오세요!")
    for i in range(5, 0, -1):
        print(f"  {i}...")
        time.sleep(1)

    # 1. Shift+P → PDF 저장 (파일탐색기 열기)
    print("[1] Shift+P 누르는 중...")
    pyautogui.hotkey("shift", "p")
    time.sleep(3)  # 파일탐색기 뜰 때까지 대기

    import pyperclip

    # 2. 파일명 먼저 입력 (파일탐색기 열리자마자 파일명 입력란에 포커스 있음)
    print("[2] 파일명 입력...")
    pyperclip.copy(FILENAME)
    pyautogui.hotkey("ctrl", "a")
    time.sleep(0.2)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.5)

    # 3. 주소창으로 이동 (Alt+D)
    print("[3] 주소창에 경로 입력...")
    pyautogui.hotkey("alt", "d")
    time.sleep(0.5)
    pyperclip.copy(SAVE_DIR)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(0.3)
    pyautogui.press("enter")
    time.sleep(2)

    # 4. 저장 (Alt+S)
    print("[4] 저장...")
    pyautogui.hotkey("alt", "s")
    time.sleep(2)

    # 덮어쓰기 확인 팝업이 뜨면 "예" 클릭
    try:
        pyautogui.hotkey("alt", "y")
    except:
        pass

    print("완료!")

if __name__ == "__main__":
    main()
