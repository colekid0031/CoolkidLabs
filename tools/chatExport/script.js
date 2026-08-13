// ============================================================
//  ChatExport — script.js (Frontend)
//  This runs in the USER'S BROWSER.
//  It talks to Our SERVER (server.js) to fetch chat links.
//
//  Our key new feature: fetchFromURL()
//  User pastes a share link → we send it to our server →
//  server fetches + extracts → we get back clean chat text.

const SERVER_URL = 'https://coolkidlabs-production.up.railway.app';
// ── State ─────────────────────────────────────────────────────
let selectedFormat = 'txt';

// ── Format Selection ──────────────────────────────────────────
function selectFormat(format) {
  document.querySelectorAll('.format-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('btn-' + format).classList.add('active');
  selectedFormat = format;
  updatePreview();
}

// ── Live Stats ────────────────────────────────────────────────
function updateStats() {
  const text  = document.getElementById('chatInput').value;
  const chars = text.length;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const lines = text === '' ? 0 : text.split('\n').length;

  document.getElementById('charCount').textContent = chars.toLocaleString();
  document.getElementById('wordCount').textContent = words.toLocaleString();
  document.getElementById('lineCount').textContent = lines.toLocaleString();

  document.getElementById('downloadBtn').disabled = text.trim().length === 0;
  updatePreview();
}

// ── URL Fetcher ───────────────────────────────────────────────
//This is Called when the user clicks "Import from Link".
// It sends the URL to The server and fills the text area with the result.
async function fetchFromURL() {
  const urlInput    = document.getElementById('shareURL');
  const fetchBtn    = document.getElementById('fetchBtn');
  const fetchStatus = document.getElementById('fetchStatus');
  const url         = urlInput.value.trim();

  // 1. Make sure they typed something
  if (!url) {
    showFetchStatus('Please paste a share link first.', 'error');
    return;
  }

  // 2. Basic client-side URL check before even hitting the server
  if (!url.startsWith('https://')) {
    showFetchStatus('The link must start with https://', 'error');
    return;
  }

  // 3. Show loading state — disable button so they can't double-click
  fetchBtn.disabled    = true;
  fetchBtn.textContent = '⏳ Fetching...';
  showFetchStatus('Connecting to server and loading the chat page…', 'loading');

  try {
    // 4. Send a POST request to our Node.js server
    //    fetch() is the browser's built-in way to make HTTP requests.
    //    We're calling OUR server, not the AI site directly — that's the key.
    const response = await fetch(`${SERVER_URL}/fetch-chat`, {
      method: 'POST',                            // POST = sending data to server
      headers: {
        'Content-Type': 'application/json'       // Tell server we're sending JSON
      },
      body: JSON.stringify({ url: url })         // Convert JS object → JSON string
    });

    // 5. Parse the server's JSON response back into a JavaScript object
    const data = await response.json();

    // 6. Check if the server reported an error
    if (!response.ok || !data.success) {
      showFetchStatus(data.error || 'Something went wrong. Try again.', 'error');
      return;
    }

    // 7. SUCCESS — fill the textarea with the extracted text
    const textarea = document.getElementById('chatInput');
    textarea.value = data.plainText;

    // 8. Update everything that depends on the textarea content
    updateStats();
    updatePreview();

    // 9. Show a success message with platform name and turn count
    let successMsg = `✓ Imported ${data.turns.length} messages from ${data.platform}`;
    if (data.warning) successMsg += ` — Note: ${data.warning}`;
    showFetchStatus(successMsg, data.warning ? 'loading' : 'success');

  } catch (networkError) {
    // This catches connection errors — e.g. if the server isn't running
    console.error('Network error:', networkError);
    showFetchStatus(
      'Could not connect to the ChatExport server. ' +
      'Make sure Your internet is running (If it is... Our servers may be down).',
      'error'
    );

  } finally {
    // "finally" runs whether we succeeded or failed — always restore the button
    fetchBtn.disabled    = false;
    fetchBtn.textContent = '↓ Import Chat';
  }
}

// ── Fetch Status Display ──────────────────────────────────────
// Shows a small status message below the URL input.
function showFetchStatus(message, type) {
  const el = document.getElementById('fetchStatus');
  if (!el) return;

  el.textContent = message;
  el.className   = 'fetch-status fetch-status--' + type; // CSS will style these
  el.style.display = 'block';

  // Auto-hide success messages after 4 seconds
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }
}

