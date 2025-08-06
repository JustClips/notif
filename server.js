const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let connectedClients = 0;

wss.on('connection', function connection(ws) {
  connectedClients++;
  broadcastCount();

  ws.on('close', function() {
    connectedClients--;
    broadcastCount();
  });
});

function broadcastCount() {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ connected: connectedClients }));
    }
  });
}

// HTML page for browser
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Connected Roblox Server Hopper Users:</h1>
        <div id="count">?</div>
        <script>
          const ws = new WebSocket("wss://" + location.host);
          ws.onmessage = function(ev) {
            const data = JSON.parse(ev.data);
            document.getElementById('count').innerText = data.connected;
          }
        </script>
      </body>
    </html>
  `);
});

// Active sessions endpoint
app.get('/active', (req, res) => {
  res.json({ active: connectedClients });
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
