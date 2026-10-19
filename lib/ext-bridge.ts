/**
 * SaveTax 크롬 확장 다리 — 앱 페이지에서 window.postMessage 로 확장(content-savetax-app.js)에 요청하고 응답을 기다린다.
 * 서버 의존성 없음(클라이언트 컴포넌트에서 사용). 확장이 없으면 null.
 *  - ping: { ok, version }
 *  - open-hidden: { urls } → 최소화된 별도 창에서 열기 (화면에 안 뜸)
 */
export function extCall<T = { ok: boolean; error?: string }>(type: string, payload?: Record<string, unknown>, timeoutMs = 4000): Promise<T | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(null); return; }
    const id = `app${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "savetax-ext" || d.id !== id) return;
      window.removeEventListener("message", onMsg); clearTimeout(t);
      resolve(d as T);
    };
    const t = setTimeout(() => { window.removeEventListener("message", onMsg); resolve(null); }, timeoutMs);
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "savetax-app", id, type, payload: payload || {} }, "*");
  });
}

/** 확장이 설치·활성화돼 있는지 (1.5초 안에 응답 없으면 없음으로 본다) */
export async function extAvailable(): Promise<{ ok: boolean; version?: string }> {
  const r = await extCall<{ ok: boolean; version?: string }>("ping", {}, 1500);
  return r?.ok ? { ok: true, version: r.version } : { ok: false };
}

/** 숨긴 창으로 열기. 확장이 없으면 새 탭으로 폴백. 팝업 차단이면 false */
export async function openHiddenOrTab(urls: string[]): Promise<{ ok: boolean; hidden: boolean; tabs: Window[] }> {
  const res = await extCall("open-hidden", { urls });
  if (res?.ok) return { ok: true, hidden: true, tabs: [] };
  const tabs: Window[] = [];
  for (const u of urls) {
    const w = window.open(u, "_blank");
    if (!w) return { ok: false, hidden: false, tabs };
    tabs.push(w);
  }
  return { ok: true, hidden: false, tabs };
}
