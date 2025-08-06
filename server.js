const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

let connectedClients = 0;

// WebSocket tracking for browser-based connections
wss.on('connection', function connection(ws) {
  connectedClients++;
  broadcastCount();

  ws.on('close', function() {
    connectedClients--;
    broadcastCount();
  });
});

// Broadcast to WebSocket clients
function broadcastCount() {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ connected: connectedClients }));
    }
  });
}

// --- Beacon tracking for Roblox Lua clients ---
let activeBeacons = new Map(); // key: userId, value: last seen timestamp (ms)

app.post('/beacon', (req, res) => {
  const { userId } = req.body;
  if (userId) {
    activeBeacons.set(userId, Date.now());
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Missing userId' });
  }
});

// Clean out beacons older than 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [userId, lastSeen] of activeBeacons) {
    if (now - lastSeen > 60000) {
      activeBeacons.delete(userId);
    }
  }
}, 15000);

// --- Active sessions endpoint ---
app.get('/active', (req, res) => {
  // Active means: browser WebSocket connections + Roblox clients with recent beacon
  res.json({
    active: connectedClients + activeBeacons.size,
    websocket: connectedClients,
    beacon: activeBeacons.size
  });
});

// --- HTML homepage for browser ---
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

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
