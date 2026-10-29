# NeonForge — Document Converter

A polished HTML/CSS/JavaScript frontend with a small Node.js backend.

## What is included

- Drag/drop and file-picker upload.
- File-type detection by extension and MIME type.
- Output-format buttons generated from a conversion map.
- Raw conversion vs. AI formatting mode.
- Neon dark theme and alternate light theme.
- File-type cards for TXT, Markdown, Word, PDF, spreadsheets, presentations, data, and e-books.
- Downloadable results.
- Server-side conversion through LibreOffice and Pandoc when installed.
- Optional OpenAI formatting endpoint. API keys stay in `.env`, never in browser code.

## Important reality check

No single converter can reliably convert every listed format to every other format. Some formats are proprietary, binary, encrypted, unsupported, or need specialized software. Conversion can also lose features: CSV does not retain workbook formatting or multiple sheets; PDF-to-Word can change layout; and an extension rename is not a conversion.

This starter project supports a practical subset directly and uses LibreOffice/Pandoc for additional formats when those programs are installed. The UI filters the target list based on known conversion routes rather than promising impossible conversions. Legacy/proprietary formats such as `.pages`, `.key`, `.pub`, `.mpp`, Kindle DRM files, and many camera RAW formats are not guaranteed.

## Requirements

- Node.js 18+
- Optional but recommended:
  - LibreOffice (`soffice`) for DOCX/ODT/RTF/XLSX/ODS/PPTX/ODP/PDF conversions.
  - Pandoc for Markdown, HTML, DOCX, EPUB, RST, AsciiDoc and related text-oriented formats.
- An OpenAI API key for AI formatting mode. API use is billed separately from ChatGPT subscriptions.

## Run it

1. Extract the ZIP.
2. Open a terminal in this folder.
3. Install packages:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and add your API key if you want AI formatting.
5. Start the server:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000`.

Do not open `public/index.html` directly with `file://`; the frontend calls the local backend.

## AI formatting mode

AI formatting sends extracted text to the OpenAI API for cleanup and structure. The server does not send every original binary file directly to the model. For supported text-based content, it asks the model to preserve meaning and return only the formatted content. The result is then packaged into the selected output format where supported. It is not a substitute for faithful layout conversion of complex Word/PDF/spreadsheet/presentation files.

Avoid uploading confidential documents unless you understand your provider and API data settings. Add authentication, rate limits, file-size limits, and secure deployment practices before making this public.

## Supported starter conversion routes

- Text-like: TXT, MD, HTML, JSON, XML, YAML, CSV, TSV, SQL, TOML, INI, RST, ADOC, ORG
- Word/office: DOCX, DOC, ODT, RTF, XLSX, XLS, ODS, PPTX, PPT, ODP
- PDF: TXT extraction and LibreOffice/Pandoc-supported routes when the tools are installed
- EPUB: Pandoc-supported routes when installed
- PNG/JPG output from PDF or slides depends on local tools and is not enabled as a universal route
- Other extensions may be recognized for display but will be marked unsupported until a real converter is added

## Security notes

- Never commit `.env`.
- The server uses a temporary upload directory and removes files after a request.
- For public hosting, add authentication, per-user quotas, rate limiting, virus scanning, and robust sandboxing of external converter processes.
