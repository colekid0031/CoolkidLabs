// ============================================================
//  ChatExport — server.js 
//
//  The TWO strategies to extract chat content:
//
//  Strategy 1 — node-fetch + cheerio (fast, lightweight)
//    Works for: ChatGPT, Poe, Phind, You.com, Grok (sometimes)
//    These platforms send real HTML content directly.
//
//  Strategy 2 — Puppeteer (full headless Chrome browser)
//    Works for: Grok, Copilot, Character.ai, Pi.ai
//
//  BLOCKED PLATFORMS (Cloudflare/Bot protection):
//    Claude, Perplexity, Kimi, Gemini, NotebookLM, HuggingChat, 
//    DeepSeek, Mistral — these have strong bot detection
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

// ── Blocked platforms (Cloudflare/strong bot protection) ──────
const BLOCKED_PLATFORMS = [
  'claude', 'perplexity', 'kimi', 'gemini', 'notebooklm', 
  'huggingchat', 'deepseek', 'mistral'
];

const BLOCKED_MESSAGES = {
  'claude': 'Claude has strong security protections that prevent our tool from working. Try a different AI platform.',
  'perplexity': 'Perplexity blocks automated access. Try a different AI platform.',
  'kimi': 'Kimi has security restrictions that prevent extraction. Try a different AI platform.',
  'gemini': 'Google Gemini blocks our extraction method. Try a different AI platform.',
  'notebooklm': 'Google NotebookLM requires authentication. Try a different AI platform.',
  'huggingchat': 'HuggingChat requires authentication to access saved chats. Try a different AI platform.',
  'deepseek': 'DeepSeek has protection against automated access. Try a different AI platform.',
  'mistral': 'Mistral has protection against automated access. Try a different AI platform.',
};

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
  if (url.includes('notebook.google'))     return 'notebooklm';
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
  if (url.includes('grok.webui.pro'))      return 'grok';
  return 'generic';
}

// Platforms that NEED Puppeteer (JavaScript-rendered pages)
const NEEDS_PUPPETEER = [
  'grok', 'copilot', 'characterai', 'pi'
];
 
