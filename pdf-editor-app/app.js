/* PDF 편집기 — 전부 브라우저 안에서 처리(서버 전송 없음) */
(() => {
  "use strict";

  const { PDFDocument, rgb, degrees, LineCapStyle } = PDFLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";

  // ---------- 상태 ----------
  // sources: id -> { bytes: Uint8Array, jsdoc: pdf.js document }
  const sources = new Map();
  let srcSeq = 0;
  // pages: 화면에 보이는 순서. { srcId, srcIndex, rotate(0/90/180/270), anns:[] }
  let pages = [];
  let selected = -1;        // 현재 편집 중인 페이지 index
  let tool = "select";
  let malgunBytes = null;   // 한글 폰트(지연 로딩)
  // 글씨체: 화면 미리보기용 CSS 패밀리 / PDF 임베딩용 파일(설치 폰트와 일치)
  const FONT_CANVAS = { malgun: '"Malgun Gothic","맑은 고딕",sans-serif', nanummyeongjo: '"NanumMyeongjo","나눔명조",serif', nanumgothic: '"NanumGothic","나눔고딕",sans-serif' };
  const FONT_FILE = { malgun: "lib/malgun.ttf", nanummyeongjo: "lib/nanummyeongjo.ttf", nanumgothic: "lib/nanumgothic.ttf" };
  // 글자상자(box) 줄 배치 상수 — 미리보기와 저장이 동일 수식을 써야 함
  const TXT_LH = 1.3, TXT_PAD = 0.15, TXT_PADX = 0.1, TXT_ASC = 0.8;
  const txtBaselineY = (a, i) => (a.y + a.h) - a.size * TXT_PAD - a.size * TXT_ASC - i * a.size * TXT_LH; // i번째 줄 베이스라인(PDF y)
  // 텍스트를 폭(pt)에 맞춰 줄바꿈. 명시적 \n 우선, 그 안에서 자동 줄바꿈(공백 우선, CJK는 글자단위).
  function wrapToWidth(text, fontKey, size, maxW) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${size}px ${FONT_CANVAS[fontKey] || FONT_CANVAS.malgun}`;
    const out = [];
    for (const para of String(text).split("\n")) {
      if (para === "") { out.push(""); continue; }
      let line = "", lastSpace = -1;
      for (const ch of para) {
        if (line !== "" && ctx.measureText(line + ch).width > maxW) {
          if (lastSpace >= 0) { out.push(line.slice(0, lastSpace)); line = line.slice(lastSpace + 1); }
          else { out.push(line); line = ""; }
          lastSpace = -1;
        }
        line += ch;
        if (ch === " ") lastSpace = line.length - 1;
      }
      out.push(line);
    }
    return out;
  }
  let orderConfirmed = true; // 파일 순서 확정 여부(파일 2개 이상일 때만 의미)
  let pendingReset = false;  // 다시편집 후, 실제 순서변경 시 순서·삭제·회전 초기화 대기
  const undoStack = [];
  const redoStack = [];   // 앞으로 가기(redo)용 — 새 편집이 생기면 비워짐

  // 주석(annotation) 모델 — 좌표는 모두 PDF 사용자 공간(pt), 원점 좌하단
  //  text:  { type:'text',  x, y, text, size, color:'#rrggbb' }   (y=베이스라인)
  //  rect:  { type:'rect',  x, y, w, h, color }                    (x,y=좌하단)
  //  image: { type:'image', x, y, w, h, dataUrl, fmt }             (x,y=좌하단)
  //  path:  { type:'path',  pts:[[x,y],…], color, width, mode:'pen'|'highlight' }  (자유곡선/형광펜)

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    btnOpen: $("btnOpen"), btnSave: $("btnSave"), btnUndo: $("btnUndo"), btnOcr: $("btnOcr"),
    histbar: $("histbar"), btnStepUndo: $("btnStepUndo"), btnStepRedo: $("btnStepRedo"),
    fileOpen: $("fileOpen"), fileStamp: $("fileStamp"), fileImage: $("fileImage"),
    thumbs: $("thumbs"), thumbList: $("thumbList"), thumbsEmpty: $("thumbsEmpty"),
    fileSection: $("fileSection"), fileList: $("fileList"), btnConfirmOrder: $("btnConfirmOrder"),
    stage: $("stage"), stageEmpty: $("stageEmpty"),
    canvasWrap: $("canvasWrap"), pageCanvas: $("pageCanvas"), overlay: $("overlay"),
    textInput: $("textInput"), textArea: $("textArea"), textOpts: $("textOpts"),
    fontSize: $("fontSize"), fontColor: $("fontColor"), fontFamily: $("fontFamily"),
    brushOpts: $("brushOpts"), brushMode: $("brushMode"), brushWidth: $("brushWidth"), brushWidthVal: $("brushWidthVal"), brushColor: $("brushColor"), brushSwatches: $("brushSwatches"),
    eraserOpts: $("eraserOpts"), eraserShapeSeg: $("eraserShape"), eraserTargetSeg: $("eraserTarget"), eraserSizeWrap: $("eraserSizeWrap"), eraserSize: $("eraserSize"), eraserSizeVal: $("eraserSizeVal"),
    mosaicOpts: $("mosaicOpts"), mosaicModeSeg: $("mosaicMode"), mosaicStrength: $("mosaicStrength"), mosaicStrengthVal: $("mosaicStrengthVal"),
    hint: $("hint"), busy: $("busy"), busyMsg: $("busyMsg"),
    toolGroup: $("toolGroup"),
    zoombar: $("zoombar"), zoomRange: $("zoomRange"), zoomVal: $("zoomVal"), zoomIn: $("zoomIn"), zoomOut: $("zoomOut"), zoomReset: $("zoomReset"),
    stampModal: $("stampModal"), stampClose: $("stampClose"), stampCancel: $("stampCancel"), stampUse: $("stampUse"),
    stampDrop: $("stampDrop"), stampPick: $("stampPick"), imgEditor: $("imgEditor"), stampImgCanvas: $("stampImgCanvas"),
    cutBg: $("cutBg"), cutTol: $("cutTol"), cutTolVal: $("cutTolVal"), cutRecolor: $("cutRecolor"), cutColor: $("cutColor"), cutSolid: $("cutSolid"),
    modeImage: $("modeImage"), modeName: $("modeName"),
    stampShape: $("stampShape"), stampName: $("stampName"), stampColor: $("stampColor"), stampNameCanvas: $("stampNameCanvas"), nameLabel: $("nameLabel"),
  };

  // 현재 편집 뷰포트(클릭 좌표 <-> PDF 좌표 변환용)
  let curViewport = null;
  let editScale = 1.0;      // 메인 편집 화면 배율(슬라이더로 조절)
  let needFit = true;       // 새 문서 열면 첫 렌더에서 화면에 맞춤
  const ZMIN = 0.15, ZMAX = 6;

  // ---------- 아이콘 (미니멀 선 아이콘) ----------
  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    folder: '<path d="M4 6a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/>',
    scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 9.5h8"/><path d="M8 13.5h5"/>',
    download: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
    pointer: '<path d="M5 3.5l13 6.8-5.5 1.7L10.5 18z"/>',
    type: '<path d="M5 6V5h14v1"/><path d="M12 5v14"/><path d="M9.3 19h5.4"/>',
    eraser: '<path d="m7 20-3.6-3.6a1.6 1.6 0 0 1 0-2.3l8.4-8.4a1.6 1.6 0 0 1 2.3 0l4.8 4.8a1.6 1.6 0 0 1 0 2.3L13.5 20z"/><path d="M20 20H8"/>',
    brush: '<path d="M3 21c2.5-.8 4.3-1.9 6-3.6l8.1-8.1a2.1 2.1 0 0 0-3-3L6 14.4C4.3 16.1 3.2 17.9 3 21z"/><path d="M13.5 6.5l4 4"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="10" r="1.4"/><path d="M20.5 16 15 10.5 7.5 18"/>',
    stamp: '<path d="M9.2 4.2A2 2 0 0 1 11.1 3h1.8a2 2 0 0 1 1.9 2.6l-1 3.4a2 2 0 0 0 1.9 2.6H18a2 2 0 0 1 2 2V16H4v-.4a2 2 0 0 1 2-2h2.3a2 2 0 0 0 1.9-2.6l-1-3.4z"/><path d="M4 19.5h16"/>',
    mosaic: '<rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/>',
    undo: '<path d="M9 13 4 9l5-4"/><path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H9"/>',
    redo: '<path d="M15 13l5-4-5-4"/><path d="M20 9h-9.5a5.5 5.5 0 0 0 0 11H15"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.4-5.9"/><path d="M3 3.5V8h4.5"/><path d="M12 7.5V12l3 2"/>',
    "rotate-ccw": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    "rotate-cw": '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  };
  function icon(name) {
    return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  }
  function injectIcons() {
    document.querySelectorAll("[data-ic]").forEach((el) => {
      const txt = el.textContent.trim();
      el.innerHTML = icon(el.dataset.ic) + (txt ? `<span>${txt}</span>` : "");
    });
  }

  // ---------- 유틸 ----------
  const busy = (on, msg) => { els.busy.style.display = on ? "flex" : "none"; if (msg) els.busyMsg.textContent = msg; };
  const hint = (t) => { els.hint.textContent = t || ""; };

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "#000000");
    const n = parseInt(m ? m[1] : "000000", 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
  }

  // 현재 상태 스냅샷 문자열(image dataUrl 포함). pushUndo·지우개 드래그 공용.
  // 런타임 전용 캐시(_img·_srcImg 등 _접두 필드)는 직렬화에서 제외(복원 시 dataUrl로 재생성)
  function snapshot() {
    return JSON.stringify(pages.map(p => ({
      srcId: p.srcId, srcIndex: p.srcIndex, rotate: p.rotate,
      anns: p.anns.map(a => { const o = {}; for (const k in a) if (k[0] !== "_") o[k] = a[k]; return o; }),
    })));
  }
  function restoreSnapshot(str) {
    pages = JSON.parse(str).map(p => ({ ...p }));
    if (selected >= pages.length) selected = pages.length - 1;
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  }
  // 하단 원형 버튼(전 작업 되돌리기/앞으로 가기) 활성화 갱신
  function updateHistoryButtons() {
    if (els.btnStepUndo) els.btnStepUndo.disabled = undoStack.length === 0;
    if (els.btnStepRedo) els.btnStepRedo.disabled = redoStack.length === 0;
  }
  // 편집 직전 상태를 undo 스택에 저장(새 편집이므로 redo 무효화). 최근 30개.
  function commitUndo(str) { undoStack.push(str); if (undoStack.length > 30) undoStack.shift(); redoStack.length = 0; updateHistoryButtons(); }
  function pushUndo() { commitUndo(snapshot()); }
  function undo() {  // 바로 전 작업 한 단계 되돌리기
    if (!undoStack.length) return;
    redoStack.push(snapshot()); if (redoStack.length > 30) redoStack.shift();
    restoreSnapshot(undoStack.pop());
    updateHistoryButtons();
  }
  function redo() {  // 앞으로 가기(되돌린 작업 다시 적용)
    if (!redoStack.length) return;
    undoStack.push(snapshot()); if (undoStack.length > 30) undoStack.shift();
    restoreSnapshot(redoStack.pop());
    updateHistoryButtons();
  }
  // 편집 전 원본(처음 불러온 전체 문서)으로 되돌리기 — 글자·브러쉬·도장·지우개·회전·순서·삭제·파일제거 모두 취소
  function revertToOriginal() {
    if (!sources.size) return;
    if (editingLocked()) return;
    if (!confirm("모든 편집(글자·브러쉬·도장·지우개·회전·순서변경·쪽삭제·파일제거)을 지우고\n처음 불러온 원본 상태로 되돌립니다. 계속할까요?")) return;
    pushUndo();
    const np = [];
    for (const id of sources.keys()) {
      const n = sources.get(id).jsdoc.numPages;
      for (let i = 0; i < n; i++) np.push({ srcId: id, srcIndex: i, rotate: 0, anns: [] });
    }
    pages = np;
    selected = pages.length ? 0 : -1;
    orderConfirmed = getFileOrder().length < 2;
    pendingReset = false;
    needFit = true;
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  }

  function updateButtons() {
    const has = pages.length > 0;
    const locked = editingLocked();
    els.btnSave.disabled = !has;
    els.btnOcr.disabled = !has || locked;
    els.btnUndo.disabled = !has || locked; // 원본으로 되돌리기: 문서 있고 잠금 아닐 때만
    els.toolGroup.classList.toggle("locked", locked);
    els.thumbsEmpty.style.display = has ? "none" : "block";
    els.stageEmpty.style.display = selected >= 0 ? "none" : "flex";
    els.canvasWrap.style.display = selected >= 0 ? "block" : "none";
    els.zoombar.style.display = selected >= 0 ? "flex" : "none";
    if (els.histbar) els.histbar.style.display = selected >= 0 ? "flex" : "none";
    updateHistoryButtons();
    positionHistbar();
  }
  // 현재 도구에서 오버레이 휠이 '크기 조절'로 쓰이는가(브러쉬/도장배치/브러쉬지우개)
  function wheelAdjustsSize() {
    return tool === "brush"
      || (tool === "stamp" && stampPending)
      || (tool === "eraser" && eraserShape === "brush");
  }
  // 휠로 다음/이전 페이지 이동(썸네일 선택 표시만 갱신, 전체 재렌더 없이)
  function goPage(delta) {
    if (selected < 0 || !pages.length) return;
    const n = Math.max(0, Math.min(pages.length - 1, selected + delta));
    if (n === selected) return;
    selected = n;
    const items = els.thumbList.querySelectorAll(".thumb");
    items.forEach((li, i) => li.classList.toggle("selected", i === selected));
    if (items[selected]) items[selected].scrollIntoView({ block: "nearest" });
    renderSelected(); updateButtons();
  }
  // 하단 되돌리기/앞으로 원형바를 PDF 화면(사이드바 제외) 가로 중앙에 맞춤
  function positionHistbar() {
    if (!els.histbar) return;
    const r = els.stage.getBoundingClientRect();
    els.histbar.style.left = Math.round(r.left + r.width / 2) + "px";
  }

  // ---------- PDF 불러오기 ----------
  async function loadFiles(fileList, { append }) {
    const files = [...fileList].filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (!files.length) return;
    busy(true, "PDF 여는 중…");
    try {
      if (!append) { sources.clear(); pages = []; selected = -1; undoStack.length = 0; redoStack.length = 0; needFit = true; }
      else pushUndo();

      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const id = "s" + (srcSeq++);
        // pdf.js는 넘긴 버퍼를 소유(전송)하므로 복사본을 준다
        const jsdoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        sources.set(id, { bytes, jsdoc, name: f.name });
        for (let i = 0; i < jsdoc.numPages; i++) pages.push({ srcId: id, srcIndex: i, rotate: 0, anns: [] });
      }
      if (selected < 0 && pages.length) selected = 0;
      orderConfirmed = getFileOrder().length < 2; // 파일 2개 이상이면 확정 전(순서 조정 단계)
      pendingReset = false;
      renderFiles();
      renderThumbs();
      renderSelected();
      updateButtons();
    } catch (e) {
      console.error(e); alert("PDF를 여는 중 오류가 났습니다: " + e.message);
    } finally { busy(false); }
  }

  // ---------- 파일(원본 PDF) 순서 ----------
  // 확정 전(파일 2개 이상)에는 파일 순서 조정만 가능, 그 외 편집 잠금
  function editingLocked() { return !orderConfirmed && getFileOrder().length >= 2; }
  // 순서·쪽 삭제·회전을 처음 상태로 되돌림(글자·도장·지우개 편집은 페이지 기준으로 유지)
  function rollbackStructure() {
    const annMap = new Map();
    for (const p of pages) if (p.anns && p.anns.length) annMap.set(p.srcId + "#" + p.srcIndex, p.anns);
    const present = new Set(getFileOrder());      // 현재 남아있는 파일만(X로 제거한 파일은 복구 안 함)
    const np = [];
    for (const id of sources.keys()) {            // 최초 불러온 파일 순서
      if (!present.has(id)) continue;
      const n = sources.get(id).jsdoc.numPages;
      for (let i = 0; i < n; i++) np.push({ srcId: id, srcIndex: i, rotate: 0, anns: annMap.get(id + "#" + i) || [] });
    }
    pages = np;
  }
  // 파일명 옆 X: 그 파일의 모든 쪽 제거 (Ctrl+Z로 되돌리기)
  function removeFile(id) {
    pushUndo();
    const selPage = selected >= 0 ? pages[selected] : null;
    pages = pages.filter((p) => p.srcId !== id);
    if (selPage && pages.indexOf(selPage) >= 0) selected = pages.indexOf(selPage);
    else selected = pages.length ? Math.min(selected, pages.length - 1) : -1;
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  }
  function getFileOrder() {
    const seen = new Set(), order = [];
    for (const p of pages) if (!seen.has(p.srcId)) { seen.add(p.srcId); order.push(p.srcId); }
    return order;
  }
  function fileLabel(id) {
    const s = sources.get(id);
    return ((s && s.name) || "PDF").replace(/\.pdf$/i, "");
  }
  function renderFiles() {
    const order = getFileOrder();
    const show = order.length >= 2;           // 파일 2개 이상일 때만 순서 영역 표시
    els.fileSection.style.display = show ? "block" : "none";
    if (!show) { orderConfirmed = true; return; } // 1개 이하면 잠금 없음
    els.fileSection.classList.toggle("confirmed", orderConfirmed);
    els.btnConfirmOrder.textContent = orderConfirmed ? "다시 편집" : "확정";
    els.btnConfirmOrder.title = orderConfirmed ? "파일 순서를 다시 편집(순서·삭제·회전 초기화)" : "이 순서로 확정하고 편집 시작";
    els.fileList.style.display = orderConfirmed ? "none" : "";
    els.fileList.innerHTML = "";
    if (orderConfirmed) return;               // 확정(접힘) 상태에선 목록을 그리지 않음
    order.forEach((id, i) => {
      const li = document.createElement("li");
      li.className = "file-item";
      li.draggable = true;
      li.dataset.id = id;
      const name = fileLabel(id);
      li.innerHTML = `<span class="fi-num">${i + 1}</span><span class="fi-name" title="${name}">${name}</span><button class="fi-x" draggable="false" title="이 파일 제거">${icon("x")}</button>`;
      els.fileList.appendChild(li);
      const xbtn = li.querySelector(".fi-x");
      xbtn.addEventListener("mousedown", (e) => e.stopPropagation()); // 드래그 시작 방지
      xbtn.addEventListener("click", (e) => { e.stopPropagation(); removeFile(id); });
      li.addEventListener("dragstart", (e) => { e.dataTransfer.setData("app/file", id); e.dataTransfer.effectAllowed = "move"; li.classList.add("dragging"); });
      li.addEventListener("dragend", () => { li.classList.remove("dragging"); clearMarks(els.fileList); });
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        clearMarks(els.fileList);
        li.classList.add(dropBefore(e, li) ? "insert-before" : "insert-after");
      });
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData("app/file");
        const ins = i + (dropBefore(e, li) ? 0 : 1);
        clearMarks(els.fileList);
        if (from) reorderFilesTo(from, ins);
      });
    });
  }
  // 파일 순서를 바꾸면 그 파일의 페이지 묶음을 통째로 재배열(파일 내부 순서·삭제·편집은 유지)
  function reorderFilesTo(fromId, ins) {
    const cur = getFileOrder();
    const from0 = cur.indexOf(fromId);
    const noMove = from0 < 0 || ins === from0 || ins === from0 + 1;
    if (noMove && !pendingReset) return; // 변화 없음
    pushUndo();
    if (pendingReset) { rollbackStructure(); pendingReset = false; } // 순서 변경 순간 초기화
    const order = getFileOrder(); // 롤백 반영된 현재 순서
    let f = order.indexOf(fromId);
    if (f >= 0 && !(ins === f || ins === f + 1)) {
      order.splice(f, 1);
      if (f < ins) ins--;
      order.splice(Math.max(0, Math.min(ins, order.length)), 0, fromId);
    }
    const selPage = selected >= 0 ? pages[selected] : null;
    const np = [];
    for (const id of order) for (const p of pages) if (p.srcId === id) np.push(p);
    pages = np;
    selected = selPage ? pages.indexOf(selPage) : (pages.length ? 0 : -1);
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  }

  // ---------- 썸네일 ----------
  async function renderThumbs() {
    const locked = editingLocked();
    els.thumbList.classList.toggle("locked", locked);
    applyThumbCols();
    applyThumbMaxH();
    els.thumbList.innerHTML = "";
    for (let i = 0; i < pages.length; i++) {
      const li = document.createElement("li");
      li.className = "thumb" + (i === selected ? " selected" : "");
      li.draggable = !locked;
      li.dataset.i = i;
      li.innerHTML = `<span class="idx">${i + 1}</span>
        <canvas></canvas>
        <div class="pageActs">
          <button class="pa rotL" title="왼쪽 회전">${icon("rotate-ccw")}</button>
          <button class="pa rotR" title="오른쪽 회전">${icon("rotate-cw")}</button>
          <button class="pa del" title="이 쪽 삭제">${icon("trash")}</button>
        </div>`;
      els.thumbList.appendChild(li);
      renderPageToCanvas(i, li.querySelector("canvas"), 200);

      li.addEventListener("click", (e) => {
        if (e.target.closest(".pageActs")) return;
        selected = i; renderThumbs(); renderSelected(); updateButtons();
      });
      li.querySelector(".rotL").addEventListener("click", () => rotatePage(i, -90));
      li.querySelector(".rotR").addEventListener("click", () => rotatePage(i, 90));
      li.querySelector(".del").addEventListener("click", () => deletePage(i));

      // 드래그로 페이지 순서 바꾸기 (파일 드래그와 구분되는 전용 타입 사용)
      li.addEventListener("dragstart", (e) => { e.dataTransfer.setData("app/page", String(i)); e.dataTransfer.effectAllowed = "move"; li.classList.add("dragging"); });
      li.addEventListener("dragend", () => { li.classList.remove("dragging"); clearMarks(els.thumbList); });
      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        clearMarks(els.thumbList);
        li.classList.add(dropBefore(e, li) ? "insert-before" : "insert-after");
      });
      li.addEventListener("drop", (e) => {
        e.preventDefault();
        const raw = e.dataTransfer.getData("app/page");
        const ins = i + (dropBefore(e, li) ? 0 : 1);
        clearMarks(els.thumbList);
        if (raw === "") return; // 파일 항목 등 다른 드래그는 무시
        movePageTo(parseInt(raw, 10), ins);
      });
    }
  }

  // pdf.js로 한 페이지를 canvas에 그림. targetWidth px 폭에 맞춤.
  async function renderPageToCanvas(pageIdx, canvas, targetWidth) {
    const p = pages[pageIdx];
    const src = sources.get(p.srcId);
    const page = await src.jsdoc.getPage(p.srcIndex + 1);
    const base = page.getViewport({ scale: 1, rotation: (page.rotate + p.rotate) % 360 });
    const scale = targetWidth / base.width;
    const vp = page.getViewport({ scale, rotation: (page.rotate + p.rotate) % 360 });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return vp;
  }

  // ---------- 확대/축소 ----------
  const clampZoom = (s) => Math.max(ZMIN, Math.min(ZMAX, s));
  function computeFitScale(page, rot) {
    const base = page.getViewport({ scale: 1, rotation: rot });
    const availW = Math.max(120, els.stage.clientWidth - 72);  // canvas-wrap 여백 고려
    const availH = Math.max(120, els.stage.clientHeight - 72);
    return clampZoom(Math.min(availW / base.width, availH / base.height));
  }
  function updateZoomUI() {
    const pct = Math.round(editScale * 100);
    if (els.zoomRange) els.zoomRange.value = String(pct);
    if (els.zoomVal) els.zoomVal.textContent = pct + "%";
  }
  const snapZoom = (scale) => clampZoom(Math.round(scale * 100 / 10) * 10 / 100); // 10% 단위로 끊기
  function setZoom(scale) {
    editScale = snapZoom(scale);
    renderSelected(); // updateZoomUI는 renderSelected 안에서 호출됨
  }

  // ---------- 메인 편집 뷰 ----------
  async function renderSelected() {
    selectedAnn = -1; annDrag = null;   // 페이지 바뀌면 도장 선택 해제
    if (selected < 0 || selected >= pages.length) { updateButtons(); return; }
    const p = pages[selected];
    const src = sources.get(p.srcId);
    const page = await src.jsdoc.getPage(p.srcIndex + 1);
    const rot = (page.rotate + p.rotate) % 360;
    if (needFit) { editScale = clampZoom(Math.max(0.1, Math.floor(computeFitScale(page, rot) * 10) / 10)); needFit = false; } // 첫 화면: 한 쪽 다 보이게(10% 단위)
    const vp = page.getViewport({ scale: editScale, rotation: rot });
    curViewport = vp;
    updateZoomUI();
    els.pageCanvas.width = Math.round(vp.width); els.pageCanvas.height = Math.round(vp.height);
    els.overlay.width = els.pageCanvas.width; els.overlay.height = els.pageCanvas.height;
    els.overlay.style.width = els.pageCanvas.width + "px"; els.overlay.style.height = els.pageCanvas.height + "px";
    await page.render({ canvasContext: els.pageCanvas.getContext("2d"), viewport: vp }).promise;
    drawOverlay();
  }

  // 오버레이에 주석 미리보기
  function drawOverlay() {
    const ctx = els.overlay.getContext("2d");
    ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
    if (selected < 0 || !curViewport) return;
    for (const a of pages[selected].anns) {
      if (a.type === "rect") {
        const [vx1, vy1] = curViewport.convertToViewportPoint(a.x, a.y);
        const [vx2, vy2] = curViewport.convertToViewportPoint(a.x + a.w, a.y + a.h);
        ctx.fillStyle = a.color || "#ffffff";
        ctx.fillRect(Math.min(vx1, vx2), Math.min(vy1, vy2), Math.abs(vx2 - vx1), Math.abs(vy2 - vy1));
      } else if (a.type === "text" && a.ocr) {
        // 인식된 글자층: 화면엔 옅은 노란 박스로 표시(저장 시엔 투명 글자로 들어감)
        const [vx1, vy1] = curViewport.convertToViewportPoint(a.x, a.y);
        const [vx2, vy2] = curViewport.convertToViewportPoint(a.x + a.w, a.y + a.h);
        ctx.fillStyle = "rgba(255,220,0,0.28)";
        ctx.fillRect(Math.min(vx1, vx2), Math.min(vy1, vy2), Math.abs(vx2 - vx1), Math.abs(vy2 - vy1));
      } else if (a.type === "text") {
        ctx.fillStyle = a.color || "#000";
        ctx.textBaseline = "alphabetic";
        ctx.font = `${a.size * editScale}px ${FONT_CANVAS[a.font] || FONT_CANVAS.malgun}`;
        const rot = -((pages[selected].effRot || 0)) * Math.PI / 180;
        if (a.box && a.lines) { // 영역(박스) 글자: 여러 줄
          a.lines.forEach((ln, i) => {
            const [vx, vy] = curViewport.convertToViewportPoint(a.x + a.size * TXT_PADX, txtBaselineY(a, i));
            ctx.save(); ctx.translate(vx, vy); ctx.rotate(rot); ctx.fillText(ln, 0, 0); ctx.restore();
          });
        } else { // 한 점 글자
          const [vx, vy] = curViewport.convertToViewportPoint(a.x, a.y);
          ctx.save(); ctx.translate(vx, vy); ctx.rotate(rot); ctx.fillText(a.text, 0, 0); ctx.restore();
        }
      } else if (a.type === "image") {
        if (!a._img) { a._img = new Image(); a._img.onload = drawOverlay; a._img.src = a.dataUrl; return; }
        // 중심 기준 렌더: 페이지가 회전돼 있어도 화면상 커서 위치·수직 그대로(고스트와 일치)
        const [scx, scy] = curViewport.convertToViewportPoint(a.x + a.w / 2, a.y + a.h / 2);
        const w = a.w * editScale, h = a.h * editScale;
        ctx.save();
        ctx.translate(scx, scy);
        ctx.rotate((a.rot || 0) * Math.PI / 180);
        ctx.drawImage(a._img, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else if (a.type === "path") {
        strokeOnOverlay(ctx, a);
      }
    }
    drawSelectionChrome(ctx);
  }

  // ---------- 페이지 조작 ----------
  function rotatePage(i, delta) {
    if (editingLocked()) return;
    pushUndo();
    pages[i].rotate = ((pages[i].rotate + delta) % 360 + 360) % 360;
    renderThumbs();
    if (i === selected) renderSelected();
  }
  function deletePage(i) {
    if (editingLocked()) return;
    if (pages.length === 1) { if (!confirm("마지막 한 쪽입니다. 삭제하면 빈 상태가 됩니다. 계속할까요?")) return; }
    pushUndo();
    pages.splice(i, 1);
    if (selected >= pages.length) selected = pages.length - 1;
    else if (i < selected) selected--;
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  }
  // 드래그 삽입 위치 계산 도우미
  function dropBefore(e, el) { const r = el.getBoundingClientRect(); return (e.clientY - r.top) < r.height / 2; }
  function clearMarks(listEl) { listEl.querySelectorAll(".insert-before,.insert-after").forEach((el) => el.classList.remove("insert-before", "insert-after")); }
  // 사이드바가 넓어지면 썸네일을 2열로(가독성)
  function applyThumbCols() {
    const w = document.getElementById("thumbs").getBoundingClientRect().width;
    els.thumbList.classList.toggle("cols2", w >= 330);
  }
  // 한 번에 최소 3개 쪽이 보이도록 썸네일 높이 상한 계산
  function applyThumbMaxH() {
    const sb = document.getElementById("thumbs");
    const listTop = els.thumbList.getBoundingClientRect().top;
    const avail = sb.getBoundingClientRect().bottom - listTop - 6; // 리스트가 쓸 세로 공간
    if (avail <= 0) return;
    const gap = 10, chrome = 24;                 // 항목 여백(버튼은 겹쳐지므로 높이 미포함)
    const per = (avail - 2 * gap) / 3;           // 3개 기준
    const cap = Math.max(56, Math.floor(per - chrome));
    els.thumbList.style.setProperty("--thumb-max-h", cap + "px");
  }

  // ins = 원본 배열 기준 삽입 슬롯(0..n)
  function movePageTo(from, ins) {
    if (editingLocked()) return;
    if (isNaN(from) || from < 0 || from >= pages.length) return;
    if (ins === from || ins === from + 1) return; // 제자리
    pushUndo();
    const selPage = selected >= 0 ? pages[selected] : null;
    const [pg] = pages.splice(from, 1);
    if (from < ins) ins--;
    pages.splice(Math.max(0, Math.min(ins, pages.length)), 0, pg);
    selected = selPage ? pages.indexOf(selPage) : (pages.length ? 0 : -1);
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  }

  // ---------- 도구 ----------
  function setTool(t) {
    tool = t;
    [...els.toolGroup.querySelectorAll(".tool")].forEach(b => b.classList.toggle("active", b.dataset.tool === t));
    els.canvasWrap.className = "canvas-wrap tool-" + t;
    els.textOpts.style.display = t === "text" ? "inline-flex" : "none";
    els.brushOpts.style.display = t === "brush" ? "inline-flex" : "none";
    els.eraserOpts.style.display = t === "eraser" ? "inline-flex" : "none";
    els.mosaicOpts.style.display = t === "mosaic" ? "inline-flex" : "none";
    hint(({
      select: "도장을 클릭해 선택 · 모서리로 크기, 위 손잡이로 회전, 드래그로 이동 · Delete로 삭제",
      text: "드래그로 영역을 정하면 그 안에 자동 줄바꿈 · 짧게 클릭하면 한 점 입력 (크기·글씨체·색 조절)",
      brush: "누른 채 끌어 그리세요 · 펜/형광펜·굵기·색 조절",
      eraser: eraserHint(),
      mosaic: "가릴 영역을 네모로 드래그하세요 (모자이크/블러·강도 조절) · 개인정보 가리기",
      stamp: "이미지를 고른 뒤 놓을 위치를 클릭하세요",
      image: "이미지 파일을 고른 뒤, 넣을 영역을 네모로 드래그하세요 (비율 유지)",
    })[t] || "");
    if (t !== "select") { selectedAnn = -1; annDrag = null; }
    if (t !== "brush") { brushMouse = null; if (curViewport) drawOverlay(); }
    if (t !== "eraser") eraserMouse = null;
    els.overlay.style.cursor = "";
    if (t === "stamp") openStampModal();
    if (t !== "image") imagePending = null; else els.fileImage.click(); // 이미지: 파일 선택 후 드래그로 배치
    if (t !== "text") textDrag = null;
    els.textInput.style.display = "none";
    els.textArea.style.display = "none";
  }

  // 오버레이 클릭/드래그 → PDF 좌표
  function overlayToPdf(evt) {
    const r = els.overlay.getBoundingClientRect();
    const cx = (evt.clientX - r.left) * (els.overlay.width / r.width);
    const cy = (evt.clientY - r.top) * (els.overlay.height / r.height);
    const [px, py] = curViewport.convertToPdfPoint(cx, cy);
    return { cx, cy, px, py };
  }

  let stampPending = null; // 이미지 선택 후 배치 대기: {dataUrl,fmt,w,h}
  let stampImg = null;     // 미리보기용 Image 객체
  let stampW = 40;         // 도장 배치 폭(PDF points) — 휠로 조절
  let stampMouse = null;   // 마지막 마우스 위치(overlay px 좌표)
  let dragStart = null;
  let imagePending = null; // 이미지 삽입 대기: { dataUrl, w, h, img } — 텍스트처럼 드래그 박스에 맞춰 배치

  // ---------- 모자이크 / 블러 ----------
  let mosaicMode = "mosaic";   // 'mosaic'(픽셀화) | 'blur'
  let mosaicStrength = 20;     // 1~100 (셀수록 강함)
  let lastMosaic = null;       // 방금 만든(또는 조정 대상) 모자이크 주석 — 강도/모드 재조정용
  const MOSAIC_PAD = 48;       // 블러 재처리 시 가장자리 비침 방지용 여유(원본을 이만큼 넓게 보관)
  const mosaicBlock = (str) => Math.max(4, Math.round(str * 0.4));  // 픽셀 블록 4~40
  const mosaicBlur = (str) => Math.max(2, Math.round(str * 0.16));  // 블러 반경 2~16
  // 보관한 원본(padded) src에서 mode·strength로 처리된 이미지(dataUrl) 생성. off=중앙영역 시작, mw/mh=중앙 크기.
  function mosaicRender(src, offX, offY, mw, mh, mode, strength) {
    const out = document.createElement("canvas"); out.width = mw; out.height = mh;
    const octx = out.getContext("2d");
    if (mode === "blur") {
      const tmp = document.createElement("canvas"); tmp.width = src.width; tmp.height = src.height;
      const tctx = tmp.getContext("2d");
      tctx.filter = `blur(${mosaicBlur(strength)}px)`; tctx.drawImage(src, 0, 0); tctx.filter = "none";
      octx.drawImage(tmp, offX, offY, mw, mh, 0, 0, mw, mh);   // 블러 후 중앙만
    } else {
      const block = mosaicBlock(strength);
      const bw = Math.max(1, Math.round(mw / block)), bh = Math.max(1, Math.round(mh / block));
      const small = document.createElement("canvas"); small.width = bw; small.height = bh;
      const sctx = small.getContext("2d"); sctx.imageSmoothingEnabled = true;
      sctx.drawImage(src, offX, offY, mw, mh, 0, 0, bw, bh);   // 중앙만 잘라 축소(평균색)
      octx.imageSmoothingEnabled = false; octx.drawImage(small, 0, 0, bw, bh, 0, 0, mw, mh);
    }
    return out.toDataURL("image/png");
  }
  // 주석의 mmode/mstrength가 바뀌면 보관 원본으로 다시 처리(비동기: msrc 로드 후)
  function reprocessMosaic(a) {
    const run = (src) => { a.dataUrl = mosaicRender(src, a.mOffX, a.mOffY, a.mw, a.mh, a.mmode, a.mstrength); a._img = null; drawOverlay(); };
    if (a._srcImg) return run(a._srcImg);
    const im = new Image(); im.onload = () => { a._srcImg = im; run(im); }; im.src = a.msrc;
  }
  // 점(화면 px) 위에 있는 최상단 모자이크 주석
  function topMosaicAt(mx, my) {
    const anns = pages[selected].anns;
    for (let i = anns.length - 1; i >= 0; i--) {
      const a = anns[i]; if (!a.mosaic) continue;
      const [vx1, vy1] = curViewport.convertToViewportPoint(a.x, a.y + a.h);
      const w = a.w * editScale, h = a.h * editScale;
      if (mx >= vx1 && mx <= vx1 + w && my >= vy1 && my <= vy1 + h) return a;
    }
    return null;
  }
  // 드래그한 네모 영역(a=시작·b=끝)을 모자이크/블러로 만들어 얹음(원본은 padded로 보관→나중에 재조정 가능)
  function applyMosaic(a, b) {
    const sx = Math.round(Math.min(a.cx, b.cx)), sy = Math.round(Math.min(a.cy, b.cy));
    const sw = Math.round(Math.abs(b.cx - a.cx)), sh = Math.round(Math.abs(b.cy - a.cy));
    if (sw < 4 || sh < 4) return;
    // 원본 영역을 여유(pad)까지 떠서 보관(블러 재처리용)
    const cw = els.pageCanvas.width, ch = els.pageCanvas.height;
    const gx = Math.max(0, sx - MOSAIC_PAD), gy = Math.max(0, sy - MOSAIC_PAD);
    const gw = Math.min(cw, sx + sw + MOSAIC_PAD) - gx, gh = Math.min(ch, sy + sh + MOSAIC_PAD) - gy;
    const srcC = document.createElement("canvas"); srcC.width = gw; srcC.height = gh;
    srcC.getContext("2d").drawImage(els.pageCanvas, gx, gy, gw, gh, 0, 0, gw, gh);
    const offX = sx - gx, offY = sy - gy;
    const x = Math.min(a.px, b.px), y = Math.min(a.py, b.py);
    const w = Math.abs(b.px - a.px), h = Math.abs(b.py - a.py);
    const ann = {
      type: "image", x, y, w, h, fmt: "png", mosaic: true,
      msrc: srcC.toDataURL("image/png"), mOffX: offX, mOffY: offY, mw: sw, mh: sh,
      mmode: mosaicMode, mstrength: mosaicStrength, _srcImg: srcC,
    };
    ann.dataUrl = mosaicRender(srcC, offX, offY, sw, sh, mosaicMode, mosaicStrength);
    pushUndo();
    pages[selected].anns.push(ann);
    lastMosaic = ann;   // 방금 만든 것 → 강도/모드 슬라이더로 바로 재조정 가능
    drawOverlay();
  }

  // ---------- 지우개 ----------
  // shape:  'rect'  드래그한 네모 영역   |  'brush' 문지르듯 지움
  // target: 'all'   원본까지 흰색으로 덮기 |  'edits' 내가 얹은 편집만 지우고 원본 유지
  let eraserShape = "brush";
  let eraserTarget = "all";
  let eraserSize = 20;      // 브러쉬 지우개 지름(PDF points)
  let eraserMouse = null;   // 브러쉬 지우개 미리보기용 마지막 위치(overlay px)
  let eraserDrag = false;   // 브러쉬 지우개 드래그 중
  let eraserStroke = null;  // 모두덮기+브러쉬: 그리는 중인 흰 획
  let eraseSnap = null;     // 편집만 지우개 드래그 시작 시점 스냅샷(끝날 때 변경됐으면 커밋)
  let eraseChanged = false;

  function eraserHint() {
    const s = eraserShape === "rect" ? "네모 영역을 드래그하세요" : "누른 채 문질러 지우세요";
    const t = eraserTarget === "all" ? "원본까지 흰색으로 덮음" : "편집만 지우고 원본은 그대로";
    return `${s} · ${t}`;
  }

  // 지우개 영역(PDF 좌표) 안에 점이 드는가. region: {type:'rect',x,y,w,h} | {type:'circle',cx,cy,r}
  function pointInRegion(px, py, region, pad) {
    pad = pad || 0;
    if (region.type === "rect")
      return px >= region.x - pad && px <= region.x + region.w + pad && py >= region.y - pad && py <= region.y + region.h + pad;
    return Math.hypot(px - region.cx, py - region.cy) <= region.r + pad;
  }
  // 주석의 PDF 좌표 대략 경계(편집만 지우기 판정용)
  function annBounds(a) {
    if (a.type === "rect" || a.type === "image" || (a.type === "text" && a.ocr))
      return { x0: a.x, y0: a.y, x1: a.x + a.w, y1: a.y + a.h };
    if (a.type === "text") {
      const sz = a.size || 12;
      const w = sz * 0.6 * Math.max(1, [...(a.text || "")].length);
      return { x0: a.x, y0: a.y - sz * 0.25, x1: a.x + w, y1: a.y + sz * 0.85 };
    }
    return null;
  }
  function annIntersectsRegion(a, region) {
    const b = annBounds(a); if (!b) return false;
    if (region.type === "rect")
      return b.x0 < region.x + region.w && b.x1 > region.x && b.y0 < region.y + region.h && b.y1 > region.y;
    const nx = Math.max(b.x0, Math.min(region.cx, b.x1));
    const ny = Math.max(b.y0, Math.min(region.cy, b.y1));
    return Math.hypot(region.cx - nx, region.cy - ny) <= region.r;
  }
  // 획을 영역으로 잘라 남는 조각들 반환(지나간 부분만 삭제). 변화 없으면 [a] 그대로.
  function splitPathByRegion(a, region) {
    const pad = (a.width || 1) / 2;
    const runs = []; let cur = null;
    for (const pt of a.pts) {
      if (pointInRegion(pt[0], pt[1], region, pad)) { cur = null; }
      else { if (!cur) { cur = []; runs.push(cur); } cur.push(pt); }
    }
    if (runs.length === 1 && runs[0].length === a.pts.length) return [a];
    return runs.map(pts => ({ ...a, pts }));
  }
  // 편집만 지우기: region 안의 편집 주석 제거(획은 조각내기). 변경됐으면 true.
  function eraseEditsIn(region) {
    const anns = pages[selected].anns;
    const out = []; let changed = false;
    for (const a of anns) {
      if (a.type === "path" && a.pts && a.pts.length) {
        const kept = splitPathByRegion(a, region);
        if (kept.length === 1 && kept[0] === a) out.push(a);
        else { changed = true; out.push(...kept); }
      } else if (annIntersectsRegion(a, region)) {
        changed = true; // 통째로 제거
      } else out.push(a);
    }
    if (changed) pages[selected].anns = out;
    return changed;
  }

  // 브러쉬 지우개 커서 미리보기(원). 드래그 전·중 공통.
  function drawEraserGhost() {
    if (tool !== "eraser" || eraserShape !== "brush" || !eraserMouse || selected < 0 || !curViewport) return;
    if (!eraserDrag || eraserTarget === "edits") {
      // 모두덮기 드래그 중엔 흰 획 자체가 보이므로 커서만은 생략
      const ctx = els.overlay.getContext("2d");
      const r = Math.max(1, eraserSize * editScale / 2);
      ctx.save();
      ctx.beginPath(); ctx.arc(eraserMouse.cx, eraserMouse.cy, r, 0, Math.PI * 2);
      ctx.fillStyle = eraserTarget === "all" ? "rgba(255,255,255,0.85)" : "rgba(220,60,60,0.12)";
      ctx.fill();
      ctx.lineWidth = 1.25; ctx.strokeStyle = eraserTarget === "all" ? "rgba(60,111,240,0.9)" : "rgba(200,40,40,0.9)";
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 브러쉬(펜 / 형광펜) ----------
  // 모드별 굵기·색을 기억(펜↔형광펜 전환 시 각자 값 복원)
  const brushSettings = { pen: { color: "#111111", width: 2 }, highlight: { color: "#ffe100", width: 14 } };
  const BRUSH_MAX = { pen: 30, highlight: 45 };   // 모드별 굵기 상한
  let brushMode = "pen";
  let curStroke = null;    // 그리는 중인 획 { type:'path', pts:[[px,py]…], color, width, mode }
  let brushMouse = null;   // 마지막 마우스 위치(overlay px 좌표) — 클릭 전 미리보기용
  let textDrag = null;     // 글자 영역 드래그 시작점 {cx,cy,px,py}

  function brushRgba(hex, a) { const c = hexToRgb(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; }

  // 클릭 전, 마우스를 따라오며 '어떻게 써질지'(굵기·색·형광펜 여부)를 보여주는 미리보기 점
  function drawBrushGhost() {
    if (tool !== "brush" || curStroke || !brushMouse || selected < 0 || !curViewport) return;
    drawOverlay();
    const ctx = els.overlay.getContext("2d");
    const s = brushSettings[brushMode];
    const r = Math.max(0.5, s.width * editScale / 2);   // 실제 그려질 굵기 그대로
    ctx.save();
    ctx.beginPath(); ctx.arc(brushMouse.cx, brushMouse.cy, r, 0, Math.PI * 2);
    ctx.fillStyle = brushMode === "highlight" ? brushRgba(s.color, 0.4) : s.color;
    ctx.fill();
    // 어떤 색·굵기여도 커서 위치가 보이도록 얇은 외곽선
    ctx.beginPath(); ctx.arc(brushMouse.cx, brushMouse.cy, r + 0.75, 0, Math.PI * 2);
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.stroke();
    ctx.restore();
  }

  // 획 하나를 오버레이(화면)에 그림 — 저장된 획·그리는 중 획 공용.
  // 형광펜은 반투명 색으로 '한 번'에 그려 겹침이 진해지지 않게 한다.
  function strokeOnOverlay(ctx, a) {
    if (!a.pts || !a.pts.length || !curViewport) return;
    ctx.save();
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, a.width * editScale);
    ctx.strokeStyle = a.mode === "highlight" ? brushRgba(a.color, 0.4) : a.color;
    ctx.beginPath();
    const first = curViewport.convertToViewportPoint(a.pts[0][0], a.pts[0][1]);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < a.pts.length; i++) {
      const v = curViewport.convertToViewportPoint(a.pts[i][0], a.pts[i][1]);
      ctx.lineTo(v[0], v[1]);
    }
    if (a.pts.length === 1) ctx.lineTo(first[0] + 0.01, first[1]); // 점 하나 클릭 → 동그란 점
    ctx.stroke();
    ctx.restore();
  }

  // 도장 배치(커서 고스트·휠 크기·클릭). 이미지 삽입은 텍스트처럼 드래그-박스라 여기 미포함.
  function isPlaceTool() { return tool === "stamp"; }
  // 마우스를 따라오는 반투명 배치 미리보기
  function drawStampGhost() {
    if (!isPlaceTool() || !stampPending || !stampImg || !stampMouse) return;
    drawOverlay();
    const ctx = els.overlay.getContext("2d");
    const w = stampW * editScale, h = w * (stampPending.h / stampPending.w);
    const x = stampMouse.cx - w / 2, y = stampMouse.cy - h / 2; // 커서를 도장 중앙에
    ctx.globalAlpha = 0.55;
    ctx.drawImage(stampImg, x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#3d6ff0"; ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  // ---------- 배치된 도장(이미지) 선택·크기·회전 ----------
  let selectedAnn = -1;    // 현재 선택된 주석 인덱스(이미지 도장만)
  let annDrag = null;      // 변형 진행 상태

  // 주석의 화면(뷰포트) 기하: 중심·폭·높이·회전(rad)
  // 선택·변형 대상: 도장(image) + 글자(text, OCR층 제외)
  const isSelectable = (a) => a && (a.type === "image" || (a.type === "text" && !a.ocr));
  const _measCtx = document.createElement("canvas").getContext("2d");
  function measureTextPt(text, fontKey, size) {
    _measCtx.font = `${size}px ${FONT_CANVAS[fontKey] || FONT_CANVAS.malgun}`;
    return Math.max(4, _measCtx.measureText(text || " ").width);
  }
  // 주석의 PDF 박스(좌하단 x,y + 크기 w,h). image·box글자는 그대로, 점글자는 크기로 유추.
  function annBoxPdf(a) {
    if (a.type === "text" && !a.box) {
      const w = measureTextPt(a.text, a.font, a.size), h = a.size * 1.2;
      return { x: a.x, y: a.y - a.size * 0.25, w, h }; // y=베이스라인 → 박스 좌하단(내림 여백)
    }
    return { x: a.x, y: a.y, w: a.w, h: a.h };
  }
  // 박스 좌하단을 (bx,by)로 옮기기(타입별 기준점 보정)
  function setAnnBox(a, bx, by) {
    if (a.type === "text" && !a.box) { a.x = bx; a.y = by + a.size * 0.25; } // 베이스라인 = 박스 바닥 + 내림
    else { a.x = bx; a.y = by; }
  }
  function annGeom(a) {
    const b = annBoxPdf(a);
    const [scx, scy] = curViewport.convertToViewportPoint(b.x + b.w / 2, b.y + b.h / 2);
    return { cx: scx, cy: scy, w: b.w * editScale, h: b.h * editScale, rot: (a.rot || 0) * Math.PI / 180, rotatable: a.type === "image" };
  }
  // 모서리·회전 핸들 화면 좌표
  function annHandles(g) {
    const hw = g.w / 2, hh = g.h / 2, c = Math.cos(g.rot), s = Math.sin(g.rot);
    const rp = (dx, dy) => ({ x: g.cx + dx * c - dy * s, y: g.cy + dx * s + dy * c });
    return { corners: [rp(-hw, -hh), rp(hw, -hh), rp(hw, hh), rp(-hw, hh)], rotate: rp(0, -hh - 26), rotBase: rp(0, -hh) };
  }
  // 선택 테두리·핸들 그리기(drawOverlay 끝에서 호출)
  function drawSelectionChrome(ctx) {
    if (tool !== "select" || selectedAnn < 0 || !pages[selected]) return;
    const a = pages[selected].anns[selectedAnn];
    if (!isSelectable(a)) return;
    const g = annGeom(a), H = annHandles(g);
    ctx.save();
    ctx.strokeStyle = "#3d6ff0"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    H.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath(); ctx.stroke();
    if (g.rotatable) { // 회전은 도장만
      ctx.beginPath(); ctx.moveTo(H.rotBase.x, H.rotBase.y); ctx.lineTo(H.rotate.x, H.rotate.y); ctx.stroke();
      ctx.fillStyle = "#3d6ff0"; ctx.beginPath(); ctx.arc(H.rotate.x, H.rotate.y, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#fff";
    H.corners.forEach((p) => { ctx.beginPath(); ctx.rect(p.x - 5, p.y - 5, 10, 10); ctx.fill(); ctx.stroke(); });
    ctx.restore();
  }
  // 마우스가 선택된 대상의 어느 부위에 있나: rotate / resize(모서리) / move / null
  function hitHandle(mx, my, a) {
    const g = annGeom(a), H = annHandles(g);
    if (g.rotatable && Math.hypot(mx - H.rotate.x, my - H.rotate.y) <= 9) return { type: "rotate" };
    for (let i = 0; i < 4; i++) if (Math.hypot(mx - H.corners[i].x, my - H.corners[i].y) <= 9) return { type: "resize", corner: i };
    const dx = mx - g.cx, dy = my - g.cy, c = Math.cos(g.rot), s = Math.sin(g.rot);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2) return { type: "move" };
    return null;
  }
  // 해당 좌표에 있는 최상단 선택가능 주석 인덱스
  function annAt(mx, my) {
    const anns = pages[selected].anns;
    for (let i = anns.length - 1; i >= 0; i--) {
      if (!isSelectable(anns[i])) continue;
      const g = annGeom(anns[i]), dx = mx - g.cx, dy = my - g.cy, c = Math.cos(g.rot), s = Math.sin(g.rot);
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      if (Math.abs(lx) <= g.w / 2 && Math.abs(ly) <= g.h / 2) return i;
    }
    return -1;
  }
  function beginAnnDrag(h, a, m) {
    const b = annBoxPdf(a), g = annGeom(a);
    annDrag = {
      mode: h.type, corner: h.corner, dirty: false,
      startMx: m.cx, startMy: m.cy,
      orig: { x: b.x, y: b.y, w: b.w, h: b.h, rot: a.rot || 0, size: a.size, text: a.text },
      centerPdf: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
      centerVp: { x: g.cx, y: g.cy },
      // 잡은 지점과 중심의 PDF(내용) 좌표 차이 — 회전된 페이지에서도 정확히 이동
      grabPdf: { x: (b.x + b.w / 2) - m.px, y: (b.y + b.h / 2) - m.py },
      startDist: Math.max(1, Math.hypot(m.cx - g.cx, m.cy - g.cy)),
      startAng: Math.atan2(m.cy - g.cy, m.cx - g.cx),
    };
  }
  function applyAnnDrag(a, m) {
    if (!annDrag.dirty) { pushUndo(); annDrag.dirty = true; }
    const o = annDrag.orig;
    if (annDrag.mode === "move") {
      // 새 박스 좌하단 = 커서(PDF) + 잡은 오프셋 - 반크기 → 어느 방향으로 끌든 커서를 따라감
      setAnnBox(a, (m.px + annDrag.grabPdf.x) - o.w / 2, (m.py + annDrag.grabPdf.y) - o.h / 2);
    } else if (annDrag.mode === "resize") {
      const scale = Math.max(0.05, Math.hypot(m.cx - annDrag.centerVp.x, m.cy - annDrag.centerVp.y) / annDrag.startDist);
      const anchorLeft = o.x, anchorTop = o.y + o.h; // 원래 박스의 좌상단을 고정값으로
      if (a.type === "image") {
        a.w = Math.max(8, o.w * scale); a.h = Math.max(8, o.h * scale);
      } else if (a.type === "text") {
        a.size = Math.max(4, Math.min(400, o.size * scale)); // 글자 크기 조절
        if (a.box) {
          a.w = Math.max(8, o.w * scale); a.h = Math.max(8, o.h * scale);
          a.lines = wrapToWidth(o.text || (a.lines || []).join("\n"), a.font, a.size, a.w - a.size * TXT_PADX * 2);
        }
      }
      const b = annBoxPdf(a);               // 새 크기의 박스
      setAnnBox(a, anchorLeft, anchorTop - b.h); // 좌상단 고정(오른쪽·아래로 커짐)
    } else if (annDrag.mode === "rotate") {
      if (a.type === "image") {
        const ang = Math.atan2(m.cy - annDrag.centerVp.y, m.cx - annDrag.centerVp.x);
        a.rot = o.rot + (ang - annDrag.startAng) * 180 / Math.PI;
      }
    }
  }

  els.overlay.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;            // 좌클릭만 배치/드래그(우클릭=contextmenu가 처리)
    if (selected < 0 || !curViewport) return;
    if (tool === "eraser") {
      if (editingLocked()) return;
      const hit = overlayToPdf(e);
      if (eraserShape === "rect") { dragStart = hit; return; }
      // 브러쉬 지우개
      eraserDrag = true; eraserMouse = hit;
      if (eraserTarget === "all") {
        eraserStroke = { type: "path", pts: [[hit.px, hit.py]], color: "#ffffff", width: eraserSize, mode: "pen" };
      } else {
        eraseSnap = snapshot(); eraseChanged = false;
        if (eraseEditsIn({ type: "circle", cx: hit.px, cy: hit.py, r: eraserSize / 2 })) eraseChanged = true;
        drawOverlay(); drawEraserGhost();
      }
      return;
    }
    if (tool === "mosaic" && !editingLocked()) {
      dragStart = overlayToPdf(e); // 모자이크/블러 영역 드래그 시작(네모)
      return;
    }
    if (tool === "image" && imagePending && !editingLocked()) {
      dragStart = overlayToPdf(e); // 이미지 넣을 영역 드래그 시작
      return;
    }
    if (tool === "text" && !editingLocked()) {
      textDrag = overlayToPdf(e); // 드래그로 글자 영역 지정 시작
      return;
    }
    if (tool === "brush" && !editingLocked()) {
      const hit = overlayToPdf(e);
      const s = brushSettings[brushMode];
      curStroke = { type: "path", pts: [[hit.px, hit.py]], color: s.color, width: s.width, mode: brushMode };
      return;
    }
    if (tool === "select" && !editingLocked()) {
      const m = overlayToPdf(e);
      if (selectedAnn >= 0) {
        const a = pages[selected].anns[selectedAnn];
        const h = isSelectable(a) ? hitHandle(m.cx, m.cy, a) : null;
        if (h) { beginAnnDrag(h, a, m); return; }
      }
      const idx = annAt(m.cx, m.cy);
      selectedAnn = idx; drawOverlay();
      if (idx >= 0) beginAnnDrag({ type: "move" }, pages[selected].anns[idx], m);
    }
  });
  els.overlay.addEventListener("mousemove", (e) => {
    if (isPlaceTool() && stampPending && stampImg) {
      stampMouse = overlayToPdf(e);
      drawStampGhost();
      return;
    }
    if (tool === "select") {
      const m = overlayToPdf(e);
      if (annDrag && selectedAnn >= 0) { applyAnnDrag(pages[selected].anns[selectedAnn], m); drawOverlay(); return; }
      // 드래그 아닐 땐 커서로 조작 부위 안내
      let cur = "default";
      if (selectedAnn >= 0) {
        const a = pages[selected].anns[selectedAnn];
        const h = isSelectable(a) ? hitHandle(m.cx, m.cy, a) : null;
        cur = h ? (h.type === "rotate" ? "grab" : h.type === "resize" ? "nwse-resize" : "move") : "default";
      }
      els.overlay.style.cursor = cur;
      return;
    }
    if (tool === "text" && textDrag) { // 글자 영역 드래그 미리보기(점선 네모)
      const now = overlayToPdf(e);
      drawOverlay();
      const ctx = els.overlay.getContext("2d");
      ctx.strokeStyle = "#c96442"; ctx.setLineDash([5, 3]);
      ctx.strokeRect(Math.min(textDrag.cx, now.cx), Math.min(textDrag.cy, now.cy),
        Math.abs(now.cx - textDrag.cx), Math.abs(now.cy - textDrag.cy));
      ctx.setLineDash([]);
      return;
    }
    if (tool === "brush" && !curStroke) { // 클릭 전: 마우스 따라오는 미리보기
      if (!curViewport) return;
      brushMouse = overlayToPdf(e); drawBrushGhost();
      return;
    }
    if (tool === "brush" && curStroke) {
      const hit = overlayToPdf(e);
      const last = curStroke.pts[curStroke.pts.length - 1];
      const dv = curViewport.convertToViewportPoint(hit.px, hit.py);
      const lv = curViewport.convertToViewportPoint(last[0], last[1]);
      if (Math.hypot(dv[0] - lv[0], dv[1] - lv[1]) >= 1.5) curStroke.pts.push([hit.px, hit.py]); // 화면 1.5px 이상 이동 시만 점 추가
      drawOverlay();
      strokeOnOverlay(els.overlay.getContext("2d"), curStroke);
      return;
    }
    if (tool === "eraser" && eraserShape === "brush") {
      const hit = overlayToPdf(e); eraserMouse = hit;
      if (eraserDrag && eraserTarget === "all" && eraserStroke) {
        const last = eraserStroke.pts[eraserStroke.pts.length - 1];
        const dv = curViewport.convertToViewportPoint(hit.px, hit.py);
        const lv = curViewport.convertToViewportPoint(last[0], last[1]);
        if (Math.hypot(dv[0] - lv[0], dv[1] - lv[1]) >= 1.5) eraserStroke.pts.push([hit.px, hit.py]);
        drawOverlay();
        strokeOnOverlay(els.overlay.getContext("2d"), eraserStroke);
      } else if (eraserDrag) { // 편집만 문지르기
        if (eraseEditsIn({ type: "circle", cx: hit.px, cy: hit.py, r: eraserSize / 2 })) eraseChanged = true;
        drawOverlay(); drawEraserGhost();
      } else { // 드래그 전 커서 미리보기
        drawOverlay(); drawEraserGhost();
      }
      return;
    }
    if (tool === "mosaic" && dragStart) { // 모자이크 영역 드래그 미리보기(반투명 채움 + 점선)
      const now = overlayToPdf(e);
      drawOverlay();
      const ctx = els.overlay.getContext("2d");
      const rx = Math.min(dragStart.cx, now.cx), ry = Math.min(dragStart.cy, now.cy);
      const rw = Math.abs(now.cx - dragStart.cx), rh = Math.abs(now.cy - dragStart.cy);
      ctx.fillStyle = "rgba(61,111,240,0.18)"; ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = "#3d6ff0"; ctx.setLineDash([5, 3]); ctx.strokeRect(rx, ry, rw, rh); ctx.setLineDash([]);
      return;
    }
    if (tool === "image" && imagePending && dragStart) { // 이미지 배치 미리보기(박스 안 비율맞춤 반투명)
      const now = overlayToPdf(e);
      drawOverlay();
      const ctx = els.overlay.getContext("2d");
      const rx = Math.min(dragStart.cx, now.cx), ry = Math.min(dragStart.cy, now.cy);
      const rw = Math.abs(now.cx - dragStart.cx), rh = Math.abs(now.cy - dragStart.cy);
      if (rw > 2 && rh > 2 && imagePending.img && imagePending.img.complete) {
        const s = Math.min(rw / imagePending.w, rh / imagePending.h);
        const w = imagePending.w * s, h = imagePending.h * s;
        ctx.globalAlpha = 0.6; ctx.drawImage(imagePending.img, rx + (rw - w) / 2, ry + (rh - h) / 2, w, h); ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "#3d6ff0"; ctx.setLineDash([5, 3]); ctx.strokeRect(rx, ry, rw, rh); ctx.setLineDash([]);
      return;
    }
    if (tool === "eraser" && dragStart) {
      const now = overlayToPdf(e);
      drawOverlay();
      const ctx = els.overlay.getContext("2d");
      ctx.strokeStyle = "#3d6ff0"; ctx.setLineDash([5, 3]);
      ctx.strokeRect(Math.min(dragStart.cx, now.cx), Math.min(dragStart.cy, now.cy),
        Math.abs(now.cx - dragStart.cx), Math.abs(now.cy - dragStart.cy));
      ctx.setLineDash([]);
    }
  });
  els.overlay.addEventListener("mouseleave", () => {
    if (isPlaceTool() && stampPending) { stampMouse = null; drawOverlay(); }
    if (tool === "brush" && !curStroke) { brushMouse = null; drawOverlay(); }
    if (tool === "eraser" && eraserShape === "brush" && !eraserDrag) { eraserMouse = null; drawOverlay(); }
  });
  // 휠 → 도장/브러쉬 크기 조절
  els.overlay.addEventListener("wheel", (e) => {
    if (selected < 0 || !curViewport) return;
    if (e.ctrlKey || e.metaKey) { // Ctrl(⌘)+휠 = 확대/축소 (어느 도구든)
      e.preventDefault();
      setZoom(editScale + (e.deltaY < 0 ? 0.1 : -0.1)); // 위=확대, 아래=축소(10% 단위)
      return;
    }
    if (isPlaceTool() && stampPending) { // 도장 배치 중 크기 조절
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      stampW = Math.max(20, Math.min(800, stampW * factor));
      drawStampGhost();
      return;
    }
    if (tool === "brush") { // 펜/형광펜 굵기 휠 조절(모드별 상한)
      e.preventDefault();
      const s = brushSettings[brushMode];
      const next = s.width + (e.deltaY < 0 ? 1 : -1);
      s.width = Math.max(1, Math.min(BRUSH_MAX[brushMode], next));
      els.brushWidth.value = s.width; els.brushWidthVal.textContent = s.width;
      drawBrushGhost();
      return;
    }
    if (tool === "eraser" && eraserShape === "brush") { // 브러쉬 지우개 크기 휠 조절
      e.preventDefault();
      eraserSize = Math.max(4, Math.min(80, eraserSize + (e.deltaY < 0 ? 2 : -2)));
      els.eraserSize.value = eraserSize; els.eraserSizeVal.textContent = eraserSize;
      if (curViewport) { drawOverlay(); drawEraserGhost(); }
      return;
    }
    // 그 외 기본 휠 = 다음/전 페이지 (아래로=다음, 위로=이전)
    e.preventDefault();
    goPage(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  // 사이드바 휠: 도구가 오버레이 휠을 크기조절로 쓰는 중이면(브러쉬/도장/지우개브러쉬) 사이드바 휠로 페이지 전환
  els.thumbs.addEventListener("wheel", (e) => {
    if (selected < 0 || e.ctrlKey || e.metaKey) return;
    if (wheelAdjustsSize()) { e.preventDefault(); goPage(e.deltaY > 0 ? 1 : -1); }
  }, { passive: false });
  els.overlay.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;            // 우클릭 등은 도장 찍지 않음(커서만 바뀜)
    if (selected < 0 || !curViewport || editingLocked()) return;
    const hit = overlayToPdf(e);

    if (tool === "select") { annDrag = null; return; }
    if (tool === "brush" && curStroke) {
      const stroke = curStroke; curStroke = null;
      if (stroke.pts.length) { pushUndo(); pages[selected].anns.push(stroke); }
      drawOverlay();
      brushMouse = hit; drawBrushGhost(); // 방금 뗀 자리에 미리보기 다시 표시
      return;
    }
    if (tool === "eraser" && eraserDrag) { // 브러쉬 지우개 뗌
      eraserDrag = false;
      if (eraserTarget === "all") {
        const stroke = eraserStroke; eraserStroke = null;
        if (stroke && stroke.pts.length) { pushUndo(); pages[selected].anns.push(stroke); }
      } else {
        if (eraseChanged) commitUndo(eraseSnap);
        eraseSnap = null; eraseChanged = false;
      }
      eraserMouse = hit; drawOverlay(); drawEraserGhost();
      return;
    }
    if (tool === "image" && dragStart) { // 이미지 배치 영역 뗌
      const start = dragStart; dragStart = null;
      if (imagePending) applyImageBox(start, hit);
      return;
    }
    if (tool === "mosaic" && dragStart) { // 모자이크/블러 영역 뗌
      const start = dragStart; dragStart = null;
      const moved = Math.abs(hit.cx - start.cx) > 5 || Math.abs(hit.cy - start.cy) > 5;
      if (moved) {
        applyMosaic(start, hit); // 드래그 → 새 모자이크
      } else {
        const m = topMosaicAt(start.cx, start.cy); // 짧은 클릭 → 그 자리 모자이크를 조정 대상으로
        if (m) { lastMosaic = m; mosaicMode = m.mmode; mosaicStrength = m.mstrength; syncMosaicInputs(); hint("이 모자이크를 강도/모드 슬라이더로 조정할 수 있어요"); }
      }
      return;
    }
    if (tool === "eraser" && dragStart) { // 도형(네모) 지우개 뗌
      const x = Math.min(dragStart.px, hit.px), y = Math.min(dragStart.py, hit.py);
      const w = Math.abs(hit.px - dragStart.px), h = Math.abs(hit.py - dragStart.py);
      dragStart = null;
      if (w > 2 && h > 2) {
        if (eraserTarget === "all") {
          pushUndo(); pages[selected].anns.push({ type: "rect", x, y, w, h, color: "#ffffff" });
        } else {
          const snap = snapshot();
          if (eraseEditsIn({ type: "rect", x, y, w, h })) commitUndo(snap);
        }
        drawOverlay();
      }
      return;
    }
    if (tool === "text") {
      const s = textDrag; textDrag = null;
      drawOverlay();
      if (s && (Math.abs(hit.cx - s.cx) > 6 || Math.abs(hit.cy - s.cy) > 6)) {
        // 드래그로 영역 지정 → 그 박스 안에 글자 입력(자동 줄바꿈)
        openBoxText(s, hit);
      } else {
        openTextInput(hit); // 짧은 클릭 → 한 점 글자(기존 방식)
      }
      return;
    }
    if (isPlaceTool() && stampPending) {
      const w = stampW, h = w * (stampPending.h / stampPending.w);
      pushUndo();
      pages[selected].anns.push({ type: "image", x: hit.px - w / 2, y: hit.py - h / 2, w, h, dataUrl: stampPending.dataUrl, fmt: stampPending.fmt });
      drawOverlay();
      return;
    }
  });

  // 어떤 도구에서든 우클릭 → 기본 선택 커서로(진행 중이던 배치·드래그는 취소)
  els.overlay.addEventListener("contextmenu", (e) => {
    if (tool === "select") return; // 이미 기본 커서
    e.preventDefault();
    const wasPlacing = stampPending; // 도장 배치 중이었나(선택 편의용)
    // 진행 중 상태 모두 취소
    stampPending = null; stampImg = null; stampMouse = null;
    curStroke = null; dragStart = null; textDrag = null; imagePending = null;
    eraserDrag = false; eraserStroke = null; eraserMouse = null; eraseSnap = null; eraseChanged = false;
    setTool("select");
    if (wasPlacing) { // 방금 찍던 도장 있으면 마지막 이미지 선택
      const anns = pages[selected] ? pages[selected].anns : [];
      selectedAnn = -1;
      for (let i = anns.length - 1; i >= 0; i--) { if (anns[i].type === "image") { selectedAnn = i; break; } }
    }
    drawOverlay();
  });
  // 선택된 도장 삭제(Delete) · 선택 해제(Esc)
  document.addEventListener("keydown", (e) => {
    if (tool !== "select" || selectedAnn < 0) return;
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (editingLocked()) return;
      pushUndo();
      pages[selected].anns.splice(selectedAnn, 1);
      selectedAnn = -1; annDrag = null; drawOverlay();
      e.preventDefault();
    } else if (e.key === "Escape") {
      selectedAnn = -1; annDrag = null; drawOverlay();
    }
  });

  // 글자 작성 직후: 선택도구로 전환하고 방금 만든 주석을 선택(핸들 바로 표시)
  function selectAfterCreate() {
    const idx = pages[selected].anns.length - 1;
    setTool("select");
    selectedAnn = idx;
    drawOverlay();
  }

  function openTextInput(hit) {
    const inp = els.textInput;
    const size = parseInt(els.fontSize.value, 10), fontKey = els.fontFamily.value;
    inp.value = "";
    inp.style.display = "block";
    inp.style.left = hit.cx + "px";
    inp.style.top = (hit.cy - (size * editScale)) + "px";
    inp.style.fontSize = (size * editScale) + "px";
    inp.style.fontFamily = FONT_CANVAS[fontKey] || FONT_CANVAS.malgun;
    inp.style.color = els.fontColor.value;
    setTimeout(() => inp.focus(), 0);
    const commit = () => {
      inp.removeEventListener("keydown", onKey);
      inp.removeEventListener("blur", commit);
      inp.style.display = "none";
      const text = inp.value.trim();
      if (text) {
        pushUndo();
        pages[selected].anns.push({ type: "text", x: hit.px, y: hit.py, text, size, color: els.fontColor.value, font: fontKey });
        selectAfterCreate(); // 작성 후 선택도구로 전환+방금 글자 선택 → 바로 크기·위치 조정
      }
    };
    const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { inp.value = ""; commit(); } };
    inp.addEventListener("keydown", onKey);
    inp.addEventListener("blur", commit);
  }

  // 드래그로 지정한 박스 안에 여러 줄 글자 입력(자동 줄바꿈). start·end = overlayToPdf 결과.
  function openBoxText(start, end) {
    const ta = els.textArea;
    const size = parseInt(els.fontSize.value, 10), fontKey = els.fontFamily.value;
    const x = Math.min(start.px, end.px), yTop = Math.max(start.py, end.py);
    const wPt = Math.abs(end.px - start.px), hPt = Math.abs(end.py - start.py);
    const left = Math.min(start.cx, end.cx), top = Math.min(start.cy, end.cy);
    const wScr = Math.abs(end.cx - start.cx), hScr = Math.abs(end.cy - start.cy);
    ta.value = "";
    ta.style.display = "block";
    ta.style.left = left + "px"; ta.style.top = top + "px";
    ta.style.width = wScr + "px"; ta.style.height = hScr + "px";
    ta.style.fontSize = (size * editScale) + "px";
    ta.style.fontFamily = FONT_CANVAS[fontKey] || FONT_CANVAS.malgun;
    ta.style.color = els.fontColor.value;
    setTimeout(() => ta.focus(), 0);
    const commit = (cancel) => {
      ta.removeEventListener("keydown", onKey);
      ta.removeEventListener("blur", onBlur);
      ta.style.display = "none";
      const text = ta.value.replace(/\s+$/, "");
      if (!cancel && text) {
        const lines = wrapToWidth(text, fontKey, size, wPt - size * TXT_PADX * 2); // 좌우 여백 고려
        pushUndo();
        // (x,yTop-hPt)=박스 좌하단, w/h=박스 크기(pt)
        pages[selected].anns.push({ type: "text", box: true, x, y: yTop - hPt, w: wPt, h: hPt, size, color: els.fontColor.value, font: fontKey, lines, text });
        selectAfterCreate(); // 작성 후 선택도구로 전환+방금 글자 선택
      } else { drawOverlay(); }
    };
    const onBlur = () => commit(false);
    const onKey = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { // Ctrl+Enter = 줄바꿈 삽입
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + "\n" + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 1;
      } else if (e.key === "Enter") { e.preventDefault(); commit(false); } // 그냥 Enter = 완성
      else if (e.key === "Escape") { e.preventDefault(); commit(true); }   // Esc = 취소
    };
    ta.addEventListener("keydown", onKey);
    ta.addEventListener("blur", onBlur);
  }

  // 스탬프 이미지 선택
  els.fileStamp.addEventListener("change", async () => {
    const f = els.fileStamp.files[0]; els.fileStamp.value = "";
    if (!f) return;
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    loadStampImage(dataUrl);
  });

  // 이미지 삽입: 파일 선택 → PNG로 정규화 → 텍스트처럼 드래그한 박스에 비율 맞춰 배치
  els.fileImage.addEventListener("change", async () => {
    const f = els.fileImage.files[0]; els.fileImage.value = "";
    if (!f) { imagePending = null; if (tool === "image") setTool("select"); return; } // 취소 시 선택도구로
    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext("2d").drawImage(im, 0, 0);
      const png = c.toDataURL("image/png");
      const pimg = new Image(); pimg.src = png;   // 미리보기용
      imagePending = { dataUrl: png, w: c.width, h: c.height, img: pimg };
      hint("이미지를 넣을 영역을 네모로 드래그하세요 (비율 유지) · 다른 도구로 바꾸면 종료");
    };
    im.onerror = () => { alert("이미지를 읽을 수 없습니다."); setTool("select"); };
    im.src = dataUrl;
  });
  // 드래그한 박스(start·end) 안에 대기 이미지를 비율 유지(contain)로 배치
  function applyImageBox(start, end) {
    if (!imagePending) return;
    const bx = Math.min(start.px, end.px), by = Math.min(start.py, end.py);
    const bw = Math.abs(end.px - start.px), bh = Math.abs(end.py - start.py);
    if (bw < 4 || bh < 4) return;
    const s = Math.min(bw / imagePending.w, bh / imagePending.h);
    const w = imagePending.w * s, h = imagePending.h * s;
    const x = bx + (bw - w) / 2, y = by + (bh - h) / 2; // 박스 중앙 정렬
    pushUndo();
    pages[selected].anns.push({ type: "image", x, y, w, h, dataUrl: imagePending.dataUrl, fmt: "png" });
    drawOverlay();
  }

  // ---------- 도장 만들기 팝업 ----------
  let stampImgOrig = null;  // 업로드 원본 ImageData(누끼 재적용용)
  // 법인 도장 가운데 代表理事(전서체) 고정 이미지 — 참고 도장에서 떠온 것
  let daepyoImg = null, daepyoReady = false;
  (function loadDaepyo() {
    daepyoImg = new Image();
    daepyoImg.onload = () => { daepyoReady = true; if (els.stampModal.style.display !== "none") drawNameStamp(); };
    daepyoImg.src = "lib/daepyo.png?v=17";
  })();

  function openStampModal() { els.stampModal.style.display = "flex"; setStampMode("image"); drawNameStamp(); ensureStampFonts().then(drawNameStamp); }
  function closeStampModal(revert) { els.stampModal.style.display = "none"; if (revert && !stampPending) setTool("select"); }
  function setStampMode(mode) {
    els.modeImage.style.display = mode === "image" ? "block" : "none";
    els.modeName.style.display = mode === "name" ? "block" : "none";
    document.querySelectorAll(".mtab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
    els.stampModal.dataset.mode = mode;
  }
  function loadStampImage(dataUrl) {
    setStampMode("image");
    const im = new Image();
    im.onload = () => {
      const max = 400; let w = im.naturalWidth, h = im.naturalHeight;
      const s = Math.min(1, max / Math.max(w, h)); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
      const c = els.stampImgCanvas; c.width = w; c.height = h;
      const ctx = c.getContext("2d"); ctx.clearRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h);
      stampImgOrig = ctx.getImageData(0, 0, w, h);
      els.imgEditor.style.display = "block";
      applyCut();
    };
    im.src = dataUrl;
  }
  function applyCut() {
    if (!stampImgOrig) return;
    const c = els.stampImgCanvas, ctx = c.getContext("2d");
    const src = stampImgOrig.data;
    const out = ctx.createImageData(c.width, c.height), o = out.data;
    const on = els.cutBg.checked;
    const tol = parseInt(els.cutTol.value, 10);      // 배경으로 볼 밝기 임계(높을수록 더 많이 지움)
    const th = 255 - tol;                            // 이 밝기 이상이면 완전 배경
    const recolor = els.cutRecolor.checked;
    const solid = els.cutSolid.checked;
    const rc = hexToRgb(els.cutColor.value);
    const R = Math.round(rc.r * 255), G = Math.round(rc.g * 255), B = Math.round(rc.b * 255);
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      let alpha = src[i + 3];
      if (on) {
        const bright = (r + g + b) / 3;              // 0=검정 … 255=흰색
        if (bright >= th) alpha = 0;                 // 밝은 배경 → 투명
        else {
          // 잉크가 진할수록 불투명하게(모양·연한 획 보존)
          alpha = Math.min(255, Math.round((th - bright) * 255 / Math.max(1, th)));
          if (solid && alpha > 30) alpha = 255;      // 진하게: 남은 획을 꽉 채움
        }
      }
      o[i + 3] = alpha;
      if (recolor) { o[i] = R; o[i + 1] = G; o[i + 2] = B; }   // 도장 색 통일
      else { o[i] = r; o[i + 1] = g; o[i + 2] = b; }
    }
    ctx.putImageData(out, 0, 0);
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // 타원(막도장)=바탕체, 원/네모=전서체(첨부 폰트)
  const ELLIPSE_FONT = '"Batang", "바탕", serif';
  const SEAL_FONT = '"Hanjeonseo", "Batang", "바탕", serif';
  // 커스텀 폰트 로드 보장(캔버스는 로드 전엔 fallback으로 그림)
  async function ensureStampFonts() {
    if (!document.fonts) return;
    try { await Promise.all([document.fonts.load('40px "Hanjeonseo"'), document.fonts.load('40px "Batang"')]); } catch (_) {}
  }
  function stampText(ctx, ch, x, y, fs, color, fatten) {
    ctx.fillStyle = color;
    if (fatten > 0) { ctx.strokeStyle = color; ctx.lineJoin = "round"; ctx.lineWidth = Math.max(0.5, fs * fatten); ctx.strokeText(ch, x, y); }
    ctx.fillText(ch, x, y);
  }
  // 이름 세로쓰기(막도장): 한 열로 위→아래
  function drawVertical(ctx, chars, cx, cy, maxW, maxH, color, fill, fatten) {
    const n = Math.max(1, chars.length), cellH = maxH / n;
    const fs = Math.min(cellH * (fill || 0.85), maxW);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `700 ${fs}px ${ELLIPSE_FONT}`;
    const startY = cy - (n - 1) / 2 * cellH;
    chars.forEach((ch, i) => stampText(ctx, ch, cx, startY + i * cellH, fs, color, fatten || 0));
  }
  // 격자(인장): 전통식 오른쪽 열부터 위→아래
  function drawGrid(ctx, chars, x, y, w, h, color, fill, fatten, font) {
    const n = chars.length, cols = n <= 1 ? 1 : 2, rows = Math.ceil(n / cols);
    const cellW = w / cols, cellH = h / rows;
    const fs = Math.min(cellW, cellH) * (fill || 0.9);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `700 ${fs}px ${font || SEAL_FONT}`;
    for (let idx = 0; idx < n; idx++) {
      const col = Math.floor(idx / rows), row = idx % rows, xIdx = cols - 1 - col;
      stampText(ctx, chars[idx], x + (xIdx + 0.5) * cellW, y + (row + 0.5) * cellH, fs, color, fatten || 0);
    }
  }
  // 원형 배치(법인 상호): 위쪽 비표 자리는 비우고 시계방향으로 두름
  function circularText(ctx, chars, cx, cy, radius, color) {
    const n = chars.length; if (!n) return;
    const gap = 22, startCW = gap, endCW = 360 - gap, fs = 50;   // 12시 점 옆 여백 축소
    ctx.font = `700 ${fs}px ${SEAL_FONT}`;
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineJoin = "round"; ctx.lineWidth = fs * 0.03; // 얇게
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      const angCW = startCW + (endCW - startCW) * (i + 0.5) / n;
      const a = (-90 + angCW) * Math.PI / 180;
      const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.scale(1.3, 1); // 좌우폭 늘림
      ctx.strokeText(chars[i], 0, 0); ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
  }
  function drawNameStamp() {
    const shape = els.stampShape.value, name = (els.stampName.value || "").trim(), color = els.stampColor.value;
    const c = els.stampNameCanvas, ctx = c.getContext("2d");
    const chars = [...name];
    if (shape === "ellipse") {
      // 세로 타원 + 이름 세로쓰기(막도장)
      c.width = 300; c.height = 430; ctx.clearRect(0, 0, c.width, c.height);
      const cx = c.width / 2, cy = c.height / 2, rx = c.width / 2 - 20, ry = c.height / 2 - 20;
      ctx.strokeStyle = color; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      drawVertical(ctx, chars.length ? chars : [" "], cx, cy, rx * 1.55, ry * 1.72, color, 0.92, 0.06);
    } else if (shape === "circle") {
      // 원형 + 이름+인 격자(인감 스타일)
      c.width = 360; c.height = 360; ctx.clearRect(0, 0, c.width, c.height);
      const cx = c.width / 2, cy = c.height / 2, lw = 9, r = c.width / 2 - 16;
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r - lw / 2, 0, Math.PI * 2); ctx.clip();     // 원 밖 글자 잘라내기
      ctx.translate(cx, cy); ctx.scale(0.78, 1); ctx.translate(-cx, -cy);            // 가로 압축 → 얇게
      const side = r * 1.62;
      drawGrid(ctx, chars.concat(["인"]), cx - side / 2, cy - side / 2, side, side, color, 0.86, 0);
      ctx.restore();
    } else if (shape === "square") {
      // 네모 + 이름+인 격자
      c.width = 340; c.height = 340; ctx.clearRect(0, 0, c.width, c.height);
      const pad = 16, lw = 16;
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      roundRect(ctx, pad, pad, c.width - 2 * pad, c.height - 2 * pad, 14); ctx.stroke();
      const inX = pad + lw, inY = pad + lw, inW = c.width - 2 * (pad + lw), inH = c.height - 2 * (pad + lw);
      drawGrid(ctx, chars.concat(["인"]), inX, inY, inW, inH, color, 0.9, 0);
    } else if (shape === "corp") {
      // 법인 인감: 가운데 원(참고 이미지 그대로) + 바깥 원에 상호(전서체 원형) + 비표(●)
      c.width = 400; c.height = 400; ctx.clearRect(0, 0, 400, 400);
      const cx = 200, cy = 200, rOuter = 190, rC = 124, rMid = (rOuter + rC) / 2;
      ctx.strokeStyle = color; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(cx, cy, rOuter, 0, Math.PI * 2); ctx.stroke();     // 바깥 원 테두리
      circularText(ctx, [...name.replace(/\s+/g, "")], cx, cy, rMid, color);      // 상호(전서체 원형)
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy - rMid, 8, 0, Math.PI * 2); ctx.fill(); // 비표
      if (daepyoReady) {                                                          // 가운데 원 = 참고 이미지 그대로
        const s = rC * 2;
        ctx.drawImage(daepyoImg, cx - s / 2, cy - s / 2, s, s);
      }
      ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, rC + 2, 0, Math.PI * 2); ctx.stroke(); // 안쪽 얇은 원(한자에 인접)
    }
  }
  function useStamp() {
    const mode = els.stampModal.dataset.mode;
    let canvas;
    if (mode === "image") { if (!stampImgOrig) { alert("먼저 이미지를 넣어주세요."); return; } canvas = els.stampImgCanvas; }
    else { canvas = els.stampNameCanvas; }
    const dataUrl = canvas.toDataURL("image/png");
    stampPending = { dataUrl, fmt: "png", w: canvas.width, h: canvas.height };
    stampW = 40; stampMouse = null;
    stampImg = new Image(); stampImg.onload = drawStampGhost; stampImg.src = dataUrl;
    els.stampModal.style.display = "none";
    hint("마우스를 따라오는 도장을 원하는 위치에 클릭 · 클릭 전 휠로 크기 조절");
  }

  document.querySelectorAll(".mtab").forEach((t) => t.addEventListener("click", () => setStampMode(t.dataset.mode)));
  els.stampPick.addEventListener("click", () => els.fileStamp.click());
  els.stampClose.addEventListener("click", () => closeStampModal(true));
  els.stampCancel.addEventListener("click", () => closeStampModal(true));
  els.stampUse.addEventListener("click", useStamp);
  els.cutBg.addEventListener("change", applyCut);
  els.cutTol.addEventListener("input", () => { els.cutTolVal.textContent = els.cutTol.value; applyCut(); });
  els.cutRecolor.addEventListener("change", applyCut);
  els.cutColor.addEventListener("input", applyCut);
  els.cutSolid.addEventListener("change", applyCut);
  [els.stampShape, els.stampName, els.stampColor].forEach((el) => el.addEventListener("input", drawNameStamp));
  els.stampShape.addEventListener("change", () => {
    const corp = els.stampShape.value === "corp";
    els.nameLabel.textContent = corp ? "상호" : "이름";
    const v = els.stampName.value.trim();
    if (corp && (v === "" || v === "홍길동")) els.stampName.value = "주식회사 세무회계";
    if (!corp && v === "주식회사 세무회계") els.stampName.value = "홍길동";
    drawNameStamp();
  });
  els.stampDrop.addEventListener("dragover", (e) => { e.preventDefault(); els.stampDrop.classList.add("dragover"); });
  els.stampDrop.addEventListener("dragleave", () => els.stampDrop.classList.remove("dragover"));
  els.stampDrop.addEventListener("drop", (e) => {
    e.preventDefault(); els.stampDrop.classList.remove("dragover");
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
    if (f) { const r = new FileReader(); r.onload = () => loadStampImage(r.result); r.readAsDataURL(f); }
  });
  document.addEventListener("paste", (e) => {
    if (els.stampModal.style.display === "none") return;
    const it = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type.startsWith("image/"));
    if (it) { const f = it.getAsFile(); const r = new FileReader(); r.onload = () => loadStampImage(r.result); r.readAsDataURL(f); }
  });
  els.stampModal.addEventListener("mousedown", (e) => { if (e.target === els.stampModal) closeStampModal(true); });

  // ---------- 저장(내보내기) ----------
  async function ensureFont() {
    if (malgunBytes) return malgunBytes;
    busy(true, "한글 폰트 준비 중…");
    malgunBytes = new Uint8Array(await (await fetch("lib/malgun.ttf")).arrayBuffer());
    return malgunBytes;
  }
  function dataUrlToBytes(dataUrl) {
    const b64 = dataUrl.split(",")[1]; const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function save() {
    // 저장 위치·이름 대화상자를 먼저 연다(사용자 클릭 활성화가 살아있을 때).
    let handle = null;
    if (typeof window.showSaveFilePicker === "function") {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: "편집본.pdf",
          types: [{ description: "PDF 문서", accept: { "application/pdf": [".pdf"] } }],
        });
      } catch (e) { if (e && e.name === "AbortError") return; handle = null; } // 취소 시 중단
    }
    busy(true, "PDF 만드는 중…");
    try {
      const out = await PDFDocument.create();
      out.registerFontkit(fontkit);
      // 글씨체별 폰트를 필요할 때 한 번씩만 임베딩(subset)
      const fontCache = new Map();
      async function getFont(key) {
        const k = FONT_FILE[key] ? key : "malgun";
        if (fontCache.has(k)) return fontCache.get(k);
        busy(true, "글꼴 준비 중…");
        const bytes = k === "malgun" ? await ensureFont() : new Uint8Array(await (await fetch(FONT_FILE[k])).arrayBuffer());
        const f = await out.embedFont(bytes, { subset: true });
        fontCache.set(k, f); return f;
      }

      // 원본 문서를 pdf-lib로 한 번씩만 로드
      const libDocs = new Map();
      for (const [id, s] of sources) libDocs.set(id, await PDFDocument.load(s.bytes.slice()));

      // 이미지 캐시
      const imgCache = new Map();

      for (const p of pages) {
        const srcLib = libDocs.get(p.srcId);
        const [copied] = await out.copyPages(srcLib, [p.srcIndex]);
        const page = out.addPage(copied);
        if (p.rotate) page.setRotation(degrees((page.getRotation().angle + p.rotate) % 360));
        const pageRotDeg = page.getRotation().angle; // 최종 표시 회전(내재 + 사용자 회전)

        for (const a of p.anns) {
          if (a.type === "rect") {
            page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: rgb(1, 1, 1) });
          } else if (a.type === "text") {
            const c = hexToRgb(a.color), f = await getFont(a.font);
            if (a.box && a.lines) { // 영역(박스) 글자: 줄별로 그림
              for (let i = 0; i < a.lines.length; i++) {
                if (!a.lines[i]) continue;
                page.drawText(a.lines[i], { x: a.x + a.size * TXT_PADX, y: txtBaselineY(a, i), size: a.size, font: f, color: rgb(c.r, c.g, c.b) });
              }
            } else {
              const opts = { x: a.x, y: a.y, size: a.size, font: f, color: rgb(c.r, c.g, c.b) };
              if (typeof a.opacity === "number") opts.opacity = a.opacity; // OCR층=0(투명, 검색·복사용)
              page.drawText(a.text, opts);
            }
          } else if (a.type === "image") {
            let img = imgCache.get(a.dataUrl);
            if (!img) { const bytes = dataUrlToBytes(a.dataUrl); img = a.fmt === "png" ? await out.embedPng(bytes) : await out.embedJpg(bytes); imgCache.set(a.dataUrl, img); }
            // 화면에 보이는 그대로(중심·수직) 저장. 페이지 표시회전을 상쇄(+pageRot)하고 도장 자체 회전(-a.rot)을 합침.
            const D = (pageRotDeg - (a.rot || 0)) % 360;
            if (D) {
              const th = D * Math.PI / 180, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
              const x = cx - (a.w / 2) * Math.cos(th) + (a.h / 2) * Math.sin(th);
              const y = cy - (a.w / 2) * Math.sin(th) - (a.h / 2) * Math.cos(th);
              page.drawImage(img, { x, y, width: a.w, height: a.h, rotate: degrees(D) });
            } else {
              page.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h });
            }
          } else if (a.type === "path" && a.pts && a.pts.length) {
            // 획 하나를 SVG 경로로 '한 번'에 그림(형광펜 겹침이 진해지지 않음).
            // drawSvgPath는 translate(x,y)→scale(1,-1)이므로 점 (px,py)는 y를 뒤집어 넣는다.
            const c = hexToRgb(a.color);
            let d = a.pts.map((pt, i) => `${i ? "L" : "M"} ${pt[0]} ${-pt[1]}`).join(" ");
            if (a.pts.length === 1) d += ` L ${a.pts[0][0] + 0.01} ${-a.pts[0][1]}`; // 점 하나
            page.drawSvgPath(d, {
              x: 0, y: 0,
              borderColor: rgb(c.r, c.g, c.b),
              borderWidth: a.width,
              borderLineCap: LineCapStyle.Round,
              borderOpacity: a.mode === "highlight" ? 0.4 : 1,
            });
          }
        }
      }

      const bytes = await out.save();
      if (handle) {
        // 사용자가 고른 위치·이름에 직접 기록
        const w = await handle.createWritable();
        await w.write(bytes); await w.close();
        hint("저장 완료: " + (handle.name || "PDF"));
      } else {
        // 폴백(대화상자 미지원 브라우저): 이름만 입력받아 기본 폴더로 내려받기
        let name = prompt("저장할 파일 이름", "편집본.pdf");
        if (name === null) { busy(false); return; }
        if (!/\.pdf$/i.test(name)) name += ".pdf";
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        hint("내려받기: " + name);
      }
    } catch (e) { console.error(e); alert("저장 중 오류: " + e.message); }
    finally { busy(false); }
  }

  // ---------- OCR (글자 인식) ----------
  let ocrWorker = null;
  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    busy(true, "OCR 엔진 준비 중… (처음 한 번만, 조금 걸립니다)");
    // 워커 내부 importScripts는 상대경로를 해석하지 못하므로 절대경로(URL)로 넘긴다
    const BASE = new URL("lib/tesseract/", location.href).href;
    ocrWorker = await Tesseract.createWorker(["kor", "eng"], 1, {
      workerPath: BASE + "worker.min.js",
      corePath: BASE + "tesseract-core.wasm.js",
      langPath: BASE + "lang",
      gzip: true,
      logger: (m) => { if (m.status === "recognizing text") busy(true, `OCR 인식 중… ${Math.round(m.progress * 100)}%`); },
    });
    return ocrWorker;
  }

  function extractWords(data) {
    if (data.words && data.words.length) return data.words;
    const out = [];
    for (const b of (data.blocks || []))
      for (const par of (b.paragraphs || []))
        for (const ln of (par.lines || []))
          for (const w of (ln.words || [])) out.push(w);
    return out;
  }

  async function ocrPage(pageIdx, worker) {
    const p = pages[pageIdx];
    const src = sources.get(p.srcId);
    const page = await src.jsdoc.getPage(p.srcIndex + 1);
    const OCR_SCALE = 2;
    const vp = page.getViewport({ scale: OCR_SCALE, rotation: (page.rotate + p.rotate) % 360 });
    const cvs = document.createElement("canvas");
    cvs.width = Math.ceil(vp.width); cvs.height = Math.ceil(vp.height);
    await page.render({ canvasContext: cvs.getContext("2d"), viewport: vp }).promise;
    const { data } = await worker.recognize(cvs, {}, { blocks: true, text: true });
    const words = extractWords(data);
    p.anns = p.anns.filter(a => !a.ocr); // 재실행 시 이전 OCR층 제거
    let n = 0;
    for (const w of words) {
      const t = (w.text || "").trim();
      if (!t || (w.confidence !== undefined && w.confidence < 30)) continue;
      const b = w.bbox; if (!b) continue;
      const c1 = vp.convertToPdfPoint(b.x0, b.y1);
      const c2 = vp.convertToPdfPoint(b.x1, b.y0);
      const x = Math.min(c1[0], c2[0]), y = Math.min(c1[1], c2[1]);
      const wPt = Math.abs(c2[0] - c1[0]), hPt = Math.abs(c2[1] - c1[1]);
      if (wPt < 1 || hPt < 1) continue;
      p.anns.push({ type: "text", x, y, text: t, size: Math.max(4, hPt * 0.9), color: "#000000", opacity: 0, ocr: true, w: wPt, h: hPt });
      n++;
    }
    return { n, text: data.text || "" };
  }

  async function runOcr() {
    if (selected < 0) return;
    const all = confirm("모든 쪽을 인식할까요?\n\n[확인] = 전체 쪽\n[취소] = 현재 쪽만");
    const targets = all ? pages.map((_, i) => i) : [selected];
    pushUndo();
    try {
      const worker = await getOcrWorker();
      let total = 0;
      for (let k = 0; k < targets.length; k++) {
        busy(true, `OCR 인식 중… (${k + 1}/${targets.length} 쪽)`);
        total += (await ocrPage(targets[k], worker)).n;
      }
      renderThumbs();
      renderSelected();
      hint(`OCR 완료: ${total}개 단어 인식 — 저장하면 검색·복사 가능한 PDF가 됩니다`);
    } catch (e) { console.error(e); alert("OCR 중 오류: " + (e.message || e)); }
    finally { busy(false); }
  }

  // ---------- 이벤트 배선 ----------
  els.btnOpen.addEventListener("click", () => els.fileOpen.click());
  // 이미 PDF가 열려 있으면 뒤에 합치고, 없으면 새로 연다
  els.fileOpen.addEventListener("change", () => { loadFiles(els.fileOpen.files, { append: pages.length > 0 }); els.fileOpen.value = ""; });
  els.btnSave.addEventListener("click", save);
  els.btnOcr.addEventListener("click", runOcr);
  els.btnUndo.addEventListener("click", revertToOriginal); // 툴바 버튼 = 편집 전 원본으로
  if (els.btnStepUndo) els.btnStepUndo.addEventListener("click", undo);
  if (els.btnStepRedo) els.btnStepRedo.addEventListener("click", redo);
  els.btnConfirmOrder.addEventListener("click", () => {
    if (orderConfirmed) {
      // 다시 편집: 잠금만 풀고 순서 편집 가능 상태로. 실제로 순서를 바꾸는 순간 초기화된다.
      orderConfirmed = false;
      pendingReset = true;
      hint("파일 순서를 바꾸면 순서·삭제·회전이 처음으로 초기화됩니다 (Ctrl+Z로 되돌리기)");
    } else {
      orderConfirmed = true;  // 이 순서로 확정 → 편집 잠금 해제
      pendingReset = false;   // 순서 안 바꾸고 확정하면 편집 그대로 유지
    }
    renderFiles(); renderThumbs(); renderSelected(); updateButtons();
  });
  els.toolGroup.addEventListener("click", (e) => { const b = e.target.closest(".tool"); if (b) setTool(b.dataset.tool); });

  // 브러쉬: 모드 토글(펜/형광펜) + 굵기·색(모드별로 기억) + 자주 쓰는 색 팔레트
  function markActiveSwatch() {
    const cur = (brushSettings[brushMode].color || "").toLowerCase();
    [...els.brushSwatches.querySelectorAll(".sw")].forEach(b => b.classList.toggle("active", b.dataset.c.toLowerCase() === cur));
  }
  function syncBrushInputs() {
    const s = brushSettings[brushMode];
    els.brushWidth.max = BRUSH_MAX[brushMode];              // 모드별 최대 굵기
    if (s.width > BRUSH_MAX[brushMode]) s.width = BRUSH_MAX[brushMode]; // 상한 초과분 보정
    els.brushWidth.value = s.width;
    els.brushWidthVal.textContent = s.width;
    els.brushColor.value = s.color;
    [...els.brushMode.querySelectorAll(".segbtn")].forEach(b => b.classList.toggle("active", b.dataset.mode === brushMode));
    markActiveSwatch();
    drawBrushGhost(); // 바뀐 굵기·색을 미리보기에 즉시 반영
  }
  els.brushMode.addEventListener("click", (e) => {
    const b = e.target.closest(".segbtn"); if (!b) return;
    brushMode = b.dataset.mode; syncBrushInputs();
  });
  els.brushWidth.addEventListener("input", () => {
    const v = Math.max(1, Math.min(BRUSH_MAX[brushMode], parseInt(els.brushWidth.value, 10) || 1));
    brushSettings[brushMode].width = v;
    els.brushWidthVal.textContent = v;
    drawBrushGhost();
  });
  els.brushColor.addEventListener("input", () => { brushSettings[brushMode].color = els.brushColor.value; markActiveSwatch(); drawBrushGhost(); });
  els.brushSwatches.addEventListener("click", (e) => {
    const b = e.target.closest(".sw"); if (!b) return;
    brushSettings[brushMode].color = b.dataset.c;
    els.brushColor.value = b.dataset.c;
    markActiveSwatch();
    drawBrushGhost();
  });
  syncBrushInputs();

  // ---------- 지우개 옵션 ----------
  function syncEraserInputs() {
    [...els.eraserShapeSeg.querySelectorAll(".segbtn")].forEach(b => b.classList.toggle("active", b.dataset.shape === eraserShape));
    [...els.eraserTargetSeg.querySelectorAll(".segbtn")].forEach(b => b.classList.toggle("active", b.dataset.target === eraserTarget));
    els.eraserSizeWrap.style.display = eraserShape === "brush" ? "inline-flex" : "none";
    els.eraserSizeVal.textContent = eraserSize;
    if (tool === "eraser") { hint(eraserHint()); if (curViewport) { drawOverlay(); drawEraserGhost(); } }
  }
  els.eraserShapeSeg.addEventListener("click", (e) => {
    const b = e.target.closest(".segbtn"); if (!b) return;
    eraserShape = b.dataset.shape; dragStart = null; syncEraserInputs();
  });
  els.eraserTargetSeg.addEventListener("click", (e) => {
    const b = e.target.closest(".segbtn"); if (!b) return;
    eraserTarget = b.dataset.target; syncEraserInputs();
  });
  els.eraserSize.addEventListener("input", () => {
    eraserSize = Math.max(4, Math.min(80, parseInt(els.eraserSize.value, 10) || 4));
    els.eraserSizeVal.textContent = eraserSize;
    if (tool === "eraser" && curViewport) { drawOverlay(); drawEraserGhost(); }
  });
  syncEraserInputs();

  // 모자이크: 모드(모자이크/블러) 토글 + 강도 슬라이더
  function syncMosaicInputs() {
    els.mosaicStrength.value = mosaicStrength;
    els.mosaicStrengthVal.textContent = mosaicStrength;
    [...els.mosaicModeSeg.querySelectorAll(".segbtn")].forEach(b => b.classList.toggle("active", b.dataset.mmode === mosaicMode));
  }
  els.mosaicModeSeg.addEventListener("click", (e) => {
    const b = e.target.closest(".segbtn"); if (!b) return;
    mosaicMode = b.dataset.mmode; syncMosaicInputs();
    if (tool === "mosaic" && lastMosaic) { lastMosaic.mmode = mosaicMode; reprocessMosaic(lastMosaic); } // 방금 것 즉시 반영
  });
  els.mosaicStrength.addEventListener("input", () => {
    mosaicStrength = Math.max(1, Math.min(100, parseInt(els.mosaicStrength.value, 10) || 1));
    els.mosaicStrengthVal.textContent = mosaicStrength;
    if (tool === "mosaic" && lastMosaic) { lastMosaic.mstrength = mosaicStrength; reprocessMosaic(lastMosaic); }
  });
  syncMosaicInputs();

  els.zoomRange.addEventListener("input", () => setZoom(parseInt(els.zoomRange.value, 10) / 100));
  els.zoomIn.addEventListener("click", () => setZoom(editScale + 0.1));   // +10%
  els.zoomOut.addEventListener("click", () => setZoom(editScale - 0.1));  // -10%
  els.zoomReset.addEventListener("click", () => setZoom(1));              // 원위치 100%

  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "z" && e.shiftKey) { e.preventDefault(); redo(); }        // Ctrl+Shift+Z = 앞으로
    else if (k === "z") { e.preventDefault(); undo(); }                 // Ctrl+Z = 되돌리기
    else if (k === "y") { e.preventDefault(); redo(); }                 // Ctrl+Y = 앞으로
  });

  // 드래그 앤 드롭으로 열기
  ["dragover", "drop"].forEach(ev => els.stage.addEventListener(ev, (e) => e.preventDefault()));
  els.stage.addEventListener("dragover", () => els.stage.classList.add("dragover"));
  els.stage.addEventListener("dragleave", () => els.stage.classList.remove("dragover"));
  els.stage.addEventListener("drop", (e) => { els.stage.classList.remove("dragover"); if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files, { append: pages.length > 0 }); });

  // ---------- 사이드바 폭 조절 ----------
  (function setupResizer() {
    const sidebar = $("thumbs"), resizer = $("resizer");
    const MIN = 150, MAX = 520;
    const saved = parseInt(localStorage.getItem("pdfeditor.sidebarWidth"), 10);
    if (saved >= MIN && saved <= MAX) sidebar.style.width = saved + "px";
    applyThumbCols();
    applyThumbMaxH();
    window.addEventListener("resize", () => { applyThumbCols(); applyThumbMaxH(); positionHistbar(); });
    let startX = 0, startW = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      const w = Math.max(MIN, Math.min(MAX, startW + (e.clientX - startX)));
      sidebar.style.width = w + "px";
      applyThumbCols();
      applyThumbMaxH();
      positionHistbar();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove("active");
      document.body.classList.remove("col-resizing");
      localStorage.setItem("pdfeditor.sidebarWidth", parseInt(sidebar.getBoundingClientRect().width, 10));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (selected >= 0) renderSelected();
    };
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true; startX = e.clientX; startW = sidebar.getBoundingClientRect().width;
      resizer.classList.add("active");
      document.body.classList.add("col-resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  })();

  injectIcons();
  setTool("select");
  updateButtons();
})();
