// 원천세 자동신고 3단계 — 홈택스 파일변환신고 (원천세 전자신고 파일 검증 → 사람 확인 → 제출 → 접수번호)
//  이 탭이 제출 작업 탭(background가 탭 번호로 기억)일 때만 동작한다. 평소 홈택스 사용에는 관여하지 않는다.
//
//  화면(2026-10 실측, 세금신고 > 원천세 신고 > 일반신고 > 파일변환신고 = 프로그램 UTERNAAZ0Z11):
//   menuAtag_4106010000(일반신고) → …btn_cbcMediRtn(파일변환신고) → …btn_selFileB(파일선택, 업로드 컴포넌트 iframe)
//   → …btn_cenSts(파일검증하기) → 비밀번호 팝업 UTERNAAZ65(…_wframe_input1 / trigger12 확인)
//   → 결과 …tbx_frVrfFileName, tbx_tbfleFrVrfTrgtScnt(대상), tbx_tbfleFrVrfErrScnt(형식오류), tbx_tbcntnVrfErrScnt(내용오류), tbx_tbcntnVrfNrmlScnt(정상)
//   → …btn_rigSts(제출하러 가기) → 전자파일제출 목록 [전자파일 제출하기] → 접수증 팝업 UTERNAAZ02(접수번호 236-2026-2-5055…)
//  id 앞부분(mf_txppWframe_pf_UTERNAAZ0Z11_ 등)은 화면에 따라 달라질 수 있어 "끝부분 일치"로 찾는다.
(async function () {
  if (window !== window.top) return;
  if (location.pathname.includes("popup.html")) return;
  const S = window.__stSubmit;
  if (!S) return;
  const me = await S.start("income", "원천세 홈택스 제출");
  if (!me) return;
  const { sleep, visible, txt, waitFor } = S;
  const RECEIPT_RE = /\d{3}-\d{4}-\d-\d{9,15}/g;

  const all = (suffix) => [...document.querySelectorAll(`[id$="${suffix}"]`)];
  const q = (suffix) => all(suffix).find(visible) || null;
  const val = (suffix) => { const el = all(suffix)[0]; return el ? txt(el) : ""; };
  const loggedIn = () => [...document.querySelectorAll("a,button,span,input")].some(e => visible(e) && txt(e).length <= 8 && txt(e).includes("로그아웃"));
  const centerOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  const receiptsOnPage = () => [...new Set(((document.body && document.body.innerText) || "").match(RECEIPT_RE) || [])];
  const startedAt = Date.now();

  try {
    if (me.phase === "done") return;
    if (me.phase === "await") {
      // 검증 뒤 사람 확인을 기다리던 중에 화면이 새로고침됨 → 검증 화면이 사라졌으므로 처음부터 다시 해야 함
      await S.fail("검증 화면이 새로고침되어 제출을 이어갈 수 없습니다. [검증 · 제출]을 다시 눌러 주세요");
      return;
    }
    if (me.phase === "submit") { await submitPhase(); return; }

    // ---------- 1) 로그인 확인 ----------
    await S.report("running", "홈택스 여는 중…");
    const ok = await waitFor(loggedIn, 20000, 500);
    if (!ok) {
      await S.fail("홈택스에 세무대리인으로 로그인되어 있지 않습니다. 사이트의 홈택스 로그인 버튼으로 로그인한 뒤 [검증 · 제출]을 다시 눌러 주세요");
      return;
    }
    const d = await S.detail();
    if (!d || !d.ok) { await S.fail("작업 정보를 받지 못했습니다: " + (d && d.error)); return; }
    if (d.cancelled) { await S.setPhase(null); return; }
    S.clearNotes();
    S.setMode("verify");

    // ---------- 2) 파일변환신고 화면으로 ----------
    await S.report("running", "파일변환신고 화면으로 이동 중…");
    if (!q("_btn_selFileB")) {
      if (!q("btn_cbcMediRtn")) {
        const menu = document.getElementById("menuAtag_4106010000");
        if (!menu) { await S.fail("홈택스 메뉴(원천세 일반신고)를 찾지 못했습니다", { since: startedAt, diag: true }); return; }
        menu.click();
      }
      const conv = await waitFor(() => q("btn_cbcMediRtn") || q("_btn_selFileB"), 25000, 400);
      if (!conv) { await S.fail("원천세 일반신고 화면이 열리지 않았습니다", { since: startedAt, diag: true }); return; }
      if (!q("_btn_selFileB")) { await sleep(600); conv.click(); }
    }
    const selBtn = await waitFor(() => q("_btn_selFileB"), 25000, 400);
    if (!selBtn) { await S.fail("파일변환신고 화면(파일선택 버튼)을 찾지 못했습니다", { since: startedAt, diag: true }); return; }
    await sleep(1500); // 업로드 컴포넌트 iframe 로드 여유

    // ---------- 3) 파일 넣기 ----------
    await S.report("running", `파일 넣는 중… ${d.fileName}`);
    const shown = async (ms) => !!(await waitFor(async () => { const r = await S.bg({ type: "efile-submit-frames-text", needle: d.fileName }); return r && r.shown; }, ms, 600));
    let fileOk = false, how = "";
    const r1 = await S.bg({ type: "efile-submit-set-file", fileName: d.fileName, base64: d.fileBase64 });
    if (r1 && r1.ok) { fileOk = await shown(5000); how = "직접 넣기"; }
    if (!fileOk) {
      // 대화상자를 가로채 사람이 고르는 것과 같은 경로로 넣는다
      selBtn.scrollIntoView({ block: "center" });
      await sleep(400);
      const c = centerOf(selBtn);
      const r2 = await S.bg({ type: "efile-submit-choose-file", x: c.x, y: c.y, fileName: d.fileName, base64: d.fileBase64 });
      if (r2 && r2.ok) { fileOk = await shown(8000); how = "파일선택 버튼"; if (!fileOk) { fileOk = true; how += "(목록 표시 미확인)"; } }
      else console.log("[SaveTax 제출] 파일선택 가로채기 실패:", r2 && r2.error);
    }
    if (!fileOk) {
      await S.fail("홈택스에 파일을 넣지 못했습니다" + (r1 && r1.error ? " (" + r1.error + ")" : ""), { since: startedAt, diag: true });
      return;
    }
    console.log("[SaveTax 제출] 파일 넣기:", how);

    // ---------- 4) 파일검증하기 → 비밀번호 ----------
    const cen = await waitFor(() => q("_btn_cenSts"), 10000, 300);
    if (!cen) { await S.fail("[파일검증하기] 버튼을 찾지 못했습니다", { since: startedAt, diag: true }); return; }
    await S.report("running", "파일 검증 요청 중…");
    const beforeVerify = Date.now();
    cen.click();
    const pwInput = await waitFor(() => q("UTERNAAZ65_wframe_input1") || [...document.querySelectorAll('[id*="UTERNAAZ65"] input[type=password]')].find(visible), 20000, 300);
    if (!pwInput) { await S.fail("비밀번호 입력 창이 열리지 않았습니다 (파일이 등록되지 않았을 수 있음)", { since: beforeVerify, diag: true }); return; }
    await sleep(500);
    // 크롬 자동완성이 다른 비밀번호를 채워 넣는 경우가 있어 반드시 비우고 입력
    S.setInput(pwInput, "");
    pwInput.focus();
    const typed = await S.bg({ type: "efile-type-keys", text: d.password });
    await sleep(300);
    if (!typed || !typed.ok || pwInput.value !== d.password) S.setInput(pwInput, d.password);
    await sleep(300);
    const pwOk = q("UTERNAAZ65_wframe_trigger12") || [...document.querySelectorAll('[id*="UTERNAAZ65"] input[type=button],[id*="UTERNAAZ65"] button,[id*="UTERNAAZ65"] a')].find(e => visible(e) && /^확인$/.test(txt(e)));
    if (!pwOk) { await S.fail("비밀번호 창의 [확인] 버튼을 찾지 못했습니다", { since: beforeVerify, diag: true }); return; }
    pwOk.click();

    // ---------- 5) 검증 결과 읽기 ----------
    await S.report("running", "형식·내용 검증 중…");
    const read = () => ({
      fileName: val("_tbx_frVrfFileName"),
      target: S.num(val("_tbx_tbfleFrVrfTrgtScnt")),
      formatErr: S.num(val("_tbx_tbfleFrVrfErrScnt")),
      contentErr: S.num(val("_tbx_tbcntnVrfErrScnt")),
      normal: S.num(val("_tbx_tbcntnVrfNrmlScnt")),
    });
    let v = null, stable = 0, last = "";
    const until = Date.now() + 120000;
    while (Date.now() < until) {
      await sleep(1000);
      const cur = read();
      const has = cur.fileName && (cur.normal !== null || cur.formatErr !== null || cur.contentErr !== null);
      const sig = JSON.stringify(cur);
      if (has && sig === last) { if (++stable >= 2) { v = cur; break; } } else stable = 0;
      last = sig;
      // 비밀번호 오류 등 안내가 떴으면 바로 중단
      const n = S.notes(beforeVerify);
      if (n.some(m => /비밀번호|일치하지|오류|올바르지|실패/.test(m)) && !has) break;
    }
    if (!v) { await S.fail("검증 결과를 읽지 못했습니다", { since: beforeVerify, diag: true }); return; }
    v.notes = S.notes(beforeVerify);
    if (d.fileName && v.fileName && v.fileName !== d.fileName) {
      await S.fail(`홈택스가 검증한 파일(${v.fileName})이 올린 파일(${d.fileName})과 다릅니다`, { verify: v }); return;
    }
    if ((v.formatErr || 0) > 0 || (v.contentErr || 0) > 0 || !v.normal) {
      await S.fail(`검증에서 오류가 나왔습니다 · 형식 오류 ${v.formatErr ?? "?"} · 내용 오류 ${v.contentErr ?? "?"} · 정상 ${v.normal ?? "?"} (홈택스 탭에서 오류 내용을 확인하세요)`, { verify: v });
      return;
    }

    // ---------- 6) 사람 확인 대기 ----------
    S.setMode("");
    await S.setPhase("await");
    await S.report("verified", `검증 완료 · 정상 ${v.normal}건 · 오류 0건 — 사이트에서 [제출]을 누르면 제출합니다`, { verify: v });
    const c = await S.waitConfirm();
    if (c !== "confirmed") {
      S.showBanner(c === "cancelled" ? "취소됨 — 제출하지 않았습니다" : "제출 확인을 받지 못해 중단했습니다 (제출하지 않음)", "#6B7684");
      await S.setPhase(null);
      return;
    }
    await S.setPhase("submit");
    await submitPhase();
  } catch (e) {
    console.error(e);
    await S.fail("예상하지 못한 오류: " + ((e && e.message) || e), { since: startedAt, diag: true });
  }

  // ---------- 7) 제출 (사람이 사이트에서 [제출]을 누른 뒤에만 여기로 온다) ----------
  async function submitPhase() {
    const t0 = Date.now();
    S.setMode("submit");
    const r = await S.report("submitting", "제출 화면으로 이동 중…");
    if (!r || !r.ok) {
      // 서버가 "제출 확인 전"이라고 답하면 절대 누르지 않는다
      S.setMode("");
      S.showBanner("제출 확인을 확인하지 못해 중단했습니다 (제출하지 않음)", "#DC2626");
      await S.setPhase(null);
      return;
    }
    // 제출 전부터 화면에 있던 접수번호는 제외한다 (제출 버튼을 누른 뒤 새로 나타난 번호만 접수번호로 인정)
    //  제출 뒤 화면이 새로 열려도 이어갈 수 있게, 누르기 직전의 목록을 sessionStorage에 남겨 둔다
    let before;
    try { before = new Set(JSON.parse(sessionStorage.getItem("savetax_efile_before") || "null") || receiptsOnPage()); }
    catch (e) { before = new Set(receiptsOnPage()); }
    const findSubmit = () => [...document.querySelectorAll("input[type=button],button,a")].find(e => visible(e) && /전자파일\s*제출하기/.test(txt(e)));
    let clicked = sessionStorage.getItem("savetax_efile_clicked") === me.jobId;
    let wentTo = false;
    const until = Date.now() + 120000;
    let receipts = [];
    while (Date.now() < until) {
      receipts = receiptsOnPage().filter(x => !before.has(x));
      if (clicked && receipts.length) break;
      if (!clicked) {
        const sb = findSubmit();
        if (sb) {
          await sleep(800);
          await S.report("submitting", "전자파일 제출 중…");
          before = new Set(receiptsOnPage());
          sessionStorage.setItem("savetax_efile_before", JSON.stringify([...before]));
          sessionStorage.setItem("savetax_efile_clicked", me.jobId);
          clicked = true;
          sb.click();
        } else if (!wentTo) {
          const go = q("_btn_rigSts");
          if (go) { wentTo = true; go.click(); }
        }
      }
      await sleep(700);
    }
    S.setMode("");
    if (!clicked) {
      await S.fail("제출 화면에서 [전자파일 제출하기] 버튼을 찾지 못했습니다. 아직 제출되지 않았습니다 — 홈택스 탭에서 직접 눌러 주세요", { since: t0, diag: true });
      return;
    }
    if (!receipts.length) {
      await S.api("POST", "/api/withholding/filing/submit-result", {
        jobId: me.jobId, kind: me.kind,
        error: "제출 버튼은 눌렀지만 접수증을 확인하지 못했습니다. 홈택스 신고내역 조회에서 접수 여부를 꼭 확인하세요" + (S.notes(t0).length ? " · 사이트 안내: " + S.notes(t0).slice(-3).join(" / ") : ""),
      });
      S.showBanner("접수증을 확인하지 못했습니다 — 신고내역 조회에서 접수 여부를 확인하세요", "#DC2626");
      await S.setPhase(null);
      return;
    }
    // 접수증 팝업(UTERNAAZ02)의 글자와 행
    const pop = [...document.querySelectorAll('[id*="UTERNAAZ02"]')].filter(visible).sort((a, b) => b.innerText.length - a.innerText.length)[0] || document.body;
    const hasReceipt = (t) => /\d{3}-\d{4}-\d-\d{9,15}/.test(t);
    const rows = [...pop.querySelectorAll("tr")].map(txt).filter(hasReceipt).slice(0, 300);
    const res = await S.api("POST", "/api/withholding/filing/submit-result", {
      jobId: me.jobId, kind: me.kind, receipts, rows, raw: txt(pop).slice(0, 5000),
    });
    if (!res || !res.ok) {
      S.showBanner(`제출은 됐습니다(접수번호 ${receipts[0]}) — 사이트 기록 실패: ${res && res.error}`, "#DC2626");
    } else {
      S.showBanner(`제출 완료 · 접수번호 ${receipts.length === 1 ? receipts[0] : receipts.length + "건"}`, "#15803D");
    }
    sessionStorage.removeItem("savetax_efile_clicked");
    sessionStorage.removeItem("savetax_efile_before");
    await S.setPhase("done");
  }
})();
