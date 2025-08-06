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

app.post('/beacon', (req, res) => {
  const { userId } = req.body;
  if (userId) {
    activeBeacons.set(userId, Date.now());
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Missing userId' });
  }
});

// --- Receive Brainrot ESP info from Lua client ---
app.post('/brainrot', (req, res) => {
  // Expected fields: name, rarity, dps, trait, boost, position, distance, time, [userId]
  const brainrot = req.body;
  // Optional: validate minimal required fields
  if (!brainrot.name || !brainrot.rarity || !brainrot.position) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  // Store up to 100 recent brainrots
  latestBrainrots.unshift(brainrot);
  if (latestBrainrots.length > 100) latestBrainrots.pop();

  res.json({ ok: true });
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
            fetch('/latest-brainrots').then(r=>r.json()).then(js=>{
              document.getElementById('brainrots').innerText =
                js.map(b=>
                  b.name + ' | ' + b.rarity + ' | ' + b.dps + ' | ' +
                  (typeof b.trait === "undefined" ? "" : b.trait + ' | ')
                  + (typeof b.boost === "undefined" ? "" : b.boost + 'x | ')
                  + 'Dist:' + (b.distance ? b.distance.toFixed(1) : "?")
                ).join("\\n");
            });
          }
          setInterval(pollBrainrots, 5000);
          pollBrainrots();
        </script>
      </body>
    </html>
  `);
});

// --- Endpoint to get latest brainrots for display ---
app.get('/latest-brainrots', (req, res) => {
  res.json(latestBrainrots.slice(0, 25)); // show up to 25 recent
});

server.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
