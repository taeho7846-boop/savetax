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

## 디버깅

문제 발생 시 `%USERPROFILE%\savetax-launcher\launcher.log` 확인.

## 제거

```powershell
Remove-Item 'HKCU:\Software\Classes\savetax-app' -Recurse -Force
Remove-Item "$env:USERPROFILE\savetax-launcher" -Recurse -Force
```
