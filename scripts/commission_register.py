"""
기장대리 수임납세자 등록 자동화 (세무대리인 로그인 포함)
Usage: python commission_register.py <agent_id> <agent_pw> <cert_name> <cert_pw>
                                      <client_type> <biz_number> <resident_number> <phone>
"""

import sys
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


def parse_biz(biz):
    clean = biz.replace("-", "").replace(" ", "")
    return clean[:3], clean[3:5], clean[5:10]


def parse_phone(phone):
    clean = phone.replace("-", "").replace(" ", "")
    return clean[:3], clean[3:7], clean[7:11]


def safe_click(wait, by, value, label=""):
    elem = wait.until(EC.element_to_be_clickable((by, value)))
    elem.click()
    if label:
        print(f"{label} 클릭")
    return elem


def safe_input(driver, elem_id, value, label=""):
    elem = driver.find_element(By.ID, elem_id)
    elem.clear()
    elem.send_keys(value)
    if label:
        print(f"{label} 입력 완료")


def main():
    if len(sys.argv) < 9:
        print("ERROR: 인수 부족", file=sys.stderr)
        sys.exit(1)

    agent_id        = sys.argv[1]
    agent_pw        = sys.argv[2]
    cert_name       = sys.argv[3]
    cert_pw         = sys.argv[4]
    client_type     = sys.argv[5]   # "individual" | "corporate"
    biz_number      = sys.argv[6]
    resident_number = sys.argv[7].replace("-", "")
    phone           = sys.argv[8]

    biz1, biz2, biz3       = parse_biz(biz_number)
    phone1, phone2, phone3 = parse_phone(phone)
    today = datetime.now().strftime("%Y-%m-%d")

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

        # 권한 팝업 (있을 경우만 처리)
        time.sleep(0.5)
        try:
            perm_wait = WebDriverWait(driver, 2)
            allow_elem = perm_wait.until(
                EC.element_to_be_clickable((By.XPATH, "//*[normalize-space(text())='허용']"))
            )
            allow_elem.click()
            print("권한 허용")
        except Exception:
            pass

        # 공인인증서
        print("공인인증서 창 대기...")
        cert_wait = WebDriverWait(driver, 15)
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

        # ── 2. 기장등록 메뉴 이동 ────────────────────────────────
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
            "//span[contains(text(),'기장대리 수임납세자 등록')]",
            "기장대리 수임납세자 등록",
        )
        time.sleep(2)

        # ── 3. 폼 입력 ────────────────────────────────────────────
        if client_type == "individual":
            safe_click(wait, By.XPATH, "//label[@for='mf_txppWframe_taPrxClntClCd_input_0']", "개인사업자")
        else:
            safe_click(wait, By.XPATH, "//label[@for='mf_txppWframe_taPrxClntClCd_input_1']", "법인사업자")
        time.sleep(0.5)

        print(f"사업자등록번호: {biz1}-{biz2}-{biz3}")
        safe_input(driver, "mf_txppWframe_bsno1", biz1)
        safe_input(driver, "mf_txppWframe_bsno2", biz2)
        safe_input(driver, "mf_txppWframe_bsno3", biz3)

        safe_input(driver, "mf_txppWframe_resno", resident_number, "주민등록번호")

        print(f"전화번호: {phone1}-{phone2}-{phone3}")
        safe_input(driver, "mf_txppWframe_telno1", phone1)
        safe_input(driver, "mf_txppWframe_telno2", phone2)
        safe_input(driver, "mf_txppWframe_telno3", phone3)

        print("휴대전화 입력...")
        select_elem = Select(driver.find_element(By.ID, "mf_txppWframe_mp1"))
        try:
            select_elem.select_by_value(phone1)
        except Exception:
            select_elem.select_by_visible_text(phone1)
        safe_input(driver, "mf_txppWframe_mp2", phone2)
        safe_input(driver, "mf_txppWframe_mp3", phone3)

        print(f"수임일자: {today}")
        date_elem = wait.until(EC.presence_of_element_located((By.ID, "mf_txppWframe_afaDt_input")))
        date_elem.clear()
        date_elem.send_keys(today)

        if client_type == "individual":
            safe_click(
                wait,
                By.XPATH,
                "//label[@for='mf_txppWframe_infrOfrRngCd_input_0']",
                "타소득포함",
            )

        print("SUCCESS: 입력 완료 - 화면 확인 후 등록 버튼을 눌러주세요")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
