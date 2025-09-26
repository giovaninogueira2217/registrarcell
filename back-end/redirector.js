import http from 'http';

const PORT = process.env.REDIRECT_PORT || 5173;
const TARGET = (process.env.REDIRECT_TARGET || 'https://dhiones.ipsolutiontelecom.com.br/celulares').replace(/\/$/, '');

http.createServer((req, res) => {
  const suffix = req.url === '/' ? '/' : req.url; 
  res.writeHead(301, { Location: TARGET + suffix });
  res.end();
}).listen(PORT, '0.0.0.0', () => {
  console.log(`↪ redirector ouvindo em http://0.0.0.0:${PORT} => ${TARGET}/...`);
});