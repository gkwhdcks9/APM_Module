const chartEl = document.getElementById("chart");
const detailId = document.getElementById("detail-id");
const detailMetrics = document.getElementById("detail-metrics");
const detailTrace = document.getElementById("detail-trace");
const legend = document.getElementById("legend");
const sampleBtn = document.getElementById("sample-btn");

const MAX_POINTS = 400;
const metricColors = new Map();
let serverStart = null;

const metricUnits = {
  durationMs: "ms",
  requestCount: "count",
  errorCount: "count",
  apdex: "score",
  cpuPct: "%",
  memMb: "MB"
};

function formatValue(value, unit) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return `- ${unit || ""}`.trim();
  }
  const fixed = value.toFixed(10);
  return unit ? `${fixed} ${unit}` : fixed;
}

function formatTime(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms)) {
    return "-";
  }
  return new Date(ms).toLocaleString();
}

function formatPercentile(pct) {
  if (typeof pct !== "number" || Number.isNaN(pct)) {
    return "-";
  }
  return `p${pct}`;
}

function renderGroup(title, rows) {
  if (!rows.length) {
    return "";
  }
  const items = rows
    .map((row) => `<div class="kv-row"><span>${row.label}</span><span>${row.value}</span></div>`)
    .join("");
  return `<div class="kv-group"><div class="kv-title">${title}</div>${items}</div>`;
}

function renderOutlierReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return "";
  }
  const badges = reasons
    .map((reason) => `<span class="badge">${reason}</span>`)
    .join("");
  return `<div class="kv-group"><div class="kv-title">Outlier Reasons</div><div class="badge-row">${badges}</div></div>`;
}

