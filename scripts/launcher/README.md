# Savetax App Launcher

savetax 웹페이지에서 데스크톱 앱 실행 / 파일탐색기 열기 기능.

## 설치 (PC당 1회)

1. `launcher.ps1` 와 `install.bat` 두 파일을 **같은 폴더**에 둠
2. `install.bat` **더블클릭**
3. "설치 완료!" 메시지 확인 후 종료

설치 후 `%USERPROFILE%\savetax-launcher\launcher.ps1` 위치에 복사되며, 레지스트리에 `savetax-app://` 프로토콜이 등록됩니다 (HKCU, 관리자권한 불필요).

## 사용법

웹페이지에서 다음 URL을 열면 동작합니다:

- 파일탐색기 열기:
  ```
  savetax-app://folder?path=G:\공유 드라이브\고객사 관리\김태호\쇠터닭갈비
  ```
- 데스크톱 앱/단축키 실행:
  ```
  savetax-app://launch?path=C:\Users\aaron\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Chrome 앱\YouTube Music.lnk
  ```

처음 호출 시 Chrome이 "이 사이트가 savetax-app을(를) 열려고 합니다" 라고 묻습니다. **"항상 허용"** 체크 후 열기.

- 원천세 자동신고(위하고 전자신고 파일 제작) 폴더 선택 창 자동 확인:
  ```
  savetax-app://efile-dialog?count=2&timeout=240
  ```
  위하고 필수 에이전트가 띄우는 "폴더 선택" 창을 찾아 확인을 누르고, 선택된 폴더에 생긴 전자신고 파일
  (YYYYMMDDC103900.01 원천세 / YYYYMMDDA103900.1 지방소득세)을 `C:\savetax-efile\`로 복사한 뒤 `latest.json`에 기록합니다.
  크롬 확장이 이 기록을 읽어 서버에 올리고 홈택스·위택스에 넣습니다. **launcher.ps1이 바뀌었으므로 PC마다 install.bat을 다시 실행**하세요.

## 디버깅

문제 발생 시 `%USERPROFILE%\savetax-launcher\launcher.log` 확인.

## 제거

```powershell
Remove-Item 'HKCU:\Software\Classes\savetax-app' -Recurse -Force
Remove-Item "$env:USERPROFILE\savetax-launcher" -Recurse -Force
```
