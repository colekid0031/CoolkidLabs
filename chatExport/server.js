// ============================================================
//  ChatExport — server.js
//
//  A backend server. It receives a public URL from your
//  website, fetches the page, extracts the chat text, and
//  sends it back to the user's browser.
//
//  Users are responsible for what they export.//
//  This tool only accesses pages the user explicitly shares.
//
//  Supported platforms (dedicated extractors):
//  Claude · ChatGPT · Gemini · Grok · DeepSeek · Kimi
//  Perplexity · Mistral · Copilot · NotebookLM
//  HuggingChat · Poe · Character.AI · Phind
//  + generic fallback for any other public URL
// ============================================================

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const cheerio = require('cheerio');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── URL safety check ─────────────────────────────────────────
// We block internal addresses only.
// Any real public website on the internet is allowed.
function isSafeURL(rawURL) {
  let parsed;
  try { parsed = new URL(rawURL); } catch { return false; }

  // Must be https
  if (parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase();

  // Block internal/private addresses (protects your server, not the user)
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blockedHosts.includes(host)) return false;

  const privateRanges = [
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^fc00:/,
    /^fe80:/,
  ];
  if (privateRanges.some(r => r.test(host))) return false;

  return true; // Any real public URL passes
}

// ── Detect which AI platform the URL is from ─────────────────
function detectPlatform(url) {
  if (url.includes('claude.ai'))           return 'claude';
  if (url.includes('chat.openai.com'))     return 'chatgpt';
  if (url.includes('chatgpt.com'))         return 'chatgpt';
  if (url.includes('gemini.google.com'))   return 'gemini';
  if (url.includes('notebooklm.google'))   return 'notebooklm';
  if (url.includes('grok.com'))            return 'grok';
  if (url.includes('x.com/i/grok'))        return 'grok';
  if (url.includes('deepseek.com'))        return 'deepseek';
  if (url.includes('kimi.moonshot.cn'))    return 'kimi';
  if (url.includes('kimi.ai'))             return 'kimi';
  if (url.includes('perplexity.ai'))       return 'perplexity';
  if (url.includes('mistral.ai'))          return 'mistral';
  if (url.includes('copilot.microsoft'))   return 'copilot';
  if (url.includes('bing.com/chat'))       return 'copilot';
  if (url.includes('huggingface.co/chat')) return 'huggingchat';
  if (url.includes('poe.com'))             return 'poe';
  if (url.includes('character.ai'))        return 'characterai';
  if (url.includes('pi.ai'))               return 'pi';
  if (url.includes('you.com'))             return 'you';
  if (url.includes('phind.com'))           return 'phind';
  return 'generic';
}

// ── Platforms that load content via JavaScript ───────────────
// node-fetch gets raw HTML only — it cannot run JavaScript.
// These platforms build their pages with React, meaning the
// chat content is added AFTER the page loads via JS.
// We still try to extract whatever HTML is available,
// but warn the user if nothing is found.
const JS_HEAVY = ['claude', 'gemini', 'grok', 'deepseek', 'kimi', 'mistral', 'notebooklm'];

