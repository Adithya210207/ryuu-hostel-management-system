const http = require('node:http');
const net = require('node:net');
const {randomBytes, timingSafeEqual} = require('node:crypto');
const COOKIE = '__Host-ryuu_preview';
// Browser/WebAPK installation fetches these public assets without portal cookies.
// Exact file paths only: account pages, APIs, uploads and other resources stay gated.
const INSTALL_FILES = new Set(['/manifest.webmanifest', '/sw.js', '/offline.html', '/favicon.png',
  '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/maskable-512.png', '/pwa/apple-touch-icon.png', '/pwa/badge.png']);
const equals = (a, b) => typeof a === 'string' && /^[A-Za-z0-9_-]{43}$/.test(a) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Private demo access, independent of the hostel's own account/session system.
// The secret is in the URL fragment (not request URLs, server logs or referrers).
function createPreviewGate({upstreamPort = 4174} = {}) {
  const key = randomBytes(32).toString('base64url');
  const session = randomBytes(32).toString('base64url');
  let origin;
  const valid = req => (req.headers.cookie || '').split(';').some(item => {
    const [name, value] = item.trim().split('=');
    return name === COOKIE && equals(value, session);
  });
  const secureHeaders = {'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY'};
  const server = http.createServer(async (req, res) => {
    if (!origin) {res.writeHead(503, secureHeaders); return res.end('Preview is starting. Please try again shortly.');}
    if (req.url === '/__preview/access' && req.method === 'POST') {
      if (req.headers.origin !== origin) {res.writeHead(403, secureHeaders); return res.end('Access denied.');}
      let body = '';
      try {for await (const chunk of req) {body += chunk; if (body.length > 1024) {res.writeHead(413, secureHeaders); return res.end();}}} catch {return res.destroy();}
      let supplied; try {supplied = JSON.parse(body).key;} catch {}
      if (!equals(supplied, key)) {res.writeHead(403, secureHeaders); return res.end('Open the complete private link from the launcher.');}
      res.writeHead(204, {...secureHeaders, 'Set-Cookie':`${COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`});
      return res.end();
    }
    const installFile = ['GET', 'HEAD'].includes(req.method) && INSTALL_FILES.has(req.url.split('?')[0]);
    if (!valid(req) && !installFile) {
      if (req.method !== 'GET' || !(req.headers.accept || '').includes('text/html')) {res.writeHead(401, secureHeaders); return res.end('Private preview. Open the complete access link.');}
      const nonce = randomBytes(16).toString('base64');
      res.writeHead(200, {...secureHeaders, 'Content-Type':'text/html; charset=utf-8',
        'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`});
      return res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ryuu private preview</title><style>body{background:#f5f2e9;color:#24251f;font:18px system-ui;display:grid;place-content:center;min-height:90vh;padding:24px}main{max-width:460px}h1{font-size:40px}p{line-height:1.6}</style><main><h1>Ryuu</h1><p id="status">This is a private test website. Open the complete private link from your launcher to enter.</p></main><script nonce="${nonce}">
      const key = new URLSearchParams(location.hash.slice(1)).get('preview');
      if(key){
        history.replaceState(null,'',location.pathname + location.search);
        document.getElementById('status').textContent='Opening your private preview…';
        fetch('/__preview/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})})
          .then(r=>{if(!r.ok)throw Error();location.reload();})
          .catch(()=>{document.getElementById('status').textContent='This private link is no longer valid. Use the latest complete link from the launcher.';});
      }
      </script></html>`);
    }
    const headers = {...req.headers, host:new URL(origin).host, 'x-forwarded-proto':'https'};
    headers.cookie = (req.headers.cookie || '').split(';').filter(item => !item.trim().startsWith(COOKIE+'=')).join(';');
    const upstream = http.request({hostname:'127.0.0.1', port:upstreamPort, method:req.method, path:req.url, headers}, response => {
      res.writeHead(response.statusCode, {...response.headers, 'Cache-Control':'no-store'});
      response.pipe(res);
    });
    upstream.on('error', () => {if(!res.headersSent)res.writeHead(502, secureHeaders); res.end('The website is starting. Refresh shortly.');});
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  // Keep development animation updates working, without exposing unauthenticated WS.
  server.on('upgrade', (req, socket, head) => {
    if (!origin || !valid(req) || req.headers.origin !== origin) return socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    const upstream = net.connect(upstreamPort, '127.0.0.1', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for(let i=0; i<req.rawHeaders.length; i+=2) {
        if(req.rawHeaders[i].toLowerCase() === 'cookie') {
          const cookies = req.rawHeaders[i+1].split(';').filter(item=>!item.trim().startsWith(COOKIE+'=')).join(';');
          if(cookies) lines.push(`Cookie: ${cookies}`);
        } else lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i+1]}`);
      }
      upstream.write(lines.join('\r\n')+'\r\n\r\n');
      if(head.length)upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error',()=>socket.destroy()); socket.on('error',()=>upstream.destroy());
    socket.on('close',()=>upstream.destroy()); upstream.on('close',()=>socket.destroy());
  });
  return {server, setOrigin(value) {origin = new URL(value).origin;}, accessLink(value) {return value+'/#preview='+key;}};
}
module.exports = {createPreviewGate};
