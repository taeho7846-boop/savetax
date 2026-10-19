/** 세모리포트 월별 매입매출 수집 — 진행 상태(AppConfig) 키와 타입. 집계·화면은 이 타입을 공유한다. */

export const SEMO_LEDGER_RUN_KEY = "semoLedger:run";

export type SemoLedgerRun = {
  startedAt: string;
  finishedAt: string | null;
  years: string[];
  total: number;        // 세모리포트 거래처 수
  done: number;         // 처리한 거래처 수
  matched: number;      // 우리 거래처와 매칭돼 저장된 수
  rows: number;         // 저장(upsert)한 월 행 수
  unmatched: { name: string; bizNo: string }[]; // 세모에는 있는데 우리 범위에 없는 거래처
  error: string | null;
  byUserId: number;
};

/** 세모리포트 고객 매입매출장 화면 — 확장이 이 주소에 해시 파라미터를 붙여 연다 */
export const SEMO_LEDGER_PAGE = "https://reportmgmt.appplay.co.kr/analy_book_001.act";