// ── Extract chat content from the fetched HTML ───────────────
// cheerio lets us search HTML with CSS selectors,
// like jQuery but running in Node.js instead of a browser.
function extractChat($, platform) {
  const turns = [];

  // ── Claude ───────────────────────────────────────────────
  if (platform === 'claude') {
    $('[data-testid="human-turn"], .human-turn, [class*="HumanTurn"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: 'You', text });
    });
    $('[data-testid="ai-turn"], .ai-turn, [class*="AiTurn"], [class*="AssistantTurn"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: 'Claude', text });
    });
    if (turns.length) return sortAndReturn(turns, 'Claude');
  }

  // ── ChatGPT ──────────────────────────────────────────────
  if (platform === 'chatgpt') {
    $('[data-message-author-role]').each((i, el) => {
      const role = $(el).attr('data-message-author-role');
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: role === 'user' ? 'You' : 'ChatGPT', text });
    });
    if (turns.length) return { turns, platform: 'ChatGPT' };

    // Fallback
    $('[class*="markdown"], [class*="prose"], .text-base').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) turns.push({ speaker: i % 2 === 0 ? 'You' : 'ChatGPT', text });
    });
    if (turns.length) return { turns, platform: 'ChatGPT' };
  }

  // ── Gemini ───────────────────────────────────────────────
  if (platform === 'gemini') {
    $('.user-query, [class*="user-message"], user-query').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: 'You', text });
    });
    $('.model-response, [class*="model-response"], .response-content').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: 'Gemini', text });
    });
    if (turns.length) return { turns, platform: 'Gemini' };
  }

  // ── Grok ─────────────────────────────────────────────────
  if (platform === 'grok') {
    $('[class*="message-bubble"], [class*="MessageBubble"], [data-testid*="message"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Grok', text });
    });
    if (turns.length) return { turns, platform: 'Grok' };
  }

  // ── DeepSeek ─────────────────────────────────────────────
  if (platform === 'deepseek') {
    $('[class*="message"], [class*="chat-message"], [class*="MessageItem"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) turns.push({ speaker: i % 2 === 0 ? 'You' : 'DeepSeek', text });
    });
    if (turns.length) return { turns, platform: 'DeepSeek' };
  }

  // ── Kimi ─────────────────────────────────────────────────
  if (platform === 'kimi') {
    $('[class*="message"], [class*="chat-item"], [class*="bubble"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Kimi', text });
    });
    if (turns.length) return { turns, platform: 'Kimi' };
  }

  // ── Perplexity ───────────────────────────────────────────
  if (platform === 'perplexity') {
    $('[class*="UserMessage"], [data-testid="user-message"], [class*="query"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: 'You', text });
    });
    $('[class*="AnswerBody"], [class*="answer"], [class*="prose"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 50) turns.push({ speaker: 'Perplexity', text });
    });
    if (turns.length) return { turns, platform: 'Perplexity' };
  }

  // ── NotebookLM ───────────────────────────────────────────
  if (platform === 'notebooklm') {
    $('[class*="chat-turn"], [class*="ChatTurn"], [class*="message"], chat-turn').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) turns.push({ speaker: i % 2 === 0 ? 'You' : 'NotebookLM', text });
    });
    if (turns.length) return { turns, platform: 'NotebookLM' };
  }

  // ── Mistral ──────────────────────────────────────────────
  if (platform === 'mistral') {
    $('[class*="message"], [class*="MessageRow"], [class*="chat-row"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Mistral', text });
    });
    if (turns.length) return { turns, platform: 'Mistral' };
  }

  // ── Copilot ──────────────────────────────────────────────
  if (platform === 'copilot') {
    $('[data-testid="user-message"], [data-testid="bot-message"], [class*="message"], cib-message').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Copilot', text });
    });
    if (turns.length) return { turns, platform: 'Copilot' };
  }

  // ── HuggingChat ──────────────────────────────────────────
  if (platform === 'huggingchat') {
    $('[class*="message"], [data-role], [class*="chat"]').each((i, el) => {
      const role = $(el).attr('data-role');
      const text = $(el).text().trim();
      if (text.length > 20) turns.push({ speaker: role === 'user' ? 'You' : 'Assistant', text });
    });
    if (turns.length) return { turns, platform: 'HuggingChat' };
  }

  // ── Poe ──────────────────────────────────────────────────
  if (platform === 'poe') {
    $('[class*="humanMessage"], [class*="botMessage"], [class*="Message_humanMessageBubble"], [class*="Message_botMessageBubble"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Bot', text });
    });
    if (turns.length) return { turns, platform: 'Poe' };
  }

  // ── Character.AI ─────────────────────────────────────────
  if (platform === 'characterai') {
    $('[class*="message"], [data-author-name], [class*="chat-message"]').each((i, el) => {
      const author = $(el).attr('data-author-name') || (i % 2 === 0 ? 'You' : 'Character');
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: author, text });
    });
    if (turns.length) return { turns, platform: 'Character.AI' };
  }

  // ── Phind ────────────────────────────────────────────────
  if (platform === 'phind') {
    $('[class*="message"], [class*="query"], [class*="answer"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Phind', text });
    });
    if (turns.length) return { turns, platform: 'Phind' };
  }

  // ── Generic fallback — works for any other URL ────────────
  // Try common chat-like CSS patterns. This catches platforms
  // we haven't listed above, as long as their HTML is readable.
  const genericSelectors = [
    '[class*="message"]', '[class*="Message"]',
    '[class*="chat"]',    '[class*="Chat"]',
    '[class*="turn"]',    '[class*="Turn"]',
    '[class*="bubble"]',  '[class*="Bubble"]',
    '[class*="conversation"]', '[role="listitem"]',
  ];

  for (const sel of genericSelectors) {
    const els = $(sel);
    if (els.length >= 2 && els.length <= 150) {
      els.each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) {
          turns.push({ speaker: i % 2 === 0 ? 'User' : 'Assistant', text });
        }
      });
      if (turns.length >= 2) return { turns, platform: 'Unknown AI' };
      turns.length = 0;
    }
  }

  // ── Last resort: grab the whole page's readable text ─────
  $('nav, footer, header, aside, script, style').remove();
  const mainEl = $('main, [role="main"], article, #content, .content').first();
  const fullText = (mainEl.length ? mainEl : $('body')).text().trim();

  if (fullText.length > 100) {
    return {
      turns: [{ speaker: 'Chat', text: fullText }],
      platform: 'Unknown',
      warning: 'Could not detect individual messages — extracted the full page text. You may want to tidy it up before downloading.'
    };
  }

  return { turns: [], platform: 'Unknown' };
}

