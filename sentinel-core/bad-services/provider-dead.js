const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Provider is currently unavailable' }));
});
server.listen(9503, () => console.log('Provider-dead on 9503'));