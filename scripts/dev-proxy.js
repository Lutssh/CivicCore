const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const BASE_DIR = path.join(__dirname, '..', 'frontends');

const routes = {
  'civil-registry.civiccore.demo': 'civil-registry/dist',
  'education.civiccore.demo': 'education/dist',
  'revenue.civiccore.demo': 'revenue/dist',
  'labour.civiccore.demo': 'labour/dist',
  'citizen.civiccore.demo': 'citizen/dist',
  'verify.civiccore.demo': 'verify/dist',
  'admin.civiccore.demo': 'admin/dist',
};

const server = http.createServer((req, res) => {
  const host = req.headers.host.split(':')[0];
  
  if (host === 'api.civiccore.demo' || req.url.startsWith('/api')) {
    // Proxy to backend
    const proxyReq = http.request({
      host: 'localhost',
      port: 3000,
      path: req.url.startsWith('/api') ? req.url : req.url, // Keep it as is
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    req.pipe(proxyReq);
    return;
  }

  const projectDir = routes[host];
  if (!projectDir) {
    res.writeHead(404);
    res.end('Host not found');
    return;
  }

  let filePath = path.join(BASE_DIR, projectDir, req.url === '/' ? 'index.html' : req.url);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(BASE_DIR, projectDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.svg': 'image/svg+xml',
  };

  res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`CivicCore Proxy Server running on port ${PORT}`);
});
