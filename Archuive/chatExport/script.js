// ============================================================
//  ChatExport — script.js (Frontend)
//  This runs in the USER'S BROWSER.
//  It talks to Our SERVER (server.js) to fetch chat links.
//
//  KEY DESIGN PRINCIPLE for role detection:
//  When the server imports a chat, it returns turns[] with a
//  guaranteed .role field ('user' | 'assistant') pulled from
//  real DOM attributes (e.g. data-message-author-role on ChatGPT).
//  We cache those in serverTurns and use them directly for every
//  export — no re-parsing, no guessing from position or labels.
//
//  Manual-paste path falls back to parseChatTurns() which reads
//  explicit speaker labels. It never uses positional alternation
//  (i % 2) because that breaks on edits, timeouts, and retries.

const SERVER_URL = 'https://coolkidlabs-production.up.railway.app';

// ── Supported and Blocked Platforms ──────────────────────────
const SUPPORTED_PLATFORMS = [
  'ChatGPT', 'Poe', 'Phind', 'Grok', 'Copilot',
  'Character.AI', 'Pi.ai', 'You.com'
];

const BLOCKED_PLATFORMS = {
  'claude':      'Claude has strong security protections that prevent our tool from working.',
  'perplexity':  'Perplexity blocks automated access.',
  'kimi':        'Kimi has security restrictions that prevent extraction.',
  'gemini':      'Google Gemini blocks our extraction method.',
  'notebooklm':  'Google NotebookLM requires authentication.',
  'huggingchat': 'HuggingChat requires authentication to access saved chats.',
  'deepseek':    'DeepSeek has protection against automated access.',
  'mistral':     'Mistral has protection against automated access.'
};

// ── State ─────────────────────────────────────────────────────
let selectedFormat = 'txt';

// Turns array returned by the server — roles are authoritative here.
// Set when a URL import succeeds; cleared when the user edits manually.
let serverTurns = null;

// ── getActiveTurns ───────────────────────────────────────────
// Single source of truth for "what are the turns in this chat?"
// Priority: server data (has real roles) > text parsing (uses labels).
function getActiveTurns(text) {
  if (serverTurns && serverTurns.length > 0) {
    return serverTurns;
  }
  return parseChatTurns(text);
}

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
// Called when the user clicks "Import from Link".
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

  // 3. Check for blocked platforms on client side first
  for (const [platform, message] of Object.entries(BLOCKED_PLATFORMS)) {
    if (url.includes(platform) ||
        (platform === 'claude'       && url.includes('claude.ai')) ||
        (platform === 'perplexity'   && url.includes('perplexity.ai')) ||
        (platform === 'kimi'         && (url.includes('kimi.ai') || url.includes('moonshot'))) ||
        (platform === 'gemini'       && url.includes('gemini.google')) ||
        (platform === 'notebooklm'   && (url.includes('notebooklm.google') || url.includes('notebook.google'))) ||
        (platform === 'huggingchat'  && url.includes('huggingface.co/chat')) ||
        (platform === 'deepseek'     && url.includes('deepseek.com')) ||
        (platform === 'mistral'      && url.includes('mistral.ai'))) {
      showFetchStatus(`Sorry, ${message} Try a different link (ChatGPT, Poe, Phind, Grok, Copilot, etc.)`, 'error');
      return;
    }
  }

  // 4. Show loading state — disable button so they can't double-click
  fetchBtn.disabled    = true;
  fetchBtn.textContent = '⏳ Fetching...';
  showFetchStatus('Connecting to server and loading the chat page…', 'loading');

  try {
    // 5. Send a POST request to our Node.js server
    const response = await fetch(`${SERVER_URL}/fetch-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    // 6. Parse the server's JSON response
    const data = await response.json();

    // 7. Check if the server reported an error
    if (!data.success) {
      if (data.error && data.error.toLowerCase().includes('not supported')) {
        showFetchStatus(`Sorry, that AI is not supported. Try: ${SUPPORTED_PLATFORMS.join(', ')}`, 'error');
      } else if (data.error && (data.error.toLowerCase().includes('cloudflare') || data.error.toLowerCase().includes('protection') || data.error.toLowerCase().includes('blocks'))) {
        showFetchStatus(`Sorry, that AI isn't supported. Try a different link.`, 'error');
      } else if (data.error && data.error.toLowerCase().includes('timeout')) {
        showFetchStatus('The page took too long to load. Try again or paste manually.', 'error');
      } else if (data.error && data.error.toLowerCase().includes('no chat content')) {
        showFetchStatus('No chat found on that page. The link may be expired or require login. Try pasting manually.', 'error');
      } else if (data.error && (data.error.toLowerCase().includes('unavailable') || data.error.toLowerCase().includes('not available'))) {
        showFetchStatus('Sorry, our services are currently not available right now. Try again later.', 'error');
      } else {
        showFetchStatus(data.error || 'Something went wrong. Try again.', 'error');
      }
      return;
    }

    // 8. SUCCESS — cache the authoritative turns array from the server.
    //    These have reliable .role values pulled from real DOM attributes.
    //    We use these directly for export instead of re-parsing the text.
    serverTurns = data.turns;

    // 9. Fill the textarea with plain text so the user can see/edit it.
    //    If they edit it, serverTurns is cleared (see the 'input' listener below).
    document.getElementById('chatInput').value = data.plainText;

    // 10. Update everything that depends on the textarea content
    updateStats();
    updatePreview();

    // 11. Show a success message with platform name and turn count
    let successMsg = `✓ Imported ${data.turns.length} messages from ${data.platform}`;
    if (data.warning) successMsg += ` — Note: ${data.warning}`;
    showFetchStatus(successMsg, data.warning ? 'loading' : 'success');

  } catch (networkError) {
    console.error('Network error:', networkError);
    if (networkError instanceof TypeError) {
      showFetchStatus('Please check your internet connection and try again.', 'error');
    } else {
      showFetchStatus('Sorry, our services are currently not available right now. Try again later.', 'error');
    }
  } finally {
    fetchBtn.disabled    = false;
    fetchBtn.textContent = '↓ Import Chat';
  }
}

