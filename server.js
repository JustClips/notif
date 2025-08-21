const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// --- STATE VARIABLES ---
let connectedClients = 0;
let activeBeacons = new Map();
let latestBrainrots = [];
let currentJobId = null; // <-- NEW: Variable to hold the job ID

// --- WebSocket tracking ---
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

// --- NEW: JOB HANDLING ENDPOINTS ---

// POST /job: The Python bot calls this to submit a new job
app.post('/job', (req, res) => {
  const { jobId } = req.body;
  if (!jobId) {
    return res.status(400).json({ error: 'Missing jobId field' });
  }
  currentJobId = jobId;
  console.log(`[Job] New job received and stored: ${jobId.substring(0, 20)}...`);
  res.json({ ok: true, message: 'Job submitted successfully.' });
});

// GET /job: The Roblox Lua script calls this to get the current job
app.get('/job', (req, res) => {
  if (currentJobId) {
    const jobToProcess = currentJobId;
    console.log(`[Job] Job delivered to a client: ${jobToProcess.substring(0, 20)}...`);
    currentJobId = null; // Clear the job immediately after delivering it
    res.json({ jobId: jobToProcess });
  } else {
    // No job available
    res.json({ jobId: null });
  }
});


// --- Your existing endpoints (unchanged) ---

app.post('/brainrot', (req, res) => {
  const brainrot = req.body;
  if (!brainrot.name || !brainrot.dps || !brainrot.rarity) {
    return res.status(400).json({ error: 'Missing fields (need name, dps, rarity)' });
  }
  latestBrainrots.unshift(brainrot);
  if (latestBrainrots.length > 100) latestBrainrots.pop();
  res.json({ ok: true });
});

app.get('/brainrot', (req, res) => {
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

setInterval(() => {
  const now = Date.now();
  for (const [userId, lastSeen] of activeBeacons) {
    if (now - lastSeen > 60000) {
      activeBeacons.delete(userId);
    }
  }
}, 15000);

app.get('/active', (req, res) => {
  res.json({
    active: connectedClients + activeBeacons.size,
    websocket: connectedClients,
    beacon: activeBeacons.size
  });
});

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
