"""
기장 수임 자동화 (세무대리정보 이용 신청서 - 기장수임용)
Usage: python commission_commission.py <agent_id> <agent_pw> <cert_name> <cert_pw>
                                       <resident_number> <ceo_name>
                                       <agent_idcard_path> <client_idcard_path> <pdf_path>
"""

import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


def safe_click(wait, by, value, label=""):
    elem = wait.until(EC.element_to_be_clickable((by, value)))
    elem.click()
    if label:
        print(f"{label} 클릭")
    return elem


def main():
    if len(sys.argv) < 10:
        print("ERROR: 인수 부족", file=sys.stderr)
        sys.exit(1)

    agent_id          = sys.argv[1]
    agent_pw          = sys.argv[2]
    cert_name         = sys.argv[3]
    cert_pw           = sys.argv[4]
    resident_number   = sys.argv[5].replace("-", "")
    ceo_name          = sys.argv[6]
    agent_idcard_path = sys.argv[7]   # 세무대리인 신분증
    client_idcard_path = sys.argv[8]  # 대표자 신분증
    pdf_path          = sys.argv[9]   # 홈택스수임신청서 PDF

    jumin1 = resident_number[:6]
    jumin2 = resident_number[6:]

    options = Options()
    options.add_argument("--start-maximized")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--disable-web-security")
    options.add_experimental_option("detach", True)
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--disable-blink-features=AutomationControlled")

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 20)

    try:
        # ── 1. 세무대리인 로그인 ──────────────────────────────────
        print("홈택스 접속 중...")
        time.sleep(1)
        driver.get(
            "https://hometax.go.kr/websquare/websquare.html"
            "?w2xPath=/ui/pp/index_pp.xml&menuCd=index3"
        )

        safe_click(wait, By.ID, "mf_wfHeader_group1503", "로그인 버튼")
        safe_click(wait, By.ID, "mf_txppWframe_anchor15", "아이디 로그인")

        elem = wait.until(EC.presence_of_element_located((By.ID, "mf_txppWframe_iptUserId")))
        elem.clear()
        elem.send_keys(agent_id)
        driver.find_element(By.ID, "mf_txppWframe_iptUserPw").send_keys(agent_pw)
        safe_click(wait, By.ID, "mf_txppWframe_anchor25", "로그인")

        # 권한 팝업
        time.sleep(0.5)
        try:
            perm_wait = WebDriverWait(driver, 2)
            perm_wait.until(
                EC.element_to_be_clickable((By.XPATH, "//*[normalize-space(text())='허용']"))
            ).click()
            print("권한 허용")
        except Exception:
            pass

        # 공인인증서
        print("공인인증서 창 대기...")
        original_window = driver.current_window_handle
        try:
            WebDriverWait(driver, 3).until(lambda d: len(d.window_handles) > 1)
            new_window = [w for w in driver.window_handles if w != original_window][0]
            driver.switch_to.window(new_window)
            print("인증서 새 창 전환")
        except Exception:
            switched = False
            for iframe in driver.find_elements(By.TAG_NAME, "iframe"):
                try:
                    driver.switch_to.frame(iframe)
                    driver.find_element(By.XPATH, "//span[@title and string-length(@title) > 0]")
                    switched = True
                    break
                except Exception:
                    driver.switch_to.default_content()
            if not switched:
                print("iframe 없이 진행")

        cert_wait = WebDriverWait(driver, 15)
        if cert_name:
            cert_elem = cert_wait.until(
                EC.element_to_be_clickable((By.XPATH, f"//span[contains(@title, '{cert_name}')]"))
            )
        else:
            cert_elem = cert_wait.until(
                EC.element_to_be_clickable((By.XPATH, "//span[@title and string-length(@title) > 0]"))
            )
        cert_elem.click()
        print("인증서 선택")

        if cert_pw:
            pw_elem = cert_wait.until(EC.element_to_be_clickable((By.ID, "input_cert_pw")))
            pw_elem.clear()
            pw_elem.send_keys(cert_pw)

        cert_wait.until(EC.element_to_be_clickable((By.ID, "btn_confirm_iframe"))).click()
        print("인증서 확인")

        if len(driver.window_handles) > 1:
            driver.switch_to.window(original_window)
        else:
            driver.switch_to.default_content()

        for xpath, label in [
            ("//input[contains(@id,'mf_txppWframe') and contains(@id,'btn_confirm') and @value='확인']", "확인 팝업 1"),
            ("//input[contains(@id,'mf_wfHeader') and contains(@id,'btn_confirm') and @value='확인']", "확인 팝업 2"),
        ]:
            try:
                btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable((By.XPATH, xpath)))
                btn.click()
                print(f"{label} 처리")
            except Exception:
                pass

        try:
            btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.XPATH, "//span[contains(@id,'mf_wfHeader') and contains(.,'현행 홈택스')]"))
            )
            btn.click()
            print("현행 홈택스 이용하기")
        except Exception:
            pass

        print("로그인 완료")
        time.sleep(1)

        # ── 2. 메뉴 이동 ─────────────────────────────────────────
        safe_click(wait, By.ID, "mf_wfHeader_wq_uuid_619", "세무대리·납세관리")
        time.sleep(1)

        safe_click(
            wait,
            By.XPATH,
            "//span[@escape='false' and @label='수임 납세자 관리']",
            "수임 납세자 관리",
        )
        time.sleep(1)

        safe_click(
            wait,
            By.XPATH,
            "//span[contains(text(),'세무대리정보 이용 신청서(기장수임용)')]",
            "세무대리정보 이용 신청서(기장수임용)",
        )
        time.sleep(2)

        # ── 3. 폼 입력 ───────────────────────────────────────────
        print(f"주민번호 앞자리: {jumin1}")
        rn1 = wait.until(EC.presence_of_element_located((
            By.ID, "mf_txppWframe_pf_UTECAAAZ07_inputCvaAplnBscClntResRgtNo1"
        )))
        rn1.clear()
        rn1.send_keys(jumin1)

        print(f"주민번호 뒷자리 입력")
        rn2 = driver.find_element(
            By.ID, "mf_txppWframe_pf_UTECAAAZ07_inputCvaAplnBscClntResRgtNo2"
        )
        rn2.clear()
        rn2.send_keys(jumin2)

        print(f"대표자명: {ceo_name}")
        name_input = driver.find_element(
            By.ID, "mf_txppWframe_pf_UTECAAAZ07_inputClntFnm"
        )
        name_input.clear()
        name_input.send_keys(ceo_name)

        safe_click(
            wait,
            By.ID,
            "mf_txppWframe_pf_UTECAAAZ07_btnClntFnmCnfr",
            "확인",
        )
        time.sleep(1)

        # ── 4. 알럿 처리 ─────────────────────────────────────────
        try:
            alert_wait = WebDriverWait(driver, 5)
            alert_wait.until(EC.alert_is_present())
            alert = driver.switch_to.alert
            print(f"알럿: {alert.text}")
            alert.accept()
            print("알럿 확인")
        except Exception:
            print("알럿 없음")
        time.sleep(1)

        # ── 5. 파일 업로드 ────────────────────────────────────────
        import os
        import win32clipboard
        import pyautogui

        def paste_path_to_dialog(abs_path: str):
            """Windows 파일 다이얼로그에 경로를 클립보드로 붙여넣기 (한글 경로 지원)"""
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardText(abs_path, win32clipboard.CF_UNICODETEXT)
            win32clipboard.CloseClipboard()
            time.sleep(0.3)
            pyautogui.hotkey("ctrl", "a")
            pyautogui.hotkey("ctrl", "v")
            time.sleep(0.3)
            pyautogui.press("enter")

        files_to_upload = []
        for label, fpath in [
            ("세무대리인 신분증", agent_idcard_path),
            ("대표자 신분증",     client_idcard_path),
            ("홈택스수임신청서",  pdf_path),
        ]:
            if fpath and os.path.isfile(fpath):
                files_to_upload.append((label, fpath))
                print(f"업로드 파일 확인: {label} → {fpath}")
            else:
                print(f"경고: 파일 없음 ({label}): {fpath}", file=sys.stderr)

        # 숨겨진 file input 탐색 후 send_keys 시도, 실패 시 다이얼로그 방식
        file_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='file']")
        print(f"파일 input 발견: {len(file_inputs)}개")

        for i, (label, fpath) in enumerate(files_to_upload):
            abs_path = os.path.abspath(fpath)
            uploaded = False

            # 1순위: 숨겨진 file input send_keys
            if i < len(file_inputs):
                try:
                    driver.execute_script(
                        "arguments[0].style.display='block'; "
                        "arguments[0].style.visibility='visible';",
                        file_inputs[i]
                    )
                    file_inputs[i].send_keys(abs_path)
                    print(f"{label} send_keys 업로드 완료")
                    time.sleep(0.5)
                    uploaded = True
                except Exception as e:
                    print(f"{label} send_keys 실패, 다이얼로그 방식으로 전환: {e}")

            # 2순위: 파일선택 버튼 + 클립보드 붙여넣기
            if not uploaded:
                safe_click(
                    wait,
                    By.ID,
                    "mf_txppWframe_pf_UTECAAAZ03_pf_UTECMGAA06_UTECMGAA06_trigger1",
                    f"파일선택 ({label})",
                )
                time.sleep(1.5)
                paste_path_to_dialog(abs_path)
                print(f"{label} 클립보드 업로드 완료")
                time.sleep(1)

        print("SUCCESS: 파일 업로드 완료 - 화면 확인 후 신청 버튼을 눌러주세요")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