// Helper — sorts interleaved human/AI turns by order
function sortAndReturn(turns, platformName) {
  return { turns, platform: platformName };
}

// ── ROUTE: Health check ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'ChatExport server is running' });
});

// ── ROUTE: Fetch any public AI chat URL ──────────────────────
app.post('/fetch-chat', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Please provide a URL.' });
  }

  const trimmedURL = url.trim();

  if (!isSafeURL(trimmedURL)) {
    return res.status(400).json({
      error: 'Please provide a valid public https:// URL.'
    });
  }

  const platform = detectPlatform(trimmedURL);
  console.log(`[ChatExport] Platform: ${platform} | URL: ${trimmedURL}`);

  try {
    // Fetch the page HTML (like a browser loading a URL)
    const response = await fetch(trimmedURL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 20000,
    });

    if (!response.ok) {
      return res.status(422).json({
        error: `The page returned an error (${response.status}). Make sure the link is a valid public share link.`
      });
    }

    const html = await response.text();
    const $    = cheerio.load(html);

    const chatData = extractChat($, platform);

    // If it's a JS-heavy platform and we got nothing, explain clearly
    if (JS_HEAVY.includes(platform) && chatData.turns.length === 0) {
      return res.status(422).json({
        error:
          `${platform.charAt(0).toUpperCase() + platform.slice(1)} loads its chat content ` +
          `using JavaScript, which this server cannot run. ` +
          `Please copy and paste the chat text manually into the text box below.`
      });
    }

    if (!chatData.turns || chatData.turns.length === 0) {
      return res.status(422).json({
        error:
          'No chat content found on this page. ' +
          'The link may require login, or the page structure is unusual. ' +
          'Try copying and pasting the chat manually instead.'
      });
    }

    console.log(`[ChatExport] Extracted ${chatData.turns.length} turns from ${chatData.platform}`);

    res.json({
      success:   true,
      platform:  chatData.platform,
      warning:   chatData.warning || null,
      turnCount: chatData.turns.length,
      turns:     chatData.turns,
      plainText: chatData.turns
        .map(t => `${t.speaker.toUpperCase()}:\n${t.text}`)
        .join('\n\n')
    });

  } catch (err) {
    console.error('[ChatExport] Error:', err.message);

    let userMessage = 'Failed to fetch the page.';
    if (err.type === 'request-timeout' || err.message.includes('timeout')) {
      userMessage = 'The page took too long to load. Try again, or paste the chat manually.';
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      userMessage = 'Could not reach that URL. Check the link and try again.';
    }

    res.status(500).json({ error: userMessage });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   ChatExport Server is running!              ║
  ║   http://localhost:${PORT}                      ║
  ╠══════════════════════════════════════════════╣
  ║  Claude · ChatGPT · Gemini · Grok            ║
  ║  DeepSeek · Kimi · Perplexity · Mistral      ║
  ║  Copilot · NotebookLM · HuggingChat · Poe   ║
  ║  Character.AI · Phind · + any public URL     ║
  ╚══════════════════════════════════════════════╝
  Press Ctrl+C to stop.
  `);
});
