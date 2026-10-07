// 원천세 자동신고 4단계 — 위택스 지방소득세 특별징수 회계파일신고 (파일 업로드 → 서식검증 → 사람 확인 → 제출 → 일괄신고ID)
//  이 탭이 제출 작업 탭(background가 탭 번호로 기억)일 때만 동작한다. 평소 위택스 사용에는 관여하지 않는다.
//
//  화면(2026-10 실측, 세무대리인 공동인증서 로그인 상태):
//   1단계 신고서업로드   /etr/lit/b0701/B070101M31.do : input#file_upload_0_(파일), input#filePw(파일비밀번호), a#btn_next(파일변환하기)
//   2단계 서식검증·제출   /etr/lit/b0701/B070101M32.do : "정상 신고 내역 N건" 표, a#btn_prev(이전), a#btn_next(제출하기)
//   3단계 제출결과확인   /etr/lit/b0701/B070101M33.do : "제출처리중, 일괄신고목록에서 확인"
//   일괄신고 내역        /etr/lit/b0701/B070102M02.do : 행별 일괄신고ID(20자리)·대표납세자명·신고일자·검증/제출 건수
//  페이지가 통째로 바뀌므로 단계(phase)를 background에 적어 두고, 새 페이지에서 이어서 진행한다.
(async function () {
  if (window !== window.top) return;
  const S = window.__stSubmit;
  if (!S) return;
  const me = await S.start("local", "지방소득세 위택스 제출");
  if (!me) return;
  const { sleep, visible, txt, waitFor } = S;
  const P = "/etr/lit/b0701/";
  const URL_UPLOAD = P + "B070101M31.do", URL_LIST = P + "B070102M02.do";
  const on = (name) => location.pathname.indexOf(name) !== -1;
  const bodyText = () => ((document.body && document.body.innerText) || "");
  const loggedIn = () => [...document.querySelectorAll("a,button,span")].some(e => visible(e) && txt(e).length <= 8 && txt(e).includes("로그아웃"));
  const t0 = Date.now();

  try {
    if (me.phase === "done") return;

    // ---------- 1단계: 파일 업로드 ----------
    if (me.phase === "start") {
      await S.report("running", "위택스 여는 중…");
      let fileInput = on("B070101M31") ? await waitFor(() => document.querySelector("#file_upload_0_"), 12000, 400) : null;
      if (!fileInput) {
        if (loggedIn()) {
          // 로그인은 됐는데 업로드 화면이 아님 → 업로드 화면으로 (무한 이동 방지: 최대 3번)
          const tries = (me.navTries || 0) + 1;
          if (tries > 3) { await S.fail("위택스 회계파일신고 화면을 열지 못했습니다", { diag: true }); return; }
          await S.setPhase({ navTries: tries });
          location.href = URL_UPLOAD;
          return;
        }
        // 로그인 필요 → 사람이 이 탭에서 로그인할 때까지 기다린다 (로그인 후 페이지가 바뀌면 이 스크립트가 새로 실행됨)
        await S.report("running", "위택스 로그인이 필요합니다 — 이 탭에서 공동인증서로 로그인해 주세요 (로그인하면 이어서 진행)");
        const ok = await waitFor(loggedIn, 15 * 60 * 1000, 2000);
        if (!ok) { await S.fail("위택스 로그인을 기다리다 시간이 지났습니다. 로그인한 뒤 [검증 · 제출]을 다시 눌러 주세요"); return; }
        location.href = URL_UPLOAD;
        return;
      }
      const d = await S.detail();
      if (!d || !d.ok) { await S.fail("작업 정보를 받지 못했습니다: " + (d && d.error)); return; }
      if (d.cancelled) { await S.setPhase(null); return; }
      S.clearNotes();
      S.setMode("verify");
      await S.report("running", `파일 넣는 중… ${d.fileName}`);

      // 일반 input[type=file] → 파일을 직접 넣는다. 안 되면 background 경유(프레임 무관)
      const put = () => {
        const bin = atob(d.fileBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], d.fileName, { type: "application/octet-stream" }));
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        return fileInput.files && fileInput.files.length === 1;
      };
      let fileOk = false;
      try { fileOk = put(); } catch (e) { console.log("[SaveTax 제출] 직접 넣기 실패:", e.message); }
      if (!fileOk) {
        const r = await S.bg({ type: "efile-submit-set-file", fileName: d.fileName, base64: d.fileBase64, selector: "#file_upload_0_" });
        fileOk = !!(r && r.ok);
      }
      if (!fileOk) { await S.fail("위택스에 파일을 넣지 못했습니다", { since: t0, diag: true }); return; }
      await sleep(600);

      const pw = document.querySelector("#filePw");
      if (!pw) { await S.fail("파일비밀번호 입력칸을 찾지 못했습니다", { since: t0, diag: true }); return; }
      S.setInput(pw, d.password);
      await sleep(400);
      const next = document.querySelector("a#btn_next") || [...document.querySelectorAll("a,button")].find(e => visible(e) && /파일변환하기/.test(txt(e)));
      if (!next) { await S.fail("[파일변환하기] 버튼을 찾지 못했습니다", { since: t0, diag: true }); return; }
      await S.setPhase("convert");
      await S.report("running", "파일 변환(서식검증) 중…");
      next.click();
      // 다음 페이지(2단계)로 넘어가면 이 스크립트는 끝나고 새 페이지에서 이어진다. 안 넘어가면 안내 문구와 함께 오류 처리
      await sleep(45000);
      if (on("B070101M31")) await S.fail("파일 변환 후 다음 단계로 넘어가지 않았습니다", { since: t0, diag: true });
      return;
    }

    // ---------- 2단계: 서식검증 결과 → 사람 확인 → 제출하기 ----------
    if (me.phase === "convert" || me.phase === "await") {
      const arrived = await waitFor(() => on("B070101M32") && /신고\s*내역/.test(bodyText()), 30000, 500);
      if (!arrived) {
        await S.fail(on("B070101M31") ? "파일 변환에 실패했습니다 (1단계 화면으로 돌아옴)" : "서식검증 화면이 열리지 않았습니다", { diag: true });
        return;
      }
      await sleep(1000);
      const v = readVerify();
      v.notes = S.notes();
      if ((v.contentErr || 0) > 0 || !v.normal) {
        await S.fail(`서식검증에서 오류가 나왔습니다 · 정상 ${v.normal ?? "?"}건 · 오류 ${v.contentErr ?? "?"}건 (위택스 탭에서 오류 내용을 확인하세요)`, { verify: v });
        return;
      }
      S.setMode("");
      await S.setPhase("await");
      const taxText = v.taxTotal != null ? ` · 납부할 세액 합계 ${v.taxTotal.toLocaleString()}원` : "";
      await S.report("verified", `서식검증 완료 · 정상 ${v.normal}건${taxText} — 사이트에서 [제출]을 누르면 제출합니다`, { verify: v });
      const c = await S.waitConfirm();
      if (c !== "confirmed") {
        S.showBanner(c === "cancelled" ? "취소됨 — 제출하지 않았습니다" : "제출 확인을 받지 못해 중단했습니다 (제출하지 않음)", "#6B7684");
        await S.setPhase(null);
        return;
      }
      // 여기부터는 사람이 사이트에서 [제출]을 누른 뒤
      const r = await S.report("submitting", "제출하는 중…");
      if (!r || !r.ok) {
        S.showBanner("제출 확인을 확인하지 못해 중단했습니다 (제출하지 않음)", "#DC2626");
        await S.setPhase(null);
        return;
      }
      const submitBtn = document.querySelector("a#btn_next") || [...document.querySelectorAll("a,button")].find(e => visible(e) && /^제출하기$/.test(txt(e)));
      if (!submitBtn || !/제출/.test(txt(submitBtn))) {
        await S.fail("[제출하기] 버튼을 찾지 못했습니다. 아직 제출되지 않았습니다 — 위택스 탭에서 직접 눌러 주세요", { diag: true });
        return;
      }
      S.setMode("submit");
      await S.setPhase("submit");
      submitBtn.click();
      await sleep(45000);
      if (on("B070101M32")) {
        S.setMode("");
        await S.api("POST", "/api/withholding/filing/submit-result", {
          jobId: me.jobId, kind: me.kind,
          error: "제출하기를 눌렀지만 다음 화면으로 넘어가지 않았습니다. 위택스 일괄신고 내역에서 제출 여부를 꼭 확인하세요" + (S.notes(t0).length ? " · 사이트 안내: " + S.notes(t0).slice(-3).join(" / ") : ""),
        });
        await S.setPhase(null);
      }
      return;
    }

    // ---------- 3단계: 제출결과 → 일괄신고 내역에서 일괄신고ID 읽기 ----------
    if (me.phase === "submit") {
      S.setMode("");
      if (on("B070101M32")) {
        // 제출하기를 누른 뒤 같은 화면이 다시 열림 → 제출 여부가 불확실
        await S.api("POST", "/api/withholding/filing/submit-result", {
          jobId: me.jobId, kind: me.kind,
          error: "제출 후 화면이 예상과 다릅니다. 위택스 일괄신고 내역에서 제출 여부를 꼭 확인하세요",
        });
        await S.setPhase(null);
        return;
      }
      await S.report("submitting", "제출 처리 중… 일괄신고 내역 확인");
      await S.setPhase({ phase: "list", resultText: bodyText().replace(/\s+/g, " ").slice(0, 600) });
      await sleep(2500);
      location.href = URL_LIST;
      return;
    }
    if (me.phase === "list") {
      if (!on("B070102M02")) { location.href = URL_LIST; return; }
      const ID_RE = /\b\d{17,22}\b/;
      const row = await waitFor(() => [...document.querySelectorAll("table tbody tr")].find(tr => ID_RE.test(txt(tr))), 25000, 600);
      const rowText = row ? txt(row) : "";
      const id = rowText ? rowText.match(ID_RE)[0] : "";
      const res = await S.api("POST", "/api/withholding/filing/submit-result", {
        jobId: me.jobId, kind: me.kind,
        receipts: id ? [id] : [], rows: rowText ? [rowText] : [],
        raw: (me.resultText || "") + " || " + bodyText().replace(/\s+/g, " ").slice(0, 3000),
      });
      S.showBanner(res && res.ok ? `제출 완료${id ? " · 일괄신고ID " + id : " (일괄신고 내역에서 확인)"}` : `제출은 진행됐습니다 — 사이트 기록 실패: ${res && res.error}`, res && res.ok ? "#15803D" : "#DC2626");
      await S.setPhase("done");
      return;
    }
  } catch (e) {
    console.error(e);
    await S.fail("예상하지 못한 오류: " + ((e && e.message) || e), { since: t0, diag: true });
  }

  // 2단계 화면에서 정상/오류 건수와 표를 읽는다
  function readVerify() {
    const text = bodyText().replace(/\s+/g, " ");
    const m1 = text.match(/정상\s*신고\s*내역\s*([\d,]+)\s*건/);
    const m2 = text.match(/오류\s*(?:신고)?\s*내역\s*([\d,]+)\s*건/);
    let normal = m1 ? S.num(m1[1]) : null;
    const contentErr = m2 ? S.num(m2[1]) : null;
    const rows = [];
    let taxTotal = null;
    for (const table of document.querySelectorAll("table")) {
      const head = txt(table.querySelector("thead") || table.rows[0]);
      if (!/납부할\s*총\s*세액/.test(head)) continue;
      const headCells = [...(table.querySelector("thead") || table).querySelectorAll("th")].map(txt);
      const taxIdx = headCells.findIndex(h => /납부할\s*총\s*세액/.test(h));
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cells = [...tr.querySelectorAll("td")].map(txt);
        if (cells.length < 3) continue;
        rows.push(cells.join(" | "));
        // 표의 th 수와 td 수가 같을 때만 세액 열을 믿는다 (행 머리칸이 th인 표 대비)
        const cell = taxIdx >= 0 && headCells.length === cells.length ? cells[taxIdx] : cells[cells.length - 1];
        const n = S.num(cell);
        if (n != null) taxTotal = (taxTotal || 0) + n;
      }
      break; // 첫 번째(정상 내역) 표만
    }
    if (normal == null && rows.length) normal = rows.length;
    return { fileName: "", target: null, formatErr: null, contentErr, normal, taxTotal, rows: rows.slice(0, 200) };
  }
})();
