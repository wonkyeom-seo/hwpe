const fileInput = document.getElementById('fileInput');
const openBtn = document.getElementById('openBtn');
const viewer = document.getElementById('viewer');
const meta = document.getElementById('meta');
const saveHtml = document.getElementById('saveHtml');
const saveTxt = document.getElementById('saveTxt');
const zoomIn = document.getElementById('zoomIn');
const zoomOut = document.getElementById('zoomOut');
const zoomLabel = document.getElementById('zoomLabel');

let currentName = '문서';
let currentScale = 1;

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function openDocument() {
  const file = fileInput.files?.[0];
  if (!file) {
    alert('파일을 먼저 선택해 주세요.');
    return;
  }

  const fd = new FormData();
  fd.append('file', file);

  meta.textContent = '로딩 중...';
  openBtn.disabled = true;

  try {
    const res = await fetch('/api/view', { method: 'POST', body: fd });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '열기에 실패했습니다.');

    currentName = json.fileName.replace(/\.[^.]+$/, '');
    viewer.innerHTML = json.html;
    meta.textContent = `파일: ${json.fileName} | 형식: ${json.format.toUpperCase()} | 섹션: ${json.sectionCount}`;
  } catch (err) {
    meta.textContent = `오류: ${err.message}`;
    alert(err.message);
  } finally {
    openBtn.disabled = false;
  }
}

openBtn.addEventListener('click', openDocument);
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) {
    meta.textContent = `선택됨: ${fileInput.files[0].name}`;
  }
});

saveHtml.addEventListener('click', () => {
  const html = `<!doctype html><html><meta charset="utf-8"><body>${viewer.innerHTML}</body></html>`;
  download(html, `${currentName}.html`, 'text/html;charset=utf-8');
});

saveTxt.addEventListener('click', () => {
  download(viewer.innerText, `${currentName}.txt`, 'text/plain;charset=utf-8');
});

zoomIn.addEventListener('click', () => {
  currentScale = Math.min(2, currentScale + 0.1);
  viewer.style.transform = `scale(${currentScale})`;
  viewer.style.transformOrigin = 'top left';
  zoomLabel.textContent = `배율 ${Math.round(currentScale * 100)}%`;
});

zoomOut.addEventListener('click', () => {
  currentScale = Math.max(0.6, currentScale - 0.1);
  viewer.style.transform = `scale(${currentScale})`;
  viewer.style.transformOrigin = 'top left';
  zoomLabel.textContent = `배율 ${Math.round(currentScale * 100)}%`;
});

document.getElementById('findBtn').addEventListener('click', () => {
  const q = document.getElementById('findText').value.trim();
  if (!q) return;
  if (!window.find(q)) alert('일치하는 단어가 없습니다.');
});

document.getElementById('replaceBtn').addEventListener('click', () => {
  const from = document.getElementById('findText').value;
  const to = document.getElementById('replaceText').value;
  if (!from) return;
  viewer.innerHTML = viewer.innerHTML.split(from).join(to);
});
