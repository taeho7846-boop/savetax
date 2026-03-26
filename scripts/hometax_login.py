"""
홈택스 로그인 자동화 스크립트
Usage: python hometax_login.py <hometaxId> <hometaxPw> <residentNumber>
"""

import sys
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options


def main():
    if len(sys.argv) < 4:
        print("ERROR: 인수 부족 (hometaxId, hometaxPw, residentNumber 필요)", file=sys.stderr)
        sys.exit(1)

    hometax_id = sys.argv[1]
    hometax_pw = sys.argv[2]
    resident_number = sys.argv[3] if len(sys.argv) > 3 else ""

    # 주민등록번호 파싱 (XXXXXX-XXXXXXX 또는 XXXXXXXXXXXXX)
    rn = resident_number.replace("-", "").replace(" ", "")
    jumin1 = rn[:6] if len(rn) >= 6 else ""
    jumin2 = rn[6]  if len(rn) >= 7 else ""

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
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

        # 5-1. 권한 팝업 처리 (있을 경우만)
        time.sleep(0.5)
        try:
            perm_wait = WebDriverWait(driver, 2)
            allow_elem = perm_wait.until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//*[normalize-space(text())='허용']")
                )
            )
            allow_elem.click()
            print("권한 허용 완료")
        except Exception:
            pass

        # 6~8. 주민등록번호 입력 (화면에 나타날 때만)
        if jumin1:
            try:
                print("주민등록번호 입력창 대기...")
                jumin_wait = WebDriverWait(driver, 10)
                elem1 = jumin_wait.until(
                    EC.presence_of_element_located(
                        (By.ID, "mf_txppWframe_UTXPPABC12_wframe_iptUserJuminNo1")
                    )
                )

                # 클릭 후 JS로 값 설정 + 이벤트 발생
                elem1.click()
                driver.execute_script(
                    "arguments[0].value = arguments[1];"
                    "arguments[0].dispatchEvent(new Event('input', {bubbles:true}));"
                    "arguments[0].dispatchEvent(new Event('change', {bubbles:true}));",
                    elem1, jumin1
                )
                print(f"주민번호 앞자리 입력: {jumin1}")

                elem2 = driver.find_element(
                    By.ID, "mf_txppWframe_UTXPPABC12_wframe_iptUserJuminNo2"
                )
                elem2.click()
                driver.execute_script(
                    "arguments[0].value = arguments[1];"
                    "arguments[0].dispatchEvent(new Event('input', {bubbles:true}));"
                    "arguments[0].dispatchEvent(new Event('change', {bubbles:true}));",
                    elem2, jumin2
                )
                print(f"주민번호 뒷자리 첫째 입력: {jumin2}")

                confirm = jumin_wait.until(
                    EC.element_to_be_clickable(
                        (By.ID, "mf_txppWframe_UTXPPABC12_wframe_trigger46")
                    )
                )
                confirm.click()
                print("주민등록번호 확인 클릭")

            except Exception as e:
                print(f"주민등록번호 입력 실패: {e}", file=sys.stderr)

        # 로그인 완료 대기
        time.sleep(3)

        print("SUCCESS: 홈택스 로그인 완료")
        # 브라우저는 닫지 않음 - 사용자가 이어서 작업

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