function colorFromKey(key) {
  if (metricColors.has(key)) {
    return metricColors.get(key);
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const color = `hsl(${hue}, 70%, 55%)`;
  metricColors.set(key, color);
  renderLegend();
  return color;
}

function renderLegend() {
  legend.innerHTML = "";
  for (const [key, color] of metricColors.entries()) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${key}`;
    legend.appendChild(item);
  }
}

const chart = new Chart(chartEl, {
  type: "scatter",
  data: {
    datasets: [
      {
        label: "Percentile",
        data: [],
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: (ctx) => (ctx.raw ? ctx.raw.color : "#6ed0a5"),
        pointBorderColor: "rgba(0,0,0,0.4)",
        pointBorderWidth: 1
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: "linear",
        title: { display: true, text: "Elapsed (s)" },
        ticks: {
          color: "#9fb0a8",
          callback: (value) => `${value.toFixed(0)}s`
        },
        grid: { color: "rgba(255,255,255,0.06)" }
      },
      y: {
        min: 0,
        max: 100,
        title: { display: true, text: "Percentile" },
        ticks: { color: "#9fb0a8" },
        grid: { color: "rgba(255,255,255,0.06)" }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const raw = ctx.raw;
            return `${raw.metricKey}: ${raw.value} (p${raw.percentile})`;
          }
        }
      }
    }
  }
});

function addPoint(point) {
  let color = colorFromKey(point.metricKey);
  if (point.severity === "critical") {
    color = "#e63b2e";
  } else if (point.severity === "warning") {
    color = "#f6c36a";
  }
  const elapsed = serverStart ? (point.ts - serverStart) / 1000 : point.ts / 1000;
  const dataPoint = {
    x: Math.max(0, elapsed),
    y: point.percentile,
    eventId: point.eventId,
    metricKey: point.metricKey,
    value: point.value,
    percentile: point.percentile,
    color,
    name: point.name
  };
  const dataset = chart.data.datasets[0];
  dataset.data.push(dataPoint);
  if (dataset.data.length > MAX_POINTS) {
    dataset.data.shift();
  }
  chart.update("none");
}

async function loadEventDetail(eventId) {
  detailId.textContent = eventId;
  detailMetrics.innerHTML = "";
  detailTrace.innerHTML = "";

  const res = await fetch(`/event/${eventId}`);
  const body = await res.json();
  if (!body.ok) {
    detailMetrics.innerHTML = '<div class="kv-row">Not found</div>';
    return;
  }

  const event = body.data;
  const metrics = event.metrics || {};
  const percentiles = event.percentiles || {};
  const trace = event.trace || [];
  const outlierReasons = event.outlierReasons || [];
  const severity = event.severity || "normal";

  const timeRows = [
    { label: "startTime", value: formatTime(event.startTime) },
    { label: "endTime", value: formatTime(event.endTime) },
    {
      label: "durationMs",
      value: `${formatValue(metrics.durationMs ?? 0, metricUnits.durationMs)} (${formatPercentile(percentiles.durationMs)})`
    }
  ];

  const performanceRows = [];
  if (metrics.cpuPct !== undefined) {
    performanceRows.push({
      label: "cpuPct",
      value: `${formatValue(metrics.cpuPct, metricUnits.cpuPct)} (${formatPercentile(percentiles.cpuPct)})`
    });
  }
  if (metrics.memMb !== undefined) {
    performanceRows.push({
      label: "memMb",
      value: `${formatValue(metrics.memMb, metricUnits.memMb)} (${formatPercentile(percentiles.memMb)})`
    });
  }
  if (metrics.apdex !== undefined) {
    performanceRows.push({
      label: "apdex",
      value: `${formatValue(metrics.apdex, metricUnits.apdex)} (${formatPercentile(percentiles.apdex)})`
    });
  }

  const requestRows = [];
  if (metrics.requestCount !== undefined) {
    requestRows.push({
      label: "requestCount",
      value: `${formatValue(metrics.requestCount, metricUnits.requestCount)} (${formatPercentile(percentiles.requestCount)})`
    });
  }
  if (metrics.errorCount !== undefined) {
    requestRows.push({
      label: "errorCount",
      value: `${formatValue(metrics.errorCount, metricUnits.errorCount)} (${formatPercentile(percentiles.errorCount)})`
    });
  }

  const dataRows = [];
  for (const [key, value] of Object.entries(metrics)) {
    if (["durationMs", "cpuPct", "memMb", "apdex", "requestCount", "errorCount"].includes(key)) {
      continue;
    }
    const unit = metricUnits[key] || "";
    const pct = typeof percentiles[key] === "number" ? percentiles[key] : null;
    dataRows.push({
      label: key,
      value: `${formatValue(value, unit)}${pct === null ? "" : ` (${formatPercentile(pct)})`}`
    });
  }

  detailMetrics.innerHTML =
    renderGroup("Time", timeRows) +
    renderGroup("Severity", [
      { label: "level", value: severity }
    ]) +
    renderOutlierReasons(outlierReasons) +
    renderGroup("Performance", performanceRows) +
    renderGroup("Requests", requestRows) +
    renderGroup("Data", dataRows);

  if (trace.length === 0) {
    const row = document.createElement("div");
    row.className = "kv-row";
    row.innerHTML = "<span>No trace steps</span><span>-</span>";
    detailTrace.appendChild(row);
  } else {
    for (const step of trace) {
      const row = document.createElement("div");
      row.className = "kv-row";
      row.innerHTML = `<span>${step.name}</span><span>${formatValue(step.value, "")}</span>`;
      detailTrace.appendChild(row);
    }
  }
}

chartEl.addEventListener("click", (event) => {
  const points = chart.getElementsAtEventForMode(event, "nearest", { intersect: true }, true);
  if (!points.length) {
    return;
  }
  const point = chart.data.datasets[0].data[points[0].index];
  loadEventDetail(point.eventId);
});

const ws = new WebSocket(`ws://${window.location.host}`);
ws.addEventListener("message", (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.type === "point") {
    addPoint(msg.data);
  }
  if (msg.type === "hello" && msg.data && msg.data.serverStart) {
    serverStart = msg.data.serverStart;
  }
});

if (sampleBtn) {
  sampleBtn.addEventListener("click", async () => {
    await fetch("/sample", { method: "POST" });
  });
}
