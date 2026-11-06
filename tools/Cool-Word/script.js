(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const editor = $("#editor");
  const state = { mode: "auto", groupSize: 1, exact: true, history: [], historyIndex: -1, lastSaved: "" };
  const STOP_WORDS = new Set(("a an the and or but if then else when at by for from in into of on onto to up upon with as is am are was were be been being have has had do does did can could should would will may might must this that these those it its i me my mine we our ours you your yours he him his she her hers they them their theirs what which who whom whose where why how not no yes so than too very just also there here").split(" "));

  function getText() { return editor.innerText.replace(/\r/g, ""); }
  function getTokens(text = getText()) {
    return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
  }
  function formatDuration(words, wpm) {
    if (!words) return "0 sec";
    const totalSeconds = Math.ceil(words / wpm * 60);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds} sec`;
    if (seconds === 0) return `${minutes} min`;
    return `${minutes} min ${seconds} sec`;
  }
  function density(count, total) { return total ? (count / total * 100).toFixed(2) + "%" : "0.00%"; }

  function updateStats() {
    const text = getText();
    const tokens = getTokens(text);
    const words = tokens.length;
    const chars = text.length;
    const spaces = (text.match(/\s/g) || []).length;
    const sentences = (text.match(/[.!?]+(?=\s|$)/g) || []).length;
    const paragraphs = text.split(/\n+/).filter(line => line.trim().length).length;
    $("#wordCount").textContent = words.toLocaleString();
    $("#charCount").textContent = chars.toLocaleString();
    $("#noSpaceCount").textContent = (chars - spaces).toLocaleString();
    $("#spaceCount").textContent = spaces.toLocaleString();
    $("#sentenceCount").textContent = sentences.toLocaleString();
    $("#paragraphCount").textContent = paragraphs.toLocaleString();
    $("#readingTime").textContent = formatDuration(words, 200);
    $("#narrationTime").textContent = formatDuration(words, 130);
    $("#conversationalTime").textContent = formatDuration(words, 140);
    $("#speakingRange").textContent = `${formatDuration(words, 150)} – ${formatDuration(words, 130)}`;
    $("#editorStatus").textContent = words ? `${words.toLocaleString()} words · ${chars.toLocaleString()} characters` : "Ready when you are";
    renderAnalysis(tokens);
  }

  function renderRows(items, total) {
    const list = $("#wordList");
    if (!items.length) {
      list.innerHTML = `<div class="empty-analysis">${state.mode === "manual" ? "Enter a word or phrase above to analyse it." : "Your most-used words will appear here."}</div>`;
      return;
    }
    list.innerHTML = items.map(([word, count]) => `
      <div class="word-row">
        <span class="word-name" title="${escapeHtml(word)}">${escapeHtml(word)}</span>
        <span class="word-count">${count.toLocaleString()}</span>
        <span class="word-density">${density(count, total)}</span>
      </div>`).join("");
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function renderAnalysis(tokens) {
    if (state.mode === "manual") {
      const query = $("#keywordInput").value.trim().toLocaleLowerCase();
      const parts = getTokens(query);
      let count = 0;
      if (query && parts.length) {
        if (state.exact) {
          if (parts.length === 1) count = tokens.filter(token => token === parts[0]).length;
          else {
            for (let i = 0; i <= tokens.length - parts.length; i++) {
              if (parts.every((part, offset) => tokens[i + offset] === part)) count++;
            }
          }
        } else {
          const source = getText().toLocaleLowerCase();
          const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const matches = source.match(new RegExp(escaped, "gu"));
          count = matches ? matches.length : 0;
        }
      }
      $("#manualInstances").textContent = count.toLocaleString();
      $("#manualDensity").textContent = density(count, tokens.length);
      renderRows(query && parts.length ? [[query, count]] : [], tokens.length);
      return;
    }
    const counts = new Map();
    const size = state.groupSize;
    for (let i = 0; i <= tokens.length - size; i++) {
      const group = tokens.slice(i, i + size);
      if (group.some(word => STOP_WORDS.has(word))) continue;
      const key = group.join(" ");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10);
    renderRows(sorted, tokens.length);
  }

  function saveHistory() {
    const html = editor.innerHTML;
    if (state.history[state.historyIndex] === html) return;
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(html);
    if (state.history.length > 80) state.history.shift();
    state.historyIndex = state.history.length - 1;
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $("#undoBtn").disabled = state.historyIndex <= 0;
    $("#redoBtn").disabled = state.historyIndex >= state.history.length - 1;
    $("#undoBtn").style.opacity = $("#undoBtn").disabled ? ".4" : "1";
    $("#redoBtn").style.opacity = $("#redoBtn").disabled ? ".4" : "1";
  }
  function restoreHistory(index) {
    if (index < 0 || index >= state.history.length) return;
    state.historyIndex = index;
    editor.innerHTML = state.history[index];
    updateStats();
    updateHistoryButtons();
  }
  let historyTimer;
  editor.addEventListener("input", () => {
    updateStats();
    clearTimeout(historyTimer);
    historyTimer = setTimeout(saveHistory, 350);
  });
  editor.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      document.execCommand("insertParagraph");
      updateStats();
      saveHistory();
    }
  });
  document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("click", () => {
      editor.focus();
      const command = button.dataset.command;
      document.execCommand(command, false, button.dataset.value || null);
      updateStats();
      saveHistory();
    });
  });

  $("#autoMode").addEventListener("click", () => setMode("auto"));
  $("#manualMode").addEventListener("click", () => setMode("manual"));
  function setMode(mode) {
    state.mode = mode;
    $("#autoMode").classList.toggle("active", mode === "auto");
    $("#manualMode").classList.toggle("active", mode === "manual");
    $("#manualControls").hidden = mode !== "manual";
    $("#groupDescription").textContent = mode === "manual" ? "Your selected word or phrase" : state.groupSize === 1 ? "Most used individual words" : "Most used two-word phrases";
    renderAnalysis(getTokens());
  }
  $("#keywordInput").addEventListener("input", () => renderAnalysis(getTokens()));
  $("#matchToggle").addEventListener("click", () => {
    state.exact = !state.exact;
    $("#matchToggle").classList.toggle("partial", !state.exact);
    $("#matchToggle").setAttribute("aria-pressed", String(state.exact));
    $("#matchLabel").textContent = state.exact ? "Exact" : "Partial";
    $("#matchHelp").textContent = state.exact
      ? "Exact: counts full words or the complete phrase only. Click the switch to include partial matches."
      : "Partial: includes the typed text wherever it appears inside other words. Click the switch for full-word matches only.";
    $("#matchToggle").title = state.exact ? "Click here to include partial matches" : "Click here to use only full words, not partial";
    renderAnalysis(getTokens());
  });
  document.querySelectorAll(".group-button").forEach(button => button.addEventListener("click", () => {
    state.groupSize = Number(button.dataset.size);
    document.querySelectorAll(".group-button").forEach(item => item.classList.toggle("active", item === button));
    $("#groupDescription").textContent = state.groupSize === 1 ? "Most used individual words" : "Most used two-word phrases";
    renderAnalysis(getTokens());
  }));

  $("#clearBtn").addEventListener("click", () => {
    if (!getText().trim()) return;
    if (!confirm("Clear all text in the editor?")) return;
    editor.innerHTML = "";
    updateStats(); saveHistory(); editor.focus();
  });
  $("#copyBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      showToast("Text copied to clipboard");
    } catch {
      const range = document.createRange(); range.selectNodeContents(editor);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      showToast("Select and copy the highlighted text");
    }
  });

  const modal = $("#saveModal");
  $("#saveBtn").addEventListener("click", () => { modal.hidden = false; $("#downloadStatus").textContent = ""; });
  $("#closeSave").addEventListener("click", () => modal.hidden = true);
  modal.addEventListener("click", event => { if (event.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { modal.hidden = true; closeSidebar(); } });
  document.querySelectorAll(".download-option").forEach(button => button.addEventListener("click", () => downloadFile(button.dataset.format)));

  function getMarkdown() {
    const clone = editor.cloneNode(true);
    function convert(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const tag = node.tagName.toLowerCase();
      const inner = [...node.childNodes].map(convert).join("");
      if (tag === "br") return "\n";
      if (tag === "b" || tag === "strong") return `**${inner}**`;
      if (tag === "i" || tag === "em") return `*${inner}*`;
      if (tag === "u") return `<u>${inner}</u>`;
      if (tag === "h2") return `## ${inner}\n\n`;
      if (tag === "h3") return `### ${inner}\n\n`;
      if (tag === "li") return `- ${inner}\n`;
      if (tag === "ul" || tag === "ol") return `${inner}\n`;
      if (tag === "blockquote") return `> ${inner}\n\n`;
      if (["p","div"].includes(tag)) return `${inner}\n\n`;
      return inner;
    }
    return [...clone.childNodes].map(convert).join("").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }
  async function downloadFile(format) {
    const text = getText();
    if (!text.trim()) { $("#downloadStatus").textContent = "Add some text before saving."; return; }
    const baseName = "my-writing";
    if (format === "txt") {
      downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${baseName}.txt`);
    } else if (format === "md") {
      downloadBlob(new Blob([getMarkdown()], { type: "text/markdown;charset=utf-8" }), `${baseName}.md`);
    } else if (format === "docx") {
      if (!window.JSZip) {
        $("#downloadStatus").textContent = "DOCX export needs an internet connection to load its free file library.";
        return;
      }
      try {
        const zip = new JSZip();
        const safe = text => escapeXml(text);
        const paragraphs = [...editor.childNodes].map(node => {
          const tag = node.nodeType === Node.ELEMENT_NODE ? node.tagName.toLowerCase() : "p";
          const content = node.textContent || "";
          const style = tag === "h2" ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : "";
          return `<w:p>${style}<w:r><w:t xml:space="preserve">${safe(content)}</w:t></w:r></w:p>`;
        }).join("");
        zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
        zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
        zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
        zip.folder("word").file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`);
        zip.folder("word").folder("_rels").file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
        const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        downloadBlob(blob, `${baseName}.docx`);
      } catch (error) {
        $("#downloadStatus").textContent = "Could not create the Word document. Please try again.";
        return;
      }
    }
    $("#downloadStatus").textContent = "Your download is ready.";
    showToast(`${format.toUpperCase()} file downloaded`);
  }
  function escapeXml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  let toastTimer;
  function showToast(message) {
    const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
  }

  const sidebar = $("#sidebar"), scrim = $("#sidebarScrim");
  function openSidebar() { sidebar.classList.add("open"); scrim.classList.add("visible"); document.body.classList.add("sidebar-open"); $("#menuToggle").style.visibility = "hidden"; }
  function closeSidebar() { sidebar.classList.remove("open"); scrim.classList.remove("visible"); document.body.classList.remove("sidebar-open"); $("#menuToggle").style.visibility = "visible"; }
  $("#menuToggle").addEventListener("click", openSidebar);
  $("#closeSidebar").addEventListener("click", closeSidebar);
  scrim.addEventListener("click", closeSidebar);

  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("light-theme");
    const light = document.body.classList.contains("light-theme");
    $("#themeToggle").setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
    document.querySelector('meta[name="theme-color"]').content = light ? "#eef3fa" : "#0b1426";
  });

  $("#undoBtn").addEventListener("click", () => restoreHistory(state.historyIndex - 1));
  $("#redoBtn").addEventListener("click", () => restoreHistory(state.historyIndex + 1));
  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); modal.hidden = false;
    }
  });

  saveHistory();
  updateStats();
})();