// ── Fetch Status Display ──────────────────────────────────────
function showFetchStatus(message, type) {
  const el = document.getElementById('fetchStatus');
  if (!el) return;
  el.textContent   = message;
  el.className     = 'fetch-status fetch-status--' + type;
  el.style.display = 'block';
  if (type === 'success') {
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }
}

// ── Chat Parser (manual-paste fallback) ──────────────────────
// Used only when there's no server-provided turns data.
// Reads explicit speaker labels — never uses positional alternation,
// because that breaks the moment any message gets edited, retried, or
// arrives out of order.
//
// Handles these label formats:
//   You: ...          ChatGPT: ...       [USER] You: ...
//   USER: ...         ASSISTANT: ...     [AI] ChatGPT: ...   (our own TXT export format)
//   Human: ...        Me: ...

function parseChatTurns(rawText) {
  const lines = rawText.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Matches optional [USER]/[AI] bracket prefix, then the speaker name and colon/dash.
  // The bracket prefix is produced by our own TXT/MD exports — supporting it means
  // a previously-exported file can be re-imported and still parsed correctly.
  //
  // IMPORTANT: ASSISTANT and USER are listed first in the alternation so they
  // take priority over shorter partial matches (e.g. "AI" inside "ASSISTANT").
  // These are the canonical labels written by server.js into plainText.
  const speakerRegex = /^(?:\[(?:USER|AI|ASSISTANT|HUMAN|BOT)\]\s+)?(ASSISTANT|USER|You|User|Human|Me|ChatGPT|Claude|Gemini|Assistant|AI|GPT-?4o?|Copilot|Bard|DeepSeek|Grok|Kimi|Perplexity|Mistral|Poe|Phind|Character|Pi|Bot|System)\s*[:\-]\s*/i;

  const turns       = [];
  let currentSpeaker = null;
  let currentLines   = [];
  let messageIndex   = 0;
  let foundAnyLabel  = false;

  for (const line of lines) {
    const match = line.match(speakerRegex);

    if (match) {
      foundAnyLabel = true;

      // Save the previous speaker's accumulated text
      if (currentSpeaker !== null && currentLines.length > 0) {
        turns.push({
          speaker: currentSpeaker,
          text:    currentLines.join('\n').trim(),
          role:    speakerRole(currentSpeaker),
          index:   messageIndex++
        });
      }

      // Start new speaker block
      currentSpeaker = match[1];
      const restOfLine = line.replace(match[0], '').trim();
      currentLines = restOfLine ? [restOfLine] : [];

    } else if (currentSpeaker !== null) {
      // Continuation line for the current speaker
      currentLines.push(line);
    }
    // Lines before any label is found are silently ignored —
    // we never assume position-based roles for unlabelled text.
  }

  // Save the final message
  if (currentSpeaker !== null && currentLines.length > 0) {
    turns.push({
      speaker: currentSpeaker,
      text:    currentLines.join('\n').trim(),
      role:    speakerRole(currentSpeaker),
      index:   messageIndex
    });
  }

  // If no labels were found at all, return the whole thing as one unlabelled block
  // rather than guessing who said what. The preview will show it as raw text.
  if (!foundAnyLabel && rawText.trim().length > 0) {
    return [{
      speaker: 'Unknown',
      text:    rawText.trim(),
      role:    'unknown',
      index:   0
    }];
  }

  return turns;
}

