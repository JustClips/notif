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

// --- Brainrot info from Lua ESP script ---
let latestBrainrots = []; // array of most recent brainrot objects (up to 100)

// POST endpoint for reporting brainrots
app.post('/brainrot', (req, res) => {
  // Expected fields: name, dps, rarity (from Lua script)
  const brainrot = req.body;
  if (!brainrot.name || !brainrot.dps || !brainrot.rarity) {
    return res.status(400).json({ error: 'Missing fields (need name, dps, rarity)' });
  }
  latestBrainrots.unshift(brainrot);
  if (latestBrainrots.length > 100) latestBrainrots.pop();
  res.json({ ok: true });
});

// GET endpoint for viewing reported brainrots in browser/curl
app.get('/brainrot', (req, res) => {
  // Only show the key fields requested
  res.json(
    latestBrainrots.slice(0, 25).map(b => ({
      name: b.name,
      dps: b.dps,
      rarity: b.rarity
    }))
  );
});

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
        <h2>Latest Brainrots:</h2>
        <pre id="brainrots"></pre>
        <script>
          const ws = new WebSocket("wss://" + location.host);
          ws.onmessage = function(ev) {
            const data = JSON.parse(ev.data);
            document.getElementById('count').innerText = data.connected;
          }
          // Poll latest brainrots every 5s
          function pollBrainrots() {
            fetch('/brainrot').then(r=>r.json()).then(js=>{
              document.getElementById('brainrots').innerText =
                js.map(b=>b.name + ' | ' + b.dps + ' | ' + b.rarity).join("\\n");
            });
          }
          setInterval(pollBrainrots, 5000);
          pollBrainrots();
        </script>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
