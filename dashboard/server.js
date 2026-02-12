import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const serverStart = Date.now();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json({ limit: "1mb" }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const MAX_HISTORY = 500;
const histograms = new Map();
const events = new Map();

function ensureHistogram(key) {
  if (!histograms.has(key)) {
    histograms.set(key, []);
  }
  return histograms.get(key);
}

function updateHistogram(key, value) {
  const hist = ensureHistogram(key);
  hist.push(value);
  if (hist.length > MAX_HISTORY) {
    hist.shift();
  }
}

function toPercentile(key, value) {
  const hist = ensureHistogram(key);
  if (hist.length === 0) {
    return 50;
  }
  const sorted = [...hist].sort((a, b) => a - b);
  let idx = 0;
  while (idx < sorted.length && sorted[idx] <= value) {
    idx += 1;
  }
  const pct = Math.round((idx / sorted.length) * 100);
  return Math.max(0, Math.min(100, pct));
}

function isOutlier(percentile, threshold = 90) {
  return percentile >= threshold;
}

function broadcastPoint(point) {
  const message = JSON.stringify({ type: "point", data: point });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

function processPayload(payload, options = {}) {
  const shouldBroadcast = options.broadcast !== false;
  events.set(payload.eventId, payload);

  const metrics = payload.metrics || {};
  const ts = payload.endTime || Date.now();
  const percentiles = payload.percentiles || {};

  const durationValue = typeof metrics.durationMs === "number" ? metrics.durationMs : null;
  let durationPercentile = null;
  const outlierReasons = [];
  let severity = "normal";

  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value !== "number") {
      continue;
    }
    updateHistogram(key, value);
    const percentile = toPercentile(key, value);
    percentiles[key] = percentile;
    if (key === "durationMs") {
      durationPercentile = percentile;
    }
  }

  payload.percentiles = percentiles;

  if (durationPercentile !== null) {
    if (durationPercentile >= 99) {
      outlierReasons.push("latency_p99");
      severity = "critical";
    } else if (durationPercentile >= 95) {
      outlierReasons.push("latency_p95");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  const errorCount = typeof metrics.errorCount === "number" ? metrics.errorCount : 0;
  if (errorCount >= 1) {
    outlierReasons.push("error_count_critical");
    severity = "critical";
  }

  const cpuPct = typeof metrics.cpuPct === "number" ? metrics.cpuPct : null;
  const cpuPercentile = typeof percentiles.cpuPct === "number" ? percentiles.cpuPct : null;
  if (cpuPct !== null && cpuPercentile !== null) {
    if (cpuPercentile >= 99) {
      outlierReasons.push("cpu_p99");
      severity = "critical";
    } else if (cpuPercentile >= 95) {
      outlierReasons.push("cpu_p95");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  const memMb = typeof metrics.memMb === "number" ? metrics.memMb : null;
  const memPercentile = typeof percentiles.memMb === "number" ? percentiles.memMb : null;
  if (memMb !== null && memPercentile !== null) {
    if (memPercentile >= 99) {
      outlierReasons.push("mem_p99");
      severity = "critical";
    } else if (memPercentile >= 95) {
      outlierReasons.push("mem_p95");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  const reqCount = typeof metrics.requestCount === "number" ? metrics.requestCount : null;
  const reqPercentile = typeof percentiles.requestCount === "number" ? percentiles.requestCount : null;
  if (reqCount !== null && reqPercentile !== null) {
    if (reqPercentile >= 99) {
      outlierReasons.push("req_p99");
      if (severity === "normal") {
        severity = "warning";
      }
    }
  }

  payload.outlierReasons = outlierReasons;
  payload.severity = severity;

  if (durationValue !== null && shouldBroadcast) {
    const point = {
      eventId: payload.eventId,
      name: payload.name || "event",
      metricKey: "durationMs",
      value: durationValue,
      percentile: durationPercentile ?? 50,
      ts,
      outlier: outlierReasons.length > 0,
      outlierReasons,
      severity
    };
    broadcastPoint(point);
  }
}

function buildSamplePayload(now, index, source) {
  return {
    eventId: `${source}-${now}-${index}-${Math.floor(Math.random() * 10000)}`,
    name: "sample_http",
    startTime: now - Math.floor(Math.random() * 60000),
    endTime: now,
    metrics: {
      durationMs: 50 + Math.random() * 1950,
      requestCount: Math.floor(1 + Math.random() * 20),
      errorCount: Math.floor(Math.random() * 20) === 0 ? 1 : 0,
      apdex: Math.max(0, Math.min(1, 0.6 + Math.random() * 0.4)),
      cpuPct: 5 + Math.random() * 90,
      memMb: 100 + Math.random() * 900
    },
    trace: [
      { name: "handler", value: Math.random() * 50 },
      { name: "db.query", value: Math.random() * 120 }
    ],
    tags: { source }
  };
}

function warmUpHistograms(count = 500) {
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    const payload = buildSamplePayload(now, i, "warmup");
    processPayload(payload, { broadcast: false });
  }
}

app.post("/ingest", (req, res) => {
  const payload = req.body;
  if (!payload || !payload.eventId) {
    res.status(400).json({ ok: false, error: "invalid payload" });
    return;
  }

  processPayload(payload);

  res.json({ ok: true });
});

app.get("/ingest", (_req, res) => {
  res.status(200).json({ ok: true, message: "Use POST /ingest with JSON payload." });
});

app.get("/event/:id", (req, res) => {
  const event = events.get(req.params.id);
  if (!event) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }
  res.json({ ok: true, data: event });
});

app.post("/sample", (req, res) => {
  const count = Math.min(Number(req.query.count) || 20, 200);
  const now = Date.now();
  for (let i = 0; i < count; i += 1) {
    const payload = buildSamplePayload(now, i, "sample");
    processPayload(payload, { broadcast: true });
  }
  res.json({ ok: true, count });
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", data: { status: "connected", serverStart } }));
});

server.listen(3000, () => {
  warmUpHistograms(500);
  console.log("Dashboard server listening on http://localhost:3000");
});
