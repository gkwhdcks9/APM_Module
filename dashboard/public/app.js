const chartEl = document.getElementById("chart");
const detailId = document.getElementById("detail-id");
const detailMetrics = document.getElementById("detail-metrics");
const detailTrace = document.getElementById("detail-trace");
const legend = document.getElementById("legend");
const sampleBtn = document.getElementById("sample-btn");

const MAX_POINTS = 400;
const metricColors = new Map();
let serverStart = null;
let selectedEventId = null;

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
  return `<div class="kv-group" style="background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;margin-bottom:12px;">
    <div class="kv-title">${title}</div>${items}
  </div>`;
}

function renderSummary(severity, outlierReasons, metrics, percentiles) {
  if (severity === "normal" || !Array.isArray(outlierReasons) || outlierReasons.length === 0) {
    return "";
  }

  const summaries = [];
  
  if (outlierReasons.includes("latency_p99")) {
    summaries.push(`⚠️ Duration is extremely high (p99: ${metrics.durationMs?.toFixed(2)}ms)`);
  } else if (outlierReasons.includes("latency_p95")) {
    summaries.push(`⚠️ Duration is high (p95: ${metrics.durationMs?.toFixed(2)}ms)`);
  }
  
  if (outlierReasons.includes("error_count_critical")) {
    summaries.push(`❌ Errors detected (${metrics.errorCount} error${metrics.errorCount > 1 ? 's' : ''})`);
  }
  
  if (outlierReasons.includes("cpu_p99")) {
    summaries.push(`🔥 CPU usage is extremely high (p99: ${metrics.cpuPct?.toFixed(1)}%)`);
  } else if (outlierReasons.includes("cpu_p95")) {
    summaries.push(`🔥 CPU usage is high (p95: ${metrics.cpuPct?.toFixed(1)}%)`);
  }
  
  if (outlierReasons.includes("mem_p99")) {
    summaries.push(`💾 Memory usage is extremely high (p99: ${metrics.memMb?.toFixed(0)}MB)`);
  } else if (outlierReasons.includes("mem_p95")) {
    summaries.push(`💾 Memory usage is high (p95: ${metrics.memMb?.toFixed(0)}MB)`);
  }
  
  if (outlierReasons.includes("req_p99")) {
    summaries.push(`📊 Request count is very high (p99: ${metrics.requestCount})`);
  }

  if (summaries.length === 0) {
    return "";
  }

  const bgColor = severity === "critical" ? "#fee" : "#fff8e1";
  const borderColor = severity === "critical" ? "#e63b2e" : "#f6c36a";
  
  const items = summaries.map(s => `<div style="padding:6px 0;line-height:1.4;color:#000;">${s}</div>`).join("");
  
  return `<div style="background:${bgColor};border:2px solid ${borderColor};border-radius:10px;padding:14px;margin:12px 0;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="font-weight:bold;margin-bottom:8px;color:#000;">⚡ Summary</div>
    ${items}
  </div>`;
}

