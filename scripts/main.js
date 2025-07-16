(() => {
  "use strict";

  const DATA_URL = "data/problems.json";
  const STORAGE_KEY = "leetcoach_solved";
  const BEET_ICON = "favicon/android-chrome-192x192.png";

  // helpers
  const $ = (id) => document.getElementById(id);
  const encode = (s) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const persistSolved = (set) =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  const loadSolved = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  };

  // early full reset check
  if (location.search.includes("resetProgress")) {
    localStorage.removeItem(STORAGE_KEY);
  }

  // DOM refs
  const refs = {
    prevBtn: $("prev-btn"),
    nextBtn: $("next-btn"),
    resetBtn: $("reset-btn"),
    infoBtn: $("info-btn"),
    progressLbl: $("set-progress"),
    title: $("problem-title"),
    diff: $("problem-difficulty"),
    desc: $("problem-description"),
    examples: $("problem-examples"),
    constraints: $("problem-constraints"),
    code: $("code-display"),
    choiceHeader: $("choice-header"),
    choiceOptions: $("choice-options"),
    choiceCard: $("choice-card"),
    infoModal: $("infoModal"),
    resetModal: $("resetModal"),
    resetConfirmBtn: $("reset-confirm-btn"),
    errorModal: $("errorModal"),
    errorModalBody: $("errorModalBody"),
  };

  // state
  let problems = [];
  let currentIdx = -1;
  let activeLine = 0;
  let blinkCSSInjected = false;
  const solvedSet = loadSolved();

  // init
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const { problems: data } = await (await fetch(DATA_URL)).json();
      problems = data;
      sanitizeSolved();
      wireGlobalButtons();
      loadProblem(0);
    } catch (err) {
      console.error(err);
      showError(
        "Failed to load problems. Please check your connection or try again later."
      );
    }
  });

  function sanitizeSolved() {
    const validIds = new Set(problems.map((p) => p.id));
    let changed = false;
    for (const id of solvedSet) {
      if (!validIds.has(id)) {
        solvedSet.delete(id);
        changed = true;
      }
    }
    if (changed) persistSolved(solvedSet);
  }

  // buttons
  function wireGlobalButtons() {
    refs.prevBtn.onclick = () => loadProblem(currentIdx - 1);
    refs.nextBtn.onclick = () => loadProblem(currentIdx + 1);
    refs.resetBtn.onclick = () =>
      bootstrap.Modal.getOrCreateInstance(refs.resetModal).show();
    refs.resetConfirmBtn.onclick = () => {
      doResetCurrentProblem();
      bootstrap.Modal.getInstance(refs.resetModal).hide();
    };
    refs.infoBtn?.addEventListener("click", () =>
      bootstrap.Modal.getOrCreateInstance(refs.infoModal).show()
    );
  }

  function doResetCurrentProblem() {
    solvedSet.delete(problems[currentIdx].id);
    persistSolved(solvedSet);
    loadProblem(currentIdx, true);
  }

  function showError(msg) {
    if (!refs.errorModal) return alert(msg);
    refs.errorModalBody.textContent = msg;
    bootstrap.Modal.getOrCreateInstance(refs.errorModal).show();
  }

  // problem loader
  function loadProblem(idx, force = false) {
    if (idx < 0 || idx >= problems.length || (idx === currentIdx && !force))
      return;

    currentIdx = idx;
    const p = problems[idx];
    const isSolved = solvedSet.has(p.id);
    activeLine = isSolved ? p.steps.length : 0;

    removeCongrats();

    refs.title.textContent = `${p.leetcodeId}. ${p.title}`;
    refs.diff.textContent = p.difficulty;
    refs.diff.className =
      "badge " +
      (p.difficulty === "Easy"
        ? "bg-success"
        : p.difficulty === "Medium"
        ? "bg-warning text-dark"
        : "bg-danger");

    refs.desc.innerText = p.description;
    refs.examples.innerText = p.example;
    refs.constraints.innerText = p.constraints;

    renderCode(p);
    isSolved ? showCongrats() : renderChoices(p);

    refs.prevBtn.disabled = idx === 0;
    refs.nextBtn.disabled = idx === problems.length - 1;
    updateProgressLabel();
  }

  // code renderer
  function renderCode(p) {
    if (!blinkCSSInjected) {
      const style = document.createElement("style");
      style.textContent =
        "@keyframes blink{50%{opacity:0}}.cursor{display:inline-block;width:8px;background:#aaa;margin-right:2px;animation:blink 1s steps(1) infinite}";
      document.head.appendChild(style);
      blinkCSSInjected = true;
    }

    const header = p.boilerplate.slice(0, 2);
    const body = p.steps.map((step, idx) =>
      idx < activeLine
        ? "        " + step.options[step.answerIndex]
        : "        " +
          (idx === activeLine ? '<span class="cursor"></span>' : "") +
          step.placeholder +
          " " +
          (step.comment || "")
    );
    const footer = p.boilerplate.slice(2 + p.steps.length);

    refs.code.innerHTML = encode(
      [...header, ...body, ...footer].join("\n")
    ).replace(
      encode('<span class="cursor"></span>'),
      '<span class="cursor"></span>'
    );
  }

  // choice UI
  function renderChoices(p) {
    const step = p.steps[activeLine];
    refs.choiceHeader.textContent = `Select code for ${step.placeholder}`;
    refs.choiceOptions.innerHTML = "";

    const frag = document.createDocumentFragment();
    const order = shuffle(step.options.map((_, i) => i));

    order.forEach((realIdx) => {
      const col = document.createElement("div");
      col.className = "col-12 col-md-6 mb-2";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-outline-secondary w-100 choice-btn";
      btn.textContent = step.options[realIdx];
      btn.onclick = () => handleChoice(realIdx, btn, p);

      col.appendChild(btn);
      frag.appendChild(col);
    });

    refs.choiceOptions.appendChild(frag);
  }

  function handleChoice(realIdx, btn, p) {
    const step = p.steps[activeLine];
    const correct = realIdx === step.answerIndex;

    btn.classList.toggle("btn-success", correct);
    btn.classList.toggle("btn-danger", !correct);

    if (!correct) {
      setTimeout(() => btn.classList.remove("btn-danger"), 600);
      return;
    }

    setTimeout(() => {
      activeLine++;
      activeLine === p.steps.length
        ? finishProblem(p)
        : (renderCode(p), renderChoices(p));
    }, 350);
  }

  function finishProblem(p) {
    solvedSet.add(p.id);
    persistSolved(solvedSet);
    showCongrats();
    renderCode(p);
    updateProgressLabel();

    // Optional: auto-advance
    // if (currentIdx < problems.length - 1) {
    //   setTimeout(() => loadProblem(currentIdx + 1), 1200);
    // }
  }

  // UI states
  function showCongrats() {
    refs.choiceHeader.classList.add("d-none");
    refs.choiceOptions.classList.add("d-none");

    if (document.getElementById("congrats-message")) return;

    const wrap = document.createElement("div");
    wrap.id = "congrats-message";
    wrap.className = "text-center py-4";
    wrap.innerHTML = `
      <img src="${BEET_ICON}" alt="Beet icon" width="60" class="mb-2" />
      <h3 class="fw-bold m-0">You Beet It!</h3>
    `;
    refs.choiceCard.appendChild(wrap);
    refs.choiceCard.classList.remove("d-none");
  }

  function removeCongrats() {
    document.getElementById("congrats-message")?.remove();
    refs.choiceHeader.classList.remove("d-none");
    refs.choiceOptions.classList.remove("d-none");
  }

  function updateProgressLabel() {
    refs.progressLbl.textContent = `${solvedSet.size} / ${problems.length} Beets `;
    refs.title.style.opacity = solvedSet.has(problems[currentIdx].id) ? 0.4 : 1;
  }
})();
