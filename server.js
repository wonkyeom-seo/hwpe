const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = __dirname;

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveFile(res, filePath, type = 'text/html; charset=utf-8') {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'File not found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const match = contentType.match(/boundary=(.+)$/);
    if (!match) {
      reject(new Error('multipart/form-data boundary 누락'));
      return;
    }
    const boundary = `--${match[1]}`;
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const boundaryBuf = Buffer.from(boundary);
      const parts = [];
      let start = body.indexOf(boundaryBuf);
      while (start !== -1) {
        const end = body.indexOf(boundaryBuf, start + boundaryBuf.length);
        if (end === -1) break;
        const part = body.slice(start + boundaryBuf.length + 2, end - 2);
        if (part.length > 0) parts.push(part);
        start = end;
      }

      for (const part of parts) {
        const headEnd = part.indexOf(Buffer.from('\r\n\r\n'));
        if (headEnd === -1) continue;
        const head = part.slice(0, headEnd).toString('utf8');
        const content = part.slice(headEnd + 4);
        const nameMatch = head.match(/name="([^"]+)"/);
        const fileMatch = head.match(/filename="([^"]*)"/);
        if (!nameMatch) continue;
        const fieldName = nameMatch[1];
        if (fieldName !== 'file') continue;
        const fileName = fileMatch ? path.basename(fileMatch[1]) : 'upload.bin';
        resolve({ fileName, data: content });
        return;
      }
      reject(new Error('업로드 파일이 없습니다.'));
    });
    req.on('error', reject);
  });
}

function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeXmlEntities(text) {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function xmlToReadableHtml(xml) {
  const clean = xml.replace(/\r?\n/g, '');
  const paragraphs = clean.match(/<hp:p\b[\s\S]*?<\/hp:p>/g) || [];
  if (!paragraphs.length) {
    const fallbackText = decodeXmlEntities(clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return `<p>${escapeHtml(fallbackText || '(본문 없음)')}</p>`;
  }

  const html = [];
  for (const p of paragraphs) {
    const isList = /<hp:paraPr[^>]*headingType="BULLET"/.test(p);
    const isNumber = /<hp:paraPr[^>]*headingType="NUMBER"/.test(p);
    const hasLineBreak = /<hp:lineBreak\s*\/?\s*>/.test(p);
    const runs = p.match(/<hp:t\b[^>]*>[\s\S]*?<\/hp:t>/g) || [];
    let text = runs
      .map(t => decodeXmlEntities(t.replace(/<[^>]+>/g, '')))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) continue;
    text = escapeHtml(text);
    if (hasLineBreak) text = text.replace(/\\n/g, '<br/>');

    if (isList) html.push(`<li>${text}</li>`);
    else if (isNumber) html.push(`<ol><li>${text}</li></ol>`);
    else html.push(`<p>${text}</p>`);
  }
  return html.join('\n') || '<p>(추출된 본문 없음)</p>';
}

function extractHwpx(tempPath) {
  const list = execFileSync('unzip', ['-Z1', tempPath], { encoding: 'utf8' })
    .split('\n')
    .map(v => v.trim())
    .filter(Boolean);

  const sectionFiles = list
    .filter(name => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/section(\d+)\.xml/i)[1]);
      const bi = Number(b.match(/section(\d+)\.xml/i)[1]);
      return ai - bi;
    });

  if (!sectionFiles.length) {
    throw new Error('HWPX 본문(Contents/section*.xml)을 찾지 못했습니다.');
  }

  const sections = sectionFiles.map(name => {
    const xml = execFileSync('unzip', ['-p', tempPath, name], { encoding: 'utf8', maxBuffer: 40 * 1024 * 1024 });
    return { name, html: xmlToReadableHtml(xml) };
  });

  return {
    format: 'hwpx',
    title: path.basename(tempPath),
    sectionCount: sections.length,
    html: sections
      .map((s, idx) => `<section class="doc-section"><h3>섹션 ${idx + 1} (${escapeHtml(s.name)})</h3>${s.html}</section>`)
      .join('\n')
  };
}

function extractLikelyTextFromHwp(buffer) {
  const result = [];
  let current = '';
  const flush = () => {
    const cleaned = current.trim();
    if (cleaned.length >= 4) result.push(cleaned);
    current = '';
  };

  for (let i = 0; i < buffer.length - 1; i += 2) {
    const code = buffer.readUInt16LE(i);
    const isHangul = code >= 0xac00 && code <= 0xd7a3;
    const isAscii = code >= 0x20 && code <= 0x7e;
    const isCommon = [0x0a, 0x0d, 0x09, 0x3002, 0xff0c, 0x002e, 0x002c, 0x003a].includes(code);

    if (isHangul || isAscii || isCommon) {
      current += String.fromCharCode(code);
    } else {
      flush();
    }
  }
  flush();
  return result.slice(0, 120).join('\n');
}

function extractHwp(tempPath) {
  const buffer = fs.readFileSync(tempPath);
  const magic = buffer.subarray(0, 8).toString('hex').toLowerCase();
  if (magic !== 'd0cf11e0a1b11ae1') {
    throw new Error('유효한 HWP OLE2 시그니처가 아닙니다.');
  }

  const text = extractLikelyTextFromHwp(buffer);
  return {
    format: 'hwp',
    title: path.basename(tempPath),
    sectionCount: 1,
    html: text
      ? `<div class="notice">※ HWP(바이너리) 문서는 고급 레이아웃 100% 재현이 어렵습니다. 추출 가능한 텍스트를 우선 표시합니다.</div><pre>${escapeHtml(text)}</pre>`
      : '<p>텍스트를 추출하지 못했습니다. HWPX로 변환 후 다시 업로드해 주세요.</p>'
  };
}

async function handleView(req, res) {
  let tempPath = null;
  try {
    const { fileName, data } = await parseMultipart(req);
    if (!fileName) throw new Error('파일명이 없습니다.');

    const ext = path.extname(fileName).toLowerCase();
    if (!['.hwp', '.hwpx'].includes(ext)) {
      throw new Error('지원 형식은 .hwp, .hwpx 입니다.');
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hwpv-'));
    tempPath = path.join(tempDir, fileName);
    fs.writeFileSync(tempPath, data);

    const parsed = ext === '.hwpx' ? extractHwpx(tempPath) : extractHwp(tempPath);

    sendJson(res, 200, {
      ok: true,
      fileName,
      ...parsed
    });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err.message });
  } finally {
    if (tempPath) {
      try {
        fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }

  if (req.method === 'GET' && url.pathname === '/app.js') {
    return serveFile(res, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
  }

  if (req.method === 'POST' && url.pathname === '/api/view') {
    return handleView(req, res);
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`HWP Viewer running: http://localhost:${PORT}`);
});
