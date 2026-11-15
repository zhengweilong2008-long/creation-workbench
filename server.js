// 创作工作台 — 零依赖 Node.js 服务（视频 + 生图，二合一）
// 数据存在两个 JSON 文件里（video.json / image.json），只做记录与跟踪：
// 不跑任何生成、不登 Google/Colab、不走任何隧道/代理/VPN，不碰任何密钥。
// 图在 Colab 里生，视频走 Kaggle / Agnes 队列；成图成片只记链接。
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const VIDEO_FILE = process.env.VIDEO_DATA_FILE || path.join(__dirname, 'video.json');
const IMAGE_FILE = process.env.IMAGE_DATA_FILE || path.join(__dirname, 'image.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 2 * 1024 * 1024; // 2MB

const FILES = {
  video: VIDEO_FILE,
  image: IMAGE_FILE,
};

function readState(section) {
  try {
    return JSON.parse(fs.readFileSync(FILES[section], 'utf8'));
  } catch (e) {
    return { projects: [] };
  }
}

function writeState(section, state) {
  // 原子写：先写临时文件再改名，避免写一半损坏
  const file = FILES[section];
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function handleState(req, res, section) {
  if (req.method === 'GET') {
    return sendJson(res, 200, readState(section));
  }
  // POST
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { res.writeHead(413); res.end('Body too large'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try {
      const state = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!state || !Array.isArray(state.projects)) {
        return sendJson(res, 400, { ok: false, error: 'state.projects 必须是数组' });
      }
      writeState(section, state);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: 'JSON 解析失败: ' + e.message });
    }
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/') {
    return serveFile(res, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }
  if (pathname === '/api/video/state') return handleState(req, res, 'video');
  if (pathname === '/api/image/state') return handleState(req, res, 'image');
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`创作工作台已启动: http://${HOST}:${PORT} (视频 ${VIDEO_FILE} / 生图 ${IMAGE_FILE})`);
});
