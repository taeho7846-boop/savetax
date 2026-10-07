// 원천세 자동신고 3·4단계 공통 도우미 (홈택스·위택스 content script가 같이 쓴다 — 격리 world 전역 __stSubmit)
//  - 이 탭이 맡은 작업 확인(whoami) / 단계 기록 / 서버 보고 / 화면 배너 / 사이트의 [제출] 확인 대기
//  - 제출 버튼은 사이트에서 사람이 [제출]을 누른 뒤(confirmed)에만 누른다. 그 전에는 검증까지만 한다.
(function () {
  if (window.__stSubmit) return;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const visible = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const txt = (el) => ((el && (el.innerText || el.value)) || "").replace(/\s+/g, " ").trim();
  const bg = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : res)); }
    catch (e) { resolve({ ok: false, error: e.message }); }
  });
  const api = (method, path, body) => bg({ type: "efile-api", method, path, body });
  async function waitFor(fn, timeoutMs = 20000, step = 300) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try { const v = await fn(); if (v) return v; } catch (e) {}
      await sleep(step);
    }
    return null;
  }

  let me = null;          // { jobId, kind, phase }
  let label = "";
  let banner = null;
  function showBanner(msg, color) {
    if (!banner) {
      banner = document.createElement("div");
      banner.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;color:#fff;font:600 13px/1.4 sans-serif;padding:8px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:80vw;pointer-events:none";
      document.documentElement.appendChild(banner);
    }
    banner.style.background = color || "#1B64DA";
    banner.textContent = `SaveTax ${label} · ${msg}`;
  }

  // 사이트가 띄운 alert/confirm 문구 (efile-alert-hook.js가 sessionStorage에 적어 둠)
  function notes(sinceMs) {
    try {
      const a = JSON.parse(sessionStorage.getItem("savetax_efile_alerts") || "[]");
      return a.filter(x => !sinceMs || x.t >= sinceMs).map(x => (x.k === "confirm" ? "[확인창] " : "") + x.m);
    } catch (e) { return []; }
  }
  function clearNotes() { try { sessionStorage.removeItem("savetax_efile_alerts"); } catch (e) {} }
  // mode: "verify"(검증 중 — 안내창 자동 닫기) | "submit"(사람이 확인한 제출 진행 중) | ""(자동 처리 끔)
  function setMode(mode) {
    try { if (mode) sessionStorage.setItem("savetax_efile_mode", mode); else sessionStorage.removeItem("savetax_efile_mode"); } catch (e) {}
  }

  // 지금 화면에 보이는 버튼 글자 (오류 원인 파악용)
  function buttonsOnScreen(limit = 25) {
    const out = [];
    for (const el of document.querySelectorAll("input[type=button],input[type=submit],button,a")) {
      if (!visible(el)) continue;
      const t = txt(el);
      if (!t || t.length > 24) continue;
      if (!out.includes(t)) out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  }

  async function report(state, msg, extra) {
    const color = state === "error" ? "#DC2626" : state === "verified" ? "#B45309" : state === "done" ? "#15803D" : "#1B64DA";
    showBanner(msg, color);
    console.log("[SaveTax 제출]", label, state, msg);
    if (!me) return null;
    return api("PATCH", "/api/withholding/filing/submit", { jobId: me.jobId, kind: me.kind, state, message: msg, ...(extra || {}) });
  }
  async function fail(msg, opts) {
    const o = opts || {};
    const n = notes(o.since);
    const full = msg + (n.length ? " · 사이트 안내: " + n.slice(-3).join(" / ") : "") + (o.diag ? " · 화면 버튼: " + buttonsOnScreen().join(", ") : "");
    setMode("");
    await report("error", full.slice(0, 580), o.verify ? { verify: o.verify } : undefined);
    await setPhase(null);
  }
  async function setPhase(patch) {
    const r = await bg({ type: "efile-submit-phase", patch: patch === null ? null : (typeof patch === "string" ? { phase: patch } : patch) });
    if (r && r.entry) me = r.entry;
    return r;
  }
  async function detail() {
    return api("GET", `/api/withholding/filing/submit?id=${encodeURIComponent(me.jobId)}&kind=${me.kind}&detail=1`);
  }
  // 사이트에서 사람이 [제출]을 누를 때까지 기다린다. 반환: "confirmed" | "cancelled" | "timeout" | "gone"
  async function waitConfirm(timeoutMs = 40 * 60 * 1000) {
    const end = Date.now() + timeoutMs;
    let misses = 0;
    while (Date.now() < end) {
      const r = await api("GET", `/api/withholding/filing/submit?id=${encodeURIComponent(me.jobId)}&kind=${me.kind}&detail=1&poll=1`);
      if (r && r.ok) {
        misses = 0;
        if (r.cancelled) return "cancelled";
        if (r.confirmed) return "confirmed";
      } else if (++misses >= 8) return "gone";
      await sleep(2000);
    }
    return "timeout";
  }

  // 이 탭이 제출 작업 탭인지 확인. kind가 다르면 null
  async function start(kind, kindLabel) {
    const r = await bg({ type: "efile-submit-whoami" });
    if (!r || !r.jobId || r.kind !== kind) return null;
    me = r; label = kindLabel;
    return me;
  }

  function setInput(el, value) {
    el.focus();
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }
  const num = (s) => { const m = String(s == null ? "" : s).replace(/,/g, "").match(/-?\d+/); return m ? Number(m[0]) : null; };

  window.__stSubmit = {
    sleep, visible, txt, bg, api, waitFor, showBanner, notes, clearNotes, setMode, buttonsOnScreen,
    report, fail, setPhase, detail, waitConfirm, start, setInput, num,
    get me() { return me; },
  };
})();