// ── Chat Parser ───────────────────────────────────────────────
// Detects speaker turns like "YOU:", "CHATGPT:", "CLAUDE:" etc.
function parseChatTurns(rawText) {
  const lines = rawText.split('\n');
  const turns = [];
  let currentSpeaker = null;
  let currentLines   = [];
 
  for (const line of lines) {
    const match = line.match(/^(You|User|Human|Me|ChatGPT|Claude|Gemini|Assistant|AI|GPT-?4?o?|Copilot|Bard)\s*[:\-]\s*/i);

    if (match) {
      if (currentSpeaker !== null && currentLines.length > 0) {
        turns.push({ speaker: currentSpeaker, text: currentLines.join('\n').trim() });
      }
      currentSpeaker = match[1];
      currentLines   = [line.replace(match[0], '').trim()];
    } else {
      currentLines.push(line);
    }
  }

  if (currentSpeaker !== null && currentLines.length > 0) {
    turns.push({ speaker: currentSpeaker, text: currentLines.join('\n').trim() });
  }

  return turns;
}

function speakerRole(speaker) {
  const humanSpeakers = ['you', 'user', 'human', 'me'];
  return humanSpeakers.includes(speaker.toLowerCase()) ? 'human' : 'ai';
}

// ── Preview ───────────────────────────────────────────────────
function updatePreview() {
  const text = document.getElementById('chatInput').value.trim();
  const box  = document.getElementById('previewBox');

  if (!text) {
    box.classList.remove('visible');
    box.innerHTML = '';
    return;
  }

  const turns = parseChatTurns(text);

  if (turns.length > 0) {
    box.innerHTML = '';
    let rendered = 0;

    for (const turn of turns) {
      if (rendered > 4) {
        const more = document.createElement('div');
        more.style.cssText = 'color: var(--muted); font-size: 0.72rem; padding: 4px 0;';
        more.textContent   = `… and ${turns.length - rendered} more message(s)`;
        box.appendChild(more);
        break;
      }

      const bubble = document.createElement('div');
      bubble.style.cssText = `
        margin-bottom: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        background: ${speakerRole(turn.speaker) === 'human' ? 'rgba(79,138,255,0.10)' : 'rgba(167,139,250,0.10)'};
        border-left: 3px solid ${speakerRole(turn.speaker) === 'human' ? 'var(--accent)' : 'var(--accent2)'};
      `;

      const label = document.createElement('div');
      label.style.cssText = `
        font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.08em; margin-bottom: 4px;
        color: ${speakerRole(turn.speaker) === 'human' ? 'var(--accent)' : 'var(--accent2)'};
      `;
      label.textContent = turn.speaker;

      const body = document.createElement('div');
      body.style.cssText = 'font-size: 0.78rem; color: var(--text); white-space: pre-wrap; word-break: break-word;';
      body.textContent   = turn.text.slice(0, 200) + (turn.text.length > 200 ? '…' : '');

      bubble.appendChild(label);
      bubble.appendChild(body);
      box.appendChild(bubble);
      rendered++;
    }
  } else {
    box.textContent = text.slice(0, 500) + (text.length > 500 ? '\n\n… (preview truncated)' : '');
  }

  box.classList.add('visible');
}