// Maps a speaker name to 'human' or 'ai'.
// The canonical labels from server.js are 'ASSISTANT' and 'USER' (case-insensitive).
// All other names are matched by list — AI names → 'ai', human names → 'human'.
function speakerRole(speaker) {
  const name = speaker.toLowerCase();

  // Canonical role labels written by server.js plainText generation
  if (name === 'assistant') return 'ai';
  if (name === 'user')      return 'human';

  // Human speaker names
  const humanSpeakers = ['you', 'human', 'me'];
  if (humanSpeakers.includes(name)) return 'human';

  // Everything else (ChatGPT, Claude, Bot, AI, Grok, etc.) is the AI
  return 'ai';
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

  const turns = getActiveTurns(text);

  if (turns.length > 0 && turns[0].role !== 'unknown') {
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

      const bubble   = document.createElement('div');
      const isHuman  = turn.role === 'human';
      bubble.style.cssText = `
        margin-bottom: 10px;
        padding: 8px 12px;
        border-radius: 8px;
        background: ${isHuman ? 'rgba(79,138,255,0.10)' : 'rgba(167,139,250,0.10)'};
        border-left: 3px solid ${isHuman ? 'var(--accent)' : 'var(--accent2)'};
      `;

      const label = document.createElement('div');
      label.style.cssText = `
        font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.08em; margin-bottom: 4px;
        color: ${isHuman ? 'var(--accent)' : 'var(--accent2)'};
      `;
      label.textContent = (isHuman ? '👤 You' : '🤖 AI') + ' — ' + turn.speaker;

      const body = document.createElement('div');
      body.style.cssText = 'font-size: 0.78rem; color: var(--text); white-space: pre-wrap; word-break: break-word;';
      body.textContent   = turn.text.slice(0, 200) + (turn.text.length > 200 ? '…' : '');

      bubble.appendChild(label);
      bubble.appendChild(body);
      box.appendChild(bubble);
      rendered++;
    }
  } else {
    // No labels detected — show raw text
    box.textContent = text.slice(0, 500) + (text.length > 500 ? '\n\n… (preview truncated)' : '');
  }

  box.classList.add('visible');
}

// ── Download Dispatcher ───────────────────────────────────────
function downloadFile() {
  const text      = document.getElementById('chatInput').value.trim();
  const fileName  = document.getElementById('fileName').value.trim() || 'my-ai-chat';
  const sourceURL = document.getElementById('shareURL')
    ? document.getElementById('shareURL').value.trim()
    : '';

  if (!text) return;

  if (selectedFormat === 'txt') downloadAsTXT(text, fileName, sourceURL);
  else if (selectedFormat === 'pdf') downloadAsPDF(text, fileName, sourceURL);
  else if (selectedFormat === 'md')  downloadAsMD(text, fileName, sourceURL);

  showToast();
}

// ── TXT Export ────────────────────────────────────────────────
function downloadAsTXT(text, fileName, sourceURL) {
  const turns   = getActiveTurns(text);
  const divider = '='.repeat(70);
  let content = `CHAT EXPORT — ChatExport.app\nExported: ${new Date().toLocaleString()}\n${sourceURL ? `Source:   ${sourceURL}\n` : ''}${divider}\n\n`;

  if (turns.length > 0 && turns[0].role !== 'unknown') {
    for (const turn of turns) {
      const role = turn.role === 'human' ? '[USER]' : '[AI]';
      content += `${role} ${turn.speaker}:\n${turn.text}\n\n`;
    }
  } else {
    content += text + '\n';
  }

  content += `\n${divider}\nDownloaded from ChatExport.app`;
  triggerDownload(new Blob([content], { type: 'text/plain' }), fileName + '.txt');
}

// ── Markdown Export ───────────────────────────────────────────
function downloadAsMD(text, fileName, sourceURL) {
  const turns = getActiveTurns(text);
  let content = `# Chat Export\n\n**Exported:** ${new Date().toLocaleString()}  \n`;
  if (sourceURL) content += `**Source:** ${sourceURL}  \n`;
  content += `**Tool:** ChatExport.app\n\n---\n\n`;

  if (turns.length > 0 && turns[0].role !== 'unknown') {
    for (const turn of turns) {
      const role = turn.role === 'human' ? '👤 USER' : '🤖 AI';
      content += `### ${role}\n\n**${turn.speaker}**\n\n${turn.text}\n\n---\n\n`;
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
  const doc   = new jsPDF('p', 'mm', 'a4');
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxW   = pageW - margin * 2;

  // Header bar
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

  const turns = getActiveTurns(text);

  if (turns.length > 0 && turns[0].role !== 'unknown') {
    for (const turn of turns) {
      const isHuman = turn.role === 'human';
      if (y > pageH - 30) { doc.addPage(); y = 20; }

      // Role header
      doc.setFillColor(...(isHuman ? [79, 138, 255] : [167, 139, 250]));
      doc.roundedRect(margin, y, maxW, 7, 1.5, 1.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const roleLabel = (isHuman ? '👤 USER' : '🤖 AI') + ' — ' + turn.speaker.toUpperCase();
      doc.text(roleLabel, margin + 3, y + 5);
      y += 10;

      // Message content
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

// ── Event Wiring ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fetchBtn')
    .addEventListener('click', fetchFromURL);

  // When the user manually edits the textarea, the server-provided
  // turns are no longer valid — clear them so we fall back to parsing.
  document.getElementById('chatInput')
    .addEventListener('input', () => {
      serverTurns = null;
      updateStats();
    });

  document.getElementById('btn-txt')
    .addEventListener('click', () => selectFormat('txt'));

  document.getElementById('btn-pdf')
    .addEventListener('click', () => selectFormat('pdf'));

  document.getElementById('btn-md')
    .addEventListener('click', () => selectFormat('md'));

  document.getElementById('downloadBtn')
    .addEventListener('click', downloadFile);
});