function renderRecommendations(outlierReasons) {
  if (!Array.isArray(outlierReasons) || outlierReasons.length === 0) {
    return "";
  }

  const hasLatency = outlierReasons.includes("latency_p99") || outlierReasons.includes("latency_p95");
  const hasCpu = outlierReasons.includes("cpu_p99") || outlierReasons.includes("cpu_p95");
  const hasMem = outlierReasons.includes("mem_p99") || outlierReasons.includes("mem_p95");
  const hasError = outlierReasons.includes("error_count_critical");
  
  const recommendations = [];

  // Duration이 높을 때
  if (hasLatency) {
    // 다른 outlier가 있으면 그것들을 해결하라고 제안
    if (hasCpu) {
      recommendations.push("💡 High CPU usage may be causing slow duration. Optimize CPU-intensive operations (e.g., reduce loops, use efficient algorithms).");
    }
    if (hasMem) {
      recommendations.push("💡 High memory usage may be causing slow duration. Check for memory leaks or optimize data structures.");
    }
    if (hasError) {
      recommendations.push("💡 Errors may be increasing duration due to retry logic or exception handling. Fix the errors first.");
    }
    
    // Duration만 높고 다른 outlier가 없으면 전반적인 최적화 제안
    if (!hasCpu && !hasMem && !hasError) {
      recommendations.push("💡 Consider optimizing database queries with indexes or caching.");
      recommendations.push("💡 Use async/await patterns to avoid blocking operations.");
      recommendations.push("💡 Reduce external API calls or parallelize them.");
      recommendations.push("💡 Enable compression for large data transfers.");
    }
  }

  // CPU만 높을 때 (duration과 무관)
  if (hasCpu && !hasLatency) {
    recommendations.push("💡 Profile your code to find CPU bottlenecks and optimize hot paths.");
  }

  // Memory만 높을 때 (duration과 무관)
  if (hasMem && !hasLatency) {
    recommendations.push("💡 Use memory profiler to detect leaks or unnecessary data retention.");
  }

  // Error만 있을 때
  if (hasError && !hasLatency) {
    recommendations.push("💡 Review error logs and add proper error handling or validation.");
  }

  if (recommendations.length === 0) {
    return "";
  }

  const items = recommendations.map(r => `<div style="padding:6px 0;line-height:1.4;color:#000;">${r}</div>`).join("");
  
  return `<div style="background:#e8f5e9;border:2px solid #4caf50;border-radius:10px;padding:14px;margin:12px 0;box-shadow:0 2px 8px rgba(76,175,80,0.2);">
    <div style="font-weight:bold;margin-bottom:8px;color:#000;">💡 Recommendations</div>
    ${items}
  </div>`;
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
        pointBorderColor: (ctx) => {
          if (ctx.raw && ctx.raw.eventId === selectedEventId) {
            return "#00bfff";
          }
          return "rgba(0,0,0,0.4)";
        },
        pointBorderWidth: (ctx) => {
          if (ctx.raw && ctx.raw.eventId === selectedEventId) {
            return 2.5;
          }
          return 1;
        }
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
        min: -5,
        max: 105,
        title: { display: true, text: "Percentile" },
        ticks: { color: "#9fb0a8" },
        grid: { color: "rgba(255,255,255,0.06)" }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (ctx) => {
            if (ctx.length > 0) {
              return ctx[0].raw.name || "Event";
            }
            return "Event";
          },
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
  const eventName = event.name || "Unknown Event";
  const serviceName = event.serviceName || "unknown";

  // 이벤트 이름을 큰 헤더로 표시
  const eventHeader = `<div style="padding:16px;background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);color:#fff;border-radius:10px;margin-bottom:16px;box-shadow:0 4px 12px rgba(102,126,234,0.3);">
    <div style="font-size:20px;font-weight:bold;margin-bottom:4px;">${eventName}</div>
    <div style="font-size:13px;opacity:0.9;">${serviceName} • ${severity.toUpperCase()}</div>
  </div>`;

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

  // 좌측 컬럼: Event Header + Summary + Recommendations
  const leftColumn = `
    <div style="flex:1;min-width:320px;padding-right:16px;">
      ${eventHeader}
      ${renderSummary(severity, outlierReasons, metrics, percentiles)}
      ${renderRecommendations(outlierReasons)}
    </div>
  `;

  // 우측 컬럼: Time, Severity, Performance, Requests, Data
  const rightColumn = `
    <div style="flex:1;min-width:320px;">
      ${renderGroup("Time", timeRows)}
      ${renderGroup("Severity", [{ label: "level", value: severity }])}
      ${renderGroup("Performance", performanceRows)}
      ${renderGroup("Requests", requestRows)}
      ${renderGroup("Data", dataRows)}
    </div>
  `;

  detailMetrics.innerHTML = `
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      ${leftColumn}
      ${rightColumn}
    </div>
  `;

  detailTrace.innerHTML = "";
  const traceContainer = document.createElement("div");
  traceContainer.style.cssText = "background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;";
  
  if (trace.length === 0) {
    const row = document.createElement("div");
    row.className = "kv-row";
    row.innerHTML = "<span>No trace steps</span><span>-</span>";
    traceContainer.appendChild(row);
  } else {
    for (const step of trace) {
      const row = document.createElement("div");
      row.className = "kv-row";
      row.innerHTML = `<span>${step.name}</span><span>${formatValue(step.value, "")}</span>`;
      traceContainer.appendChild(row);
    }
  }
  detailTrace.appendChild(traceContainer);
}

chartEl.addEventListener("click", (event) => {
  const points = chart.getElementsAtEventForMode(event, "nearest", { intersect: true }, true);
  if (!points.length) {
    return;
  }
  const point = chart.data.datasets[0].data[points[0].index];
  selectedEventId = point.eventId;
  loadEventDetail(point.eventId);
  chart.update("none");
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
