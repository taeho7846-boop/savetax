"""
세무대리인 홈택스 로그인 자동화 스크립트
Usage: python hometax_agent_login.py <hometaxId> <hometaxPw> [certName] [certPassword]
"""

import sys
import time
import pyautogui
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


def main():
    if len(sys.argv) < 3:
        print("ERROR: 인수 부족 (hometaxId, hometaxPw 필요)", file=sys.stderr)
        sys.exit(1)

    hometax_id   = sys.argv[1]
    hometax_pw   = sys.argv[2]
    cert_name    = sys.argv[3] if len(sys.argv) > 3 else ""
    cert_password = sys.argv[4] if len(sys.argv) > 4 else ""

    options = Options()
    options.add_argument("--start-maximized")
    options.add_experimental_option("detach", True)
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--disable-blink-features=AutomationControlled")

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 20)

    try:
        print("홈택스 접속 중...")
        driver.get(
            "https://hometax.go.kr/websquare/websquare.html"
            "?w2xPath=/ui/pp/index_pp.xml&menuCd=index3"
        )

        # 1. 로그인 버튼 클릭
        print("로그인 버튼 클릭...")
        elem = wait.until(EC.element_to_be_clickable((By.ID, "mf_wfHeader_group1503")))
        elem.click()

        # 2. 아이디 로그인 클릭
        print("아이디 로그인 선택...")
        elem = wait.until(EC.element_to_be_clickable((By.ID, "mf_txppWframe_anchor15")))
        elem.click()

        # 3. 아이디 입력
        print("아이디 입력...")
        elem = wait.until(EC.presence_of_element_located((By.ID, "mf_txppWframe_iptUserId")))
        elem.clear()
        elem.send_keys(hometax_id)

        # 4. 비밀번호 입력
        print("비밀번호 입력...")
        elem = driver.find_element(By.ID, "mf_txppWframe_iptUserPw")
        elem.clear()
        elem.send_keys(hometax_pw)

        # 5. 로그인 클릭
        print("로그인 클릭...")
        elem = wait.until(EC.element_to_be_clickable((By.ID, "mf_txppWframe_anchor25")))
        elem.click()

        # 5-1. 권한 팝업 처리 (로그인 후 나타날 수 있음)
        time.sleep(0.5)
        try:
            perm_wait = WebDriverWait(driver, 2)
            allow_elem = perm_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//*[normalize-space(text())='허용']")
                )
            )
            allow_elem.click()
            print("권한 허용 완료 (DOM)")
        except Exception:
            # Chrome 브라우저 레벨 팝업 - 탭탭 엔터로 처리
            pyautogui.press("tab")
            time.sleep(0.2)
            pyautogui.press("tab")
            time.sleep(0.2)
            pyautogui.press("enter")
            time.sleep(0.3)
            print("권한 팝업 키보드 처리")

        # 6. 공인인증서 선택
        print("공인인증서 창 대기 중...")
        cert_wait = WebDriverWait(driver, 15)
        original_window = driver.current_window_handle

        # 새 창으로 열리는 경우 전환
        try:
            WebDriverWait(driver, 3).until(lambda d: len(d.window_handles) > 1)
            new_window = [w for w in driver.window_handles if w != original_window][0]
            driver.switch_to.window(new_window)
            print("인증서 새 창으로 전환")
        except Exception:
            # 새 창 없으면 iframe 탐색
            switched = False
            for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
                try:
                    driver.switch_to.frame(iframe)
                    driver.find_element(By.XPATH, "//span[@title and string-length(@title) > 0]")
                    print("인증서 iframe으로 전환")
                    switched = True
                    break
                except Exception:
                    driver.switch_to.default_content()
            if not switched:
                print("iframe 전환 없이 현재 페이지에서 진행")

        # 6-1. 인증서 선택
        if cert_name:
            cert_elem = cert_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, f"//span[contains(@title, '{cert_name}')]")
                )
            )
        else:
            cert_elem = cert_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//span[@title and string-length(@title) > 0]")
                )
            )
        cert_elem.click()
        print("인증서 선택 완료")

        # 6-2. 인증서 비밀번호 입력
        if cert_password:
            pw_elem = cert_wait.until(
                EC.element_to_be_clickable((By.ID, "input_cert_pw"))
            )
            pw_elem.clear()
            pw_elem.send_keys(cert_password)
            print("인증서 비밀번호 입력 완료")

        # 6-3. 확인 버튼 클릭
        confirm_elem = cert_wait.until(
            EC.element_to_be_clickable((By.ID, "btn_confirm_iframe"))
        )
        confirm_elem.click()
        print("확인 클릭 완료")

        # 원래 창/프레임으로 복귀
        if len(driver.window_handles) > 1:
            driver.switch_to.window(original_window)
        else:
            driver.switch_to.default_content()

        # 7. 인증 후 확인 팝업 1 (mf_txppWframe 안의 btn_confirm)
        print("확인 팝업 1 처리...")
        try:
            popup_wait = WebDriverWait(driver, 5)
            btn = popup_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//input[contains(@id,'mf_txppWframe') and contains(@id,'btn_confirm') and @value='확인']")
                )
            )
            btn.click()
            print("확인 팝업 1 완료")
        except Exception as e:
            print(f"확인 팝업 1 없음 (건너뜀): {e}", file=sys.stderr)

        # 8. 인증 후 확인 팝업 2 (mf_wfHeader 안의 btn_confirm)
        print("확인 팝업 2 처리...")
        try:
            popup_wait = WebDriverWait(driver, 5)
            btn = popup_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//input[contains(@id,'mf_wfHeader') and contains(@id,'btn_confirm') and @value='확인']")
                )
            )
            btn.click()
            print("확인 팝업 2 완료")
        except Exception as e:
            print(f"확인 팝업 2 없음 (건너뜀): {e}", file=sys.stderr)

        # 9. 현행 홈택스 이용하기 클릭
        print("현행 홈택스 이용하기 클릭...")
        try:
            popup_wait = WebDriverWait(driver, 5)
            btn = popup_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//span[contains(@id,'mf_wfHeader') and contains(.,'현행 홈택스')]")
                )
            )
            btn.click()
            print("현행 홈택스 이용하기 클릭 완료")
        except Exception as e:
            print(f"현행 홈택스 이용하기 없음 (건너뜀): {e}", file=sys.stderr)

        print("SUCCESS: 홈택스 세무대리인 로그인 완료")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
