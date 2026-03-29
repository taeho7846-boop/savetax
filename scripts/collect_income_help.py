"""
종합소득세 신고도움 서비스 자동 수집 (헤드리스 Chrome + Selenium + JS 기반)
사용법: python3 collect_income_help.py <hometax_id> <hometax_pw> <start_year> <end_year> <output_dir>
"""

import sys
import os
import time
import base64

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
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    driver = None
    try:
        driver = webdriver.Chrome(options=options)
        driver.set_page_load_timeout(30)

        # alert 자동 처리 함수
        def dismiss_alerts():
            for _ in range(5):
                try:
                    alert = driver.switch_to.alert
                    txt = alert.text
                    print(f"  alert 처리: {txt}")
                    alert.accept()
                    time.sleep(0.5)
                except:
                    break

        def js(script):
            """JS 실행 + alert 처리"""
            try:
                result = driver.execute_script(script)
                time.sleep(0.3)
                dismiss_alerts()
                return result
            except Exception as e:
                dismiss_alerts()
                return None

        def wait_for(element_id, timeout=15):
            """요소가 나타날 때까지 대기"""
            for _ in range(timeout * 2):
                if js(f'return !!document.getElementById("{element_id}")'):
                    return True
                time.sleep(0.5)
            return False

        # 1. 홈택스 접속
        print("홈택스 접속 중...")
        driver.get("https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&menuCd=index3")
        time.sleep(4)
        dismiss_alerts()

        # 2. 로그인
        print("로그인 중...")
        js('document.getElementById("mf_wfHeader_group1503")?.click()')
        time.sleep(1)
        js('document.getElementById("mf_txppWframe_anchor15")?.click()')
        time.sleep(0.5)

        # 아이디/비밀번호 입력 (JS로)
        js(f'''
            var id = document.getElementById("mf_txppWframe_iptUserId");
            if(id) {{ id.value = "{hometax_id}"; id.dispatchEvent(new Event("input", {{bubbles:true}})); }}
            var pw = document.getElementById("mf_txppWframe_iptUserPw");
            if(pw) {{ pw.value = "{hometax_pw}"; pw.dispatchEvent(new Event("input", {{bubbles:true}})); }}
        ''')
        time.sleep(0.3)
        js('document.getElementById("mf_txppWframe_anchor25")?.click()')
        time.sleep(4)
        dismiss_alerts()

        # 팝업 모두 닫기
        for _ in range(5):
            closed = js('''
                var btns = document.querySelectorAll("input[value='취소'], input[value='닫기'], input[value='확인']");
                var popup = null;
                btns.forEach(function(b) {
                    var parent = b.closest(".w2window, .w2popup_window");
                    if (parent && parent.style.display !== "none") {
                        if (b.value === "취소") { b.click(); popup = "취소"; }
                        else if (b.value === "닫기") { b.click(); popup = "닫기"; }
                    }
                });
                return popup;
            ''')
            if not closed:
                break
            print(f"  팝업 닫기: {closed}")
            time.sleep(0.5)

        print("로그인 완료")

        # 3. 메뉴 이동
        print("메뉴 이동 중...")
        time.sleep(1)
        js('document.getElementById("mf_wfHeader_wq_uuid_399")?.click()')
        time.sleep(0.5)

        # 종합소득세 신고 메뉴
        js('''
            var spans = document.querySelectorAll("span[label='종합소득세 신고']");
            if(spans.length > 0) spans[0].click();
        ''')
        time.sleep(0.5)

        # 신고도움 서비스
        js('''
            var spans = document.querySelectorAll("span");
            for(var i=0; i<spans.length; i++) {
                if(spans[i].textContent.trim().indexOf("신고도움 서비스") >= 0) {
                    spans[i].click(); break;
                }
            }
        ''')
        time.sleep(4)
        dismiss_alerts()

        # 페이지 로드 확인
        if not wait_for("mf_txppWframe_selectTxyr"):
            print("ERROR: 신고도움 서비스 페이지 로드 실패", file=sys.stderr)
            sys.exit(1)

        print("신고도움 서비스 페이지 도착")

        # 사용 가능한 년도 확인
        available = js('''
            var sel = document.getElementById("mf_txppWframe_selectTxyr");
            if(!sel) return [];
            var years = [];
            for(var i=0; i<sel.options.length; i++) years.push(sel.options[i].text.trim());
            return years;
        ''') or []
        print(f"  사용 가능한 년도: {available}")

        # 4. 년도별 조회 + PDF 저장
        collected = 0
        for year in range(start_year, end_year + 1):
            try:
                year_str = str(year)
                if year_str not in available:
                    print(f"  {year}년: 옵션 없음, 패스")
                    continue

                print(f"  {year}년 조회 중...")

                # 년도 선택 + 조회 (JS)
                js(f'''
                    var sel = document.getElementById("mf_txppWframe_selectTxyr");
                    if(sel) {{
                        sel.value = "{year_str}";
                        sel.dispatchEvent(new Event("change", {{bubbles:true}}));
                    }}
                ''')
                time.sleep(0.5)

                js('document.getElementById("mf_txppWframe_trigger21")?.click()')
                time.sleep(4)
                dismiss_alerts()

                # 미리보기 클릭
                js('document.getElementById("mf_txppWframe_trigger1")?.click()')
                time.sleep(4)
                dismiss_alerts()

                # 새 창 확인
                windows = driver.window_handles
                if len(windows) > 1:
                    driver.switch_to.window(windows[-1])
                    time.sleep(3)

                    # CDP로 PDF 생성
                    pdf_path = os.path.join(output_dir, f"신고도움서비스_{year}년.pdf")
                    result = driver.execute_cdp_cmd("Page.printToPDF", {
                        "printBackground": True,
                        "preferCSSPageSize": True,
                        "paperWidth": 8.27,
                        "paperHeight": 11.69,
                    })

                    pdf_data = base64.b64decode(result["data"])
                    with open(pdf_path, "wb") as f:
                        f.write(pdf_data)

                    print(f"  {year}년: PDF 저장 완료")
                    collected += 1

                    driver.close()
                    driver.switch_to.window(windows[0])
                    time.sleep(1)
                else:
                    print(f"  {year}년: 미리보기 창 없음, 패스")

            except Exception as e:
                err_msg = str(e)[:150]
                print(f"  {year}년: 오류 - {err_msg}", file=sys.stderr)
                dismiss_alerts()
                try:
                    windows = driver.window_handles
                    driver.switch_to.window(windows[0])
                except:
                    pass

        print(f"SUCCESS: {collected}건 수집 완료")

    except Exception as e:
        print(f"ERROR: {str(e)[:300]}", file=sys.stderr)
        sys.exit(1)
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