// ── Download Dispatcher ───────────────────────────────────────
function downloadFile() {
  const text     = document.getElementById('chatInput').value.trim();
  const fileName = document.getElementById('fileName').value.trim() || 'my-ai-chat';
  const sourceURL = document.getElementById('shareURL') ? document.getElementById('shareURL').value.trim() : '';

  if (!text) return;

  if (selectedFormat === 'txt') downloadAsTXT(text, fileName, sourceURL);
  else if (selectedFormat === 'pdf') downloadAsPDF(text, fileName, sourceURL);
  else if (selectedFormat === 'md')  downloadAsMD(text, fileName, sourceURL);

  showToast();
}

// ── TXT Export ────────────────────────────────────────────────
function downloadAsTXT(text, fileName, sourceURL) {
  const turns    = parseChatTurns(text);
  const divider  = '='.repeat(60);
  let content = `CHAT EXPORT — ChatExport.app\nExported: ${new Date().toLocaleString()}\n`;
  if (sourceURL) content += `Source:   ${sourceURL}\n`;
  content += `${divider}\n\n`;
  if (turns.length > 0) {
    for (const turn of turns) {
      content += `[${turn.speaker.toUpperCase()}]\n${turn.text}\n\n`;
    }
  } else {
    content += text + '\n';
  }
  content += `\n${divider}\nDownloaded from ChatExport.app`;
  triggerDownload(new Blob([content], { type: 'text/plain' }), fileName + '.txt');
}

// ── Markdown Export ───────────────────────────────────────────
function downloadAsMD(text, fileName, sourceURL) {
  const turns = parseChatTurns(text);
  let content = `# Chat Export\n\n**Exported:** ${new Date().toLocaleString()}  \n`;
  if (sourceURL) content += `**Source:** ${sourceURL}  \n`;
  content += `**Tool:** ChatExport.app\n\n---\n\n`;
  if (turns.length > 0) {
    for (const turn of turns) {
      content += `## ${turn.speaker}\n\n${turn.text}\n\n---\n\n`;
    }
  } else {
    content += `\`\`\`\n${text}\n\`\`\`\n\n`;
  }
  content += `*Downloaded from ChatExport.app*`;
  triggerDownload(new Blob([content], { type: 'text/markdown' }), fileName + '.md');
}

// ── PDF Export ────────────────────────────────────────────────
function downloadAsPDF(text, fileName, sourceURL) {
  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF('p', 'mm', 'a4');
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxW   = pageW - margin * 2;

  doc.setFillColor(13, 15, 20);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(79, 138, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ChatExport', margin, 12);
  doc.setTextColor(200, 205, 220);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('chatexport.app', margin, 19);
  doc.setTextColor(107, 114, 128);
  doc.setFontSize(7);
  doc.text(new Date().toLocaleString(), pageW - margin, 19, { align: 'right' });

  let y = 36;
  if (sourceURL) {
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(`Source: ${sourceURL}`, margin, y);
    y += 7;
  }

  const turns = parseChatTurns(text);
  if (turns.length > 0) {
    for (const turn of turns) {
      const isHuman = speakerRole(turn.speaker) === 'human';
      if (y > pageH - 30) { doc.addPage(); y = 20; }
      doc.setFillColor(...(isHuman ? [79, 138, 255] : [167, 139, 250]));
      doc.roundedRect(margin, y, maxW, 7, 1.5, 1.5, 'F');
      doc.setTextColor(...(isHuman ? [79, 138, 255] : [167, 139, 250]));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(turn.speaker.toUpperCase(), margin + 3, y + 5);
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 42, 54);
      const lines = doc.splitTextToSize(turn.text, maxW);
      for (const line of lines) {
        if (y > pageH - 20) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5;
      }
      y += 6;
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 42, 54);
    const lines = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      if (y > pageH - 20) { doc.addPage(); y = 20; }
      doc.text(line, margin, y);
      y += 5;
    }
  }

  doc.setFontSize(7);
  doc.setTextColor(150, 150, 160);
  doc.text('Exported with ChatExport.app', pageW / 2, pageH - 8, { align: 'center' });
  doc.save(fileName + '.pdf');
}

// ── Utilities ─────────────────────────────────────────────────
function triggerDownload(blob, fullFileName) {
  const link    = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = fullFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}