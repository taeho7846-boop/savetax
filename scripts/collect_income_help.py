"""
종합소득세 신고도움 서비스 자동 수집 (헤드리스 Chrome + Selenium)
사용법: python3 collect_income_help.py <hometax_id> <hometax_pw> <start_year> <end_year> <output_dir>
"""

import sys
import os
import time
import glob

def main():
    if len(sys.argv) < 6:
        print("ERROR: 인수 부족", file=sys.stderr)
        sys.exit(1)

    hometax_id = sys.argv[1]
    hometax_pw = sys.argv[2]
    start_year = int(sys.argv[3])
    end_year = int(sys.argv[4])
    output_dir = sys.argv[5]

    os.makedirs(output_dir, exist_ok=True)

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait, Select
    from selenium.webdriver.support import expected_conditions as EC

    # Chrome 설정
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    # PDF 다운로드 설정
    prefs = {
        "printing.print_preview_sticky_settings.appState": '{"recentDestinations":[{"id":"Save as PDF","origin":"local","account":""}],"selectedDestinationId":"Save as PDF","version":2}',
        "savefile.default_directory": output_dir,
        "download.default_directory": output_dir,
        "download.prompt_for_download": False,
        "plugins.always_open_pdf_externally": True,
    }
    options.add_experimental_option("prefs", prefs)
    options.add_argument("--kiosk-printing")

    driver = None
    try:
        driver = webdriver.Chrome(options=options)
        wait = WebDriverWait(driver, 20)

        # 1. 홈택스 접속
        print("홈택스 접속 중...")
        driver.get("https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3")
        time.sleep(3)

        # 2. 로그인
        print("로그인 중...")
        # 로그인 버튼 클릭
        login_btn = wait.until(EC.element_to_be_clickable((By.ID, "mf_wfHeader_group1503")))
        login_btn.click()
        time.sleep(1)

        # 아이디/비밀번호 탭 클릭
        id_tab = wait.until(EC.element_to_be_clickable((By.ID, "mf_txppWframe_anchor15")))
        id_tab.click()
        time.sleep(0.5)

        # 아이디 입력
        id_input = wait.until(EC.presence_of_element_located((By.ID, "mf_txppWframe_iptUserId")))
        id_input.clear()
        id_input.send_keys(hometax_id)

        # 비밀번호 입력
        pw_input = driver.find_element(By.ID, "mf_txppWframe_iptUserPw")
        pw_input.clear()
        pw_input.send_keys(hometax_pw)
        time.sleep(0.3)

        # 로그인 버튼 클릭
        submit_btn = driver.find_element(By.ID, "mf_txppWframe_anchor25")
        submit_btn.click()
        time.sleep(3)

        # 권한 팝업 처리
        try:
            allow_btn = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, "//*[normalize-space(text())='허용']"))
            )
            allow_btn.click()
            time.sleep(1)
        except:
            pass

        # 세무대리인 팝업 처리 (취소)
        try:
            cancel_btn = WebDriverWait(driver, 3).until(
                EC.element_to_be_clickable((By.XPATH, "//input[contains(@id,'btn_cancel') and @value='취소']"))
            )
            cancel_btn.click()
            time.sleep(1)
        except:
            pass

        # confirm/alert 팝업 반복 처리
        for _ in range(5):
            try:
                alert = driver.switch_to.alert
                alert.dismiss()
                time.sleep(0.5)
            except:
                break

        # 모든 팝업 창 닫기 (UTXPPABC12 등)
        for _ in range(3):
            try:
                popup_close = driver.find_element(By.XPATH, "//div[contains(@class,'w2window')]//input[@value='닫기' or @value='취소' or @value='확인']")
                popup_close.click()
                time.sleep(0.5)
            except:
                break

        # 팝업 오버레이가 사라질 때까지 대기
        time.sleep(2)

        print("로그인 완료")

        # 3. 메뉴 이동: 세금신고 → 종합소득세 신고 → 신고도움 서비스
        print("메뉴 이동 중...")
        time.sleep(1)

        # JavaScript로 직접 클릭 (팝업에 가려져도 작동)
        driver.execute_script('document.getElementById("mf_wfHeader_wq_uuid_399")?.click()')
        time.sleep(0.5)

        income_tax = wait.until(EC.presence_of_element_located(
            (By.XPATH, "//span[@escape='false' and @label='종합소득세 신고']")
        ))
        driver.execute_script("arguments[0].click()", income_tax)
        time.sleep(0.5)

        help_service = wait.until(EC.presence_of_element_located(
            (By.XPATH, "//span[contains(text(),'신고도움 서비스')]")
        ))
        driver.execute_script("arguments[0].click()", help_service)
        time.sleep(3)

        print("신고도움 서비스 페이지 도착")

        # 4. 년도별 조회 + PDF 저장
        collected = 0
        for year in range(start_year, end_year + 1):
            try:
                print(f"{year}년 조회 중...")

                # 귀속년도 선택
                select_el = wait.until(EC.presence_of_element_located((By.ID, "mf_txppWframe_selectTxyr")))
                select = Select(select_el)

                # 해당 년도가 옵션에 있는지 확인
                available_years = [o.text.strip() for o in select.options]
                if str(year) not in available_years:
                    print(f"  {year}년: 옵션 없음, 패스")
                    continue

                select.select_by_visible_text(str(year))
                time.sleep(0.5)

                # 조회 버튼 클릭 (JS로)
                driver.execute_script('document.getElementById("mf_txppWframe_trigger21")?.click()')
                time.sleep(3)

                # alert 처리
                try:
                    alert = driver.switch_to.alert
                    alert_text = alert.text
                    print(f"  {year}년: alert → {alert_text}")
                    alert.accept()
                    time.sleep(1)
                    # 데이터 없음 alert면 다음 년도로
                    continue
                except:
                    pass

                # 미리보기 버튼 클릭 (JS로)
                driver.execute_script('document.getElementById("mf_txppWframe_trigger1")?.click()')
                time.sleep(3)

                # alert 처리 (미리보기 후)
                try:
                    alert = driver.switch_to.alert
                    alert_text = alert.text
                    print(f"  {year}년: 미리보기 alert → {alert_text}")
                    alert.accept()
                    time.sleep(1)
                except:
                    pass

                # 새 창으로 전환
                windows = driver.window_handles
                if len(windows) > 1:
                    driver.switch_to.window(windows[-1])
                    time.sleep(2)

                    # PDF로 저장 (Ctrl+P → PDF)
                    pdf_path = os.path.join(output_dir, f"신고도움서비스_{year}년.pdf")

                    # CDP로 PDF 생성
                    result = driver.execute_cdp_cmd("Page.printToPDF", {
                        "printBackground": True,
                        "preferCSSPageSize": True,
                        "paperWidth": 8.27,
                        "paperHeight": 11.69,
                    })

                    import base64
                    pdf_data = base64.b64decode(result["data"])
                    with open(pdf_path, "wb") as f:
                        f.write(pdf_data)

                    print(f"  {year}년: PDF 저장 완료 → {pdf_path}")
                    collected += 1

                    # 새 창 닫고 원래 창으로
                    driver.close()
                    driver.switch_to.window(windows[0])
                    time.sleep(1)
                else:
                    print(f"  {year}년: 미리보기 창이 열리지 않음")

            except Exception as e:
                print(f"  {year}년: 오류 - {str(e)[:200]}", file=sys.stderr)
                # 원래 창으로 복귀 시도
                try:
                    windows = driver.window_handles
                    driver.switch_to.window(windows[0])
                except:
                    pass

        print(f"SUCCESS: {collected}건 수집 완료")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
