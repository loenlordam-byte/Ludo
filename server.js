const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(__dirname, 'ludo.html')).pipe(res);
});

const rooms = new Map();
const bc = (r, m, except) => {
  const s = JSON.stringify(m);
  for (const c of r.clients) if (c !== except && c.readyState === 1) c.send(s);
};

const wss = new WebSocketServer({ server, maxPayload: 100 * 1024 });
wss.on('connection', (ws, req) => {
  const room = (new URL(req.url, 'http://x').searchParams.get('room') || 'public').slice(0, 64);
  let r = rooms.get(room);
  if (!r) rooms.set(room, (r = { clients: new Set(), state: null }));
  r.clients.add(ws);
  ws.send(JSON.stringify(r.state ? { t: 'state', s: r.state } : { t: 'empty' }));
  bc(r, { t: 'peers', n: r.clients.size });

  ws.on('message', (d) => {
    let m;
    try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'state' && m.s && Array.isArray(m.s.seats)) {
      r.state = m.s;
      bc(r, m, ws);
    } else if (m.t === 'seat' && r.state && r.state.phase === 'lobby') {
      const cur = r.state.seats[m.ci];
      if (cur && m.seat && (cur.type === 'empty' || m.seat.