// ── STRATEGY 1: Extract via cheerio (raw HTML) ────────────────
function extractWithCheerio($, platform) {
  const turns = [];

  if (platform === 'chatgpt') {
    // ChatGPT uses data-message-author-role
    $('[data-message-author-role]').each((i, el) => {
      const role = $(el).attr('data-message-author-role');
      const text = $(el).text().trim();
      if (text && text.length > 3) {
        turns.push({ 
          speaker: role === 'user' ? 'You' : 'ChatGPT', 
          text,
          role: role === 'user' ? 'user' : 'assistant'
        });
      }
    });
    if (turns.length) return { turns, platform: 'ChatGPT' };

    // Fallback for different ChatGPT versions
    $('[class*="prose"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 50) {
        turns.push({ 
          speaker: i % 2 === 0 ? 'You' : 'ChatGPT', 
          text,
          role: i % 2 === 0 ? 'user' : 'assistant'
        });
      }
    });
    if (turns.length >= 2) return { turns, platform: 'ChatGPT' };
  }

  if (platform === 'poe') {
    // Poe.com message structure
    $('[data-testid*="message"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10) {
        turns.push({ 
          speaker: i % 2 === 0 ? 'You' : 'Bot', 
          text,
          role: i % 2 === 0 ? 'user' : 'assistant'
        });
      }
    });
    if (turns.length) return { turns, platform: 'Poe' };
  }

  if (platform === 'phind') {
    // Phind message structure
    $('[class*="message"], [class*="Message"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 20) {
        turns.push({ 
          speaker: i % 2 === 0 ? 'You' : 'Phind', 
          text,
          role: i % 2 === 0 ? 'user' : 'assistant'
        });
      }
    });
    if (turns.length) return { turns, platform: 'Phind' };
  }

  if (platform === 'you') {
    // You.com (formerly YouChat)
    $('[data-testid*="message"], [class*="message"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 15) {
        turns.push({ 
          speaker: i % 2 === 0 ? 'You' : 'YouChat', 
          text,
          role: i % 2 === 0 ? 'user' : 'assistant'
        });
      }
    });
    if (turns.length) return { turns, platform: 'You.com' };
  }

  if (platform === 'grok') {
    // Grok message structure
    $('[class*="message-bubble"], [class*="MessageBubble"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 10) {
        turns.push({ 
          speaker: i % 2 === 0 ? 'You' : 'Grok', 
          text,
          role: i % 2 === 0 ? 'user' : 'assistant'
        });
      }
    });
    if (turns.length) return { turns, platform: 'Grok' };
  }

  // Generic fallback for unknown platforms
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
        if (text.length > 30) {
          turns.push({ 
            speaker: i % 2 === 0 ? 'User' : 'Assistant', 
            text,
            role: i % 2 === 0 ? 'user' : 'assistant'
          });
        }
      });
      if (turns.length >= 2) return { turns, platform: 'Generic AI' };
      turns.length = 0;
    }
  }

  // Last resort: full page text
  $('nav, footer, header, aside, script, style').remove();
  const mainEl = $('main, [role="main"], article').first();
  const fullText = (mainEl.length ? mainEl : $('body')).text().trim();
  if (fullText.length > 100) {
    return {
      turns: [{ speaker: 'Chat', text: fullText, role: 'assistant' }],
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
          .map(({ speaker, el, role }) => ({ 
            speaker, 
            text: el.innerText.trim(),
            role
          }))
          .filter(t => t.text.length > 0);
      }

      // ── Grok ───────────────────────────────────────────
      if (plat === 'grok') {
        const msgs = trySelectors([
          '[class*="message-bubble"]', '[class*="MessageBubble"]',
          '[data-testid*="message"]',
        ]);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Grok',
              text: el.innerText.trim(),
              role: i % 2 === 0 ? 'user' : 'assistant'
            })).filter(t => t.text.length > 0),
            platform: 'Grok'
          };
        }
      }

      // ── Copilot ────────────────────────────────────────
      if (plat === 'copilot') {
        const msgs = trySelectors([
          '[data-testid="user-message"]', '[data-testid="bot-message"]',
          '[class*="message"]',
        ]);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Copilot',
              text: el.innerText.trim(),
              role: i % 2 === 0 ? 'user' : 'assistant'
            })).filter(t => t.text.length > 0),
            platform: 'Copilot'
          };
        }
      }

      // ── Character.ai ───────────────────────────────────
      if (plat === 'characterai') {
        const msgs = trySelectors(['[class*="message"]', '[class*="MessageItem"]']);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Character',
              text: el.innerText.trim(),
              role: i % 2 === 0 ? 'user' : 'assistant'
            })).filter(t => t.text.length > 10),
            platform: 'Character.AI'
          };
        }
      }

      // ── Pi.ai ──────────────────────────────────────────
      if (plat === 'pi') {
        const msgs = trySelectors(['[class*="message"]', '[class*="chat"]']);
        if (msgs.length) {
          return {
            turns: msgs.map((el, i) => ({
              speaker: i % 2 === 0 ? 'You' : 'Pi',
              text: el.innerText.trim(),
              role: i % 2 === 0 ? 'user' : 'assistant'
            })).filter(t => t.text.length > 10),
            platform: 'Pi'
          };
        }
      }

      // ── Generic browser fallback ────────────────────────
      const genericSelectors = [
        '[class*="message"]', '[class*="Message"]',
        '[class*="chat"]', '[class*="turn"]',
        '[class*="bubble"]', '[role="listitem"]',
      ];
      for (const sel of genericSelectors) {
        const els = document.querySelectorAll(sel);
        if (els.length >= 2 && els.length <= 150) {
          const turns = Array.from(els)
            .map((el, i) => ({ 
              speaker: i % 2 === 0 ? 'User' : 'Assistant', 
              text: el.innerText.trim(),
              role: i % 2 === 0 ? 'user' : 'assistant'
            }))
            .filter(t => t.text.length > 30);
          if (turns.length >= 2) return { turns, platform: 'Unknown AI' };
        }
      }

      // Last resort: full page text
      const body = document.body.innerText.trim();
      if (body.length > 100) {
        return {
          turns: [{ speaker: 'Chat', text: body, role: 'assistant' }],
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
    return res.status(400).json({ 
      success: false,
      error: 'Please provide a URL.' 
    });
  }

  const trimmedURL = url.trim();

  if (!isSafeURL(trimmedURL)) {
    return res.status(400).json({ 
      success: false,
      error: 'Please provide a valid public https:// URL.' 
    });
  }

  const platform = detectPlatform(trimmedURL);
  console.log(`[ChatExport] Platform: ${platform} | URL: ${trimmedURL}`);

  // Check if platform is blocked
  if (BLOCKED_PLATFORMS.includes(platform)) {
    console.warn(`[ChatExport] Platform ${platform} is blocked by bot protection`);
    return res.status(403).json({
      success: false,
      error: BLOCKED_MESSAGES[platform] || `${platform} is not supported. Try a different AI platform.`
    });
  }

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
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        console.warn(`[ChatExport] Cheerio fetch got HTTP ${response.status} for ${trimmedURL} — trying Puppeteer`);
        chatData = await extractWithPuppeteer(trimmedURL, platform);
      } else {
        const html = await response.text();
        const $    = cheerio.load(html);
        chatData   = extractWithCheerio($, platform);

        // If cheerio got nothing useful, fall back to Puppeteer
        if (!chatData.turns || chatData.turns.length === 0) {
          console.log(`[ChatExport] Cheerio got nothing, trying Puppeteer`);
          chatData = await extractWithPuppeteer(trimmedURL, platform);
        }
      }
    }

    if (!chatData.turns || chatData.turns.length === 0) {
      return res.status(422).json({
        success: false,
        error:
          'No chat content found on this page. ' +
          'The link may require login, be expired, or the page structure is unusual. ' +
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
        .map(t => {
          // Use standardised role labels (ASSISTANT / USER) — NOT the speaker
          // name — so that if the user edits the textarea and we fall back to
          // parseChatTurns(), the regex can still identify who said what.
          // Using the speaker name (e.g. "CHATGPT:", "YOU:") would work too,
          // but would fail for any platform whose name isn't in speakerRegex.
          const roleLabel = (t.role === 'user' || t.role === 'human') ? 'USER' : 'ASSISTANT';
          return `${roleLabel}:\n${t.text}`;
        })
        .join('\n\n')
    });

  } catch (err) {
    console.error('[ChatExport] Full error:', err);
    let userMessage = 'Sorry, our services are currently not available right now. Try again later.';
    if (err.message.includes('timeout')) {
      userMessage = 'The page took too long to load. Try again or paste manually.';
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      userMessage = 'Could not reach that URL. Check the link and try again.';
    } else if (err.message.includes('ERR_BLOCKED_BY_CLIENT')) {
      userMessage = 'That site blocks our access. Try pasting the chat manually.';
    }
    res.status(500).json({ 
      success: false,
      error: userMessage,
      serverError: err.message
    });
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
  ╠══════════════════════════════════════════════╣
  ║  SUPPORTED: ChatGPT, Poe, Phind, Grok,       ║
  ║             Copilot, Character.ai, Pi, You   ║
  ║  BLOCKED:   Claude, Perplexity, Kimi,        ║
  ║             Gemini, HuggingChat, Mistral     ║
  ╚══════════════════════════════════════════════╝
  Press Ctrl+C to stop.
  `);
});