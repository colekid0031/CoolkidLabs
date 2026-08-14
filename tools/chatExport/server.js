// ============================================================
//  ChatExport — server.js 
//
//  The TWO strategies to extract chat content:
//
//  Strategy 1 — node-fetch + cheerio (fast, lightweight)
//    Works for: ChatGPT, Perplexity, Poe, Phind, HuggingChat
//    These platforms send real HTML content directly.
//
//  Strategy 2 — Puppeteer (full headless Chrome browser)
//    Works for: Claude, Gemini, Grok, DeepSeek, Kimi, Mistral

//  The server Should try Strategy 1 first (fast).
//  If it gets no content, it   will falls back to
//  Strategy 2 (slower but more powerful).
//
//  Users are responsible for what they export.
// ============================================================

const express   = require('express');
const cors      = require('cors');
// fetch is built into Node 18+ — no import needed
const cheerio   = require('cheerio');
const puppeteer = require('puppeteer');

const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// Set permissive CSP header to allow jsPDF (which uses eval internally)
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self' https:",
      "script-src 'self' 'unsafe-eval' https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://coolkidlabs-production.up.railway.app",
      "img-src 'self' data:",
      "font-src 'self' data: https://cdnjs.cloudflare.com",
    ].join('; ')
  );
  next();
});

app.use(cors());
app.use(express.json());

// Serve the frontend static files
app.use(express.static(path.join(__dirname)));

// ── URL safety check ─────────────────────────────────────────
// Protects The server from being used as a hacking tool.
// Blocks internal/private IPs only — all public URLs are allowed.
function isSafeURL(rawURL) {
  let parsed;
  try { parsed = new URL(rawURL); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blockedHosts.includes(host)) return false;
  const privateRanges = [
    /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
    /^fc00:/, /^fe80:/,
  ];
  if (privateRanges.some(r => r.test(host))) return false;
  return true;
}

// ── Detect platform ───────────────────────────────────────────
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

// Platforms that NEED Puppeteer (JavaScript-rendered pages)
const NEEDS_PUPPETEER = [
  'claude', 'gemini', 'grok', 'deepseek',
  'kimi', 'mistral', 'notebooklm', 'characterai', 'pi'
];
 
// ── STRATEGY 1: Extract via cheerio (raw HTML) ────────────────
function extractWithCheerio($, platform) {
  const turns = [];

  if (platform === 'chatgpt') {
    $('[data-message-author-role]').each((i, el) => {
      const role = $(el).attr('data-message-author-role');
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: role === 'user' ? 'You' : 'ChatGPT', text });
    });
    if (turns.length) return { turns, platform: 'ChatGPT' };
    $('[class*="markdown"], [class*="prose"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) turns.push({ speaker: i % 2 === 0 ? 'You' : 'ChatGPT', text });
    });
    if (turns.length) return { turns, platform: 'ChatGPT' };
  }

  if (platform === 'perplexity') {
    $('[class*="UserMessage"], [data-testid="user-message"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: 'You', text });
    });
    $('[class*="AnswerBody"], [class*="prose"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 50) turns.push({ speaker: 'Perplexity', text });
    });
    if (turns.length) return { turns, platform: 'Perplexity' };
  }

  if (platform === 'poe') {
    $('[class*="humanMessage"], [class*="botMessage"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Bot', text });
    });
    if (turns.length) return { turns, platform: 'Poe' };
  }

  if (platform === 'huggingchat') {
    $('[class*="message"], [data-role]').each((i, el) => {
      const role = $(el).attr('data-role');
      const text = $(el).text().trim();
      if (text.length > 20) turns.push({ speaker: role === 'user' ? 'You' : 'Assistant', text });
    });
    if (turns.length) return { turns, platform: 'HuggingChat' };
  }

  if (platform === 'phind') {
    $('[class*="query"], [class*="answer"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Phind', text });
    });
    if (turns.length) return { turns, platform: 'Phind' };
  }

  if (platform === 'copilot') {
    $('[data-testid="user-message"], [data-testid="bot-message"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 10) turns.push({ speaker: i % 2 === 0 ? 'You' : 'Copilot', text });
    });
    if (turns.length) return { turns, platform: 'Copilot' };
  }

  // Generic fallback
  const genericSelectors = [
    '[class*="message"]', '[class*="Message"]',
    '[class*="chat"]',    '[class*="turn"]',
    '[class*="bubble"]',  '[role="listitem"]',
  ];
  for (const sel of genericSelectors) {
    const els = $(sel);
    if (els.length >= 2 && els.length <= 150) {
      els.each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) turns.push({ speaker: i % 2 === 0 ? 'User' : 'Assistant', text });
      });
      if (turns.length >= 2) return { turns, platform: 'Unknown AI' };
      turns.length = 0;
    }
  }

  // Last resort: full page text
  $('nav, footer, header, aside, script, style').remove();
  const mainEl = $('main, [role="main"], article').first();
  const fullText = (mainEl.length ? mainEl : $('body')).text().trim();
  if (fullText.length > 100) {
    return {
      turns: [{ speaker: 'Chat', text: fullText }],
      platform: 'Unknown',
      warning: 'Could not detect individual messages — extracted full page text.'
    };
  }

  return { turns: [], platform: 'Unknown' };
}

// ── STRATEGY 2: Extract via Puppeteer (headless Chrome) ───────
// Runs a real browser, waits for JavaScript to load the chat,
// then reads the rendered HTML. Works for React-based platforms.
async function extractWithPuppeteer(url, platform) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',            // required in Docker/Railway containers
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // /dev/shm is tiny in Docker; use /tmp instead
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36'
    );

    // Load the page and wait for network to settle
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Extra wait for slow JS frameworks to finish rendering
    await new Promise(r => setTimeout(r, 3500));

    // Scroll down to trigger any lazy-loaded content
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1000));

    // Run extraction inside the real browser
    const result = await page.evaluate((plat) => {

      function trySelectors(selectors) {
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          if (els.length > 0) return Array.from(els);
        }
        return [];
      }

      function sortByPosition(items) {
        return items
          .map(o => ({ ...o, top: o.el.getBoundingClientRect().top + window.scrollY }))
          .sort((a, b) => a.top - b.top)
          .map(({ speaker, el }) => ({ speaker, text: el.innerText.trim() }))
          .filter(t => t.text.length > 0);
      }

      // ── Claude ─────────────────────────────────────────────
      if (plat === 'claude') {
        const human = trySelectors([
          '[data-testid="human-turn"]', '.human-turn',
          '[class*="HumanTurn"]', '[class*="human_turn"]',
        ]);
        const ai = trySelectors([
          '[data-testid="ai-turn"]', '.ai-turn',
          '[class*="AiTurn"]', '[class*="AssistantTurn"]',
          '[class*="assistant_turn"]',
        ]);
        if (human.length || ai.length) {
          const all = sortByPosition([
            ...human.map(el => ({ el, speaker: 'You' })),
            ...ai.map(el => ({ el, speaker: 'Claude' })),
          ]);
          if (all.length) return { turns: all, platform: 'Claude' };
        }
      }

      // ── Gemini ─────────────────────────────────────────────
      if (plat === 'gemini') {
        const user = trySelectors(['.user-query', '[class*="user-message"]']);
        const ai   = trySelectors(['.model-response', '[class*="model-response"]']);
        if (user.length || ai.length) {
          const all = sortByPosition([
            ...user.map(el => ({ el, speaker: 'You' })),
            ...ai.map(el => ({ el, speaker: 'Gemini' })),
          ]);
          if (all.length) return { turns: all, platform: 'Gemini' };
        }
      }

      // ── Grok ───────────────────────────────────────────────
      if (plat === 'grok') {
        const msgs = trySelectors([
          '[class*="message-bubble"]', '[class*="MessageBubble"]',
          '[data-testid*="message"]',
        ]);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Grok',
              text: el.innerText.trim()
            })).filter(t => t.text.length > 0),
            platform: 'Grok'
          };
        }
      }

      // ── DeepSeek ───────────────────────────────────────────
      if (plat === 'deepseek') {
        const msgs = trySelectors([
          '[class*="message"]', '[class*="chat-message"]', '[class*="MessageItem"]',
        ]);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'DeepSeek',
              text: el.innerText.trim()
            })).filter(t => t.text.length > 10),
            platform: 'DeepSeek'
          };
        }
      }

      // ── Kimi ───────────────────────────────────────────────
      if (plat === 'kimi') {
        const msgs = trySelectors(['[class*="message"]', '[class*="bubble"]']);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Kimi',
              text: el.innerText.trim()
            })).filter(t => t.text.length > 10),
            platform: 'Kimi'
          };
        }
      }

      // ── Mistral ────────────────────────────────────────────
      if (plat === 'mistral') {
        const msgs = trySelectors(['[class*="message"]', '[class*="MessageRow"]']);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Mistral',
              text: el.innerText.trim()
            })).filter(t => t.text.length > 10),
            platform: 'Mistral'
          };
        }
      }

      // ── NotebookLM ─────────────────────────────────────────
      if (plat === 'notebooklm') {
        const msgs = trySelectors(['[class*="chat-turn"]', '[class*="ChatTurn"]', '[class*="message"]']);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'NotebookLM',
              text: el.innerText.trim()
            })).filter(t => t.text.length > 10),
            platform: 'NotebookLM'
          };
        }
      }

      // ── Generic browser fallback ────────────────────────────
      const genericSelectors = [
        '[class*="message"]', '[class*="Message"]',
        '[class*="chat"]', '[class*="turn"]',
        '[class*="bubble"]', '[role="listitem"]',
      ];
      for (const sel of genericSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length >= 2 && els.length <= 150) {
          const turns = Array.from(els)
            .map((el, i) => ({ speaker: i % 2 === 0 ? 'User' : 'Assistant', text: el.innerText.trim() }))
            .filter(t => t.text.length > 30);
          if (turns.length >= 2) return { turns, platform: 'Unknown AI' };
        }
      }

      // Last resort: full page text
      const body = document.body.innerText.trim();
      if (body.length > 100) {
        return {
          turns: [{ speaker: 'Chat', text: body }],
          platform: 'Unknown',
          warning: 'Could not detect individual messages — extracted full page text.'
        };
      }

      return { turns: [], platform: 'Unknown' };

    }, platform);

    await browser.close();
    browser = null;
    return result;

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw err;
  }
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
    return res.status(400).json({ error: 'Please provide a valid public https:// URL.' });
  }

  const platform = detectPlatform(trimmedURL);
  console.log(`[ChatExport] Platform: ${platform} | URL: ${trimmedURL}`);

  try {
    let chatData;

    if (NEEDS_PUPPETEER.includes(platform)) {
      // Go straight to Puppeteer for JS-heavy platforms
      console.log(`[ChatExport] Using Puppeteer for ${platform}`);
      chatData = await extractWithPuppeteer(trimmedURL, platform);
    } else {
      // Try fast cheerio first
      console.log(`[ChatExport] Trying cheerio for ${platform}`);
      const response = await fetch(trimmedURL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: AbortSignal.timeout(20000), // native fetch timeout (replaces node-fetch's timeout option)
      });

      if (!response.ok) {
        // The target site blocked the plain fetch (Cloudflare, auth wall, etc.)
        // Log the real status so we can see it in Railway logs, then try Puppeteer.
        console.warn(`[ChatExport] Cheerio fetch got HTTP ${response.status} for ${trimmedURL} — falling back to Puppeteer`);
        chatData = await extractWithPuppeteer(trimmedURL, platform);
      } else {
        const html = await response.text();
        const $    = cheerio.load(html);
        chatData   = extractWithCheerio($, platform);

        // If cheerio got nothing useful, fall back to Puppeteer
        if (!chatData.turns || chatData.turns.length === 0) {
          console.log(`[ChatExport] Cheerio got nothing, falling back to Puppeteer`);
          chatData = await extractWithPuppeteer(trimmedURL, platform);
        }
      }
    }

    if (!chatData.turns || chatData.turns.length === 0) {
      return res.status(422).json({
        error:
          'No chat content found on this page. ' +
          'The link may require login or the page structure is unusual. ' +
          'Try copying and pasting the chat manually instead.'
      });
    }

    console.log(`[ChatExport] Success — ${chatData.turns.length} turns from ${chatData.platform}`);

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
    console.error('[ChatExport] Full error:', err); // full stack trace in Railway logs
    let userMessage = 'Failed to fetch the page.';
    if (err.message.includes('timeout')) {
      userMessage = 'The page took too long to load. Try again or paste manually.';
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      userMessage = 'Could not reach that URL. Check the link and try again.';
    }
    // Include the real error message so it shows in the browser console,
    // not just buried in Railway logs.
    res.status(500).json({ error: userMessage, serverError: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   ChatExport Server is running!              ║
  ║   http://localhost:${PORT}                      ║
  ╠══════════════════════════════════════════════╣
  ║  Strategy 1: cheerio  (fast HTML fetch)      ║
  ║  Strategy 2: Puppeteer (full headless Chrome)║
  ║  Auto-selects the best method per platform   ║
  ╚══════════════════════════════════════════════╝
  Press Ctrl+C to stop.
  `);
});