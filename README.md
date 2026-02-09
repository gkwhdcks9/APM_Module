# APM Module (Local)

Minimal APM core for tracing spans inside the app. It focuses on a small API:

- `Apm.startTransaction(name, op)`
- `span.startChild(op)`
- `span.finish()`
- optional `SpanReporter` hook for exporting span data

## Modules

### Apm

Singleton entry point that wires a `Tracer` and exposes a simple API.

**Key features**

- Initialize once with `ApmConfig` and optional `SpanReporter`.
- Start top-level transactions with `startTransaction`.
- Swap reporters at runtime with `setReporter`.

**Usage**

```dart
import 'package:carpenter/apm/apm.dart';

void initApm() {
  Apm.instance.initialize(
    config: const ApmConfig(enabled: true, sampleRate: 1.0),
    reporter: (data) {
      // Send to server or feed into chart.
    },
  );
}

void example() {
  final txn = Apm.instance.startTransaction('Record/Save', 'ui.action');
  final db = txn.startChild('db', description: 'SharedPreferences.save');
  // ... work ...
  db.finish();
  txn.finish(status: SpanStatus.ok);
}
```

### Tracer

Creates transactions and applies sampling rules. When tracing is disabled or
when a sample is dropped, it returns a `NoopSpan` so callers can keep the same
code path.

**Key features**

- `ApmConfig.enabled` to enable/disable tracing.
- `ApmConfig.sampleRate` for probabilistic sampling.
- Custom `SpanReporter` that receives finished span data.

### Span (ISpan / SimpleSpan / NoopSpan)

The core tracing unit. `SimpleSpan` collects timing and metadata. `NoopSpan`
implements the same interface but ignores calls, making it safe to use without
feature checks.

**Key features**

- Create children with `startChild`.
- Add metadata with `setTag` and `setData`.
- Finish with `finish(status)` to emit `SpanData`.

**Usage**

```dart
final txn = Apm.instance.startTransaction('Example/Work', 'demo');
final child = txn.startChild('compute', description: 'Example step');
child.setTag('cache', 'hit');
child.setData('size', 128);
child.finish(status: SpanStatus.ok);
txn.finish(status: SpanStatus.ok);
```

### SpanContext / SpanData

Data structures that describe a span and its results.

**SpanContext fields**

- `traceId`, `spanId`, `parentSpanId`
- `name`, `op`, `description`

**SpanData fields**

- `startTime`, `endTime`, `duration`
- `status`, `tags`, `data`

### ApmConfig

Configuration for the tracer.

**Key fields**

- `enabled` (default `true`)
- `sampleRate` (default `1.0`)

**Usage**

```dart
const ApmConfig(enabled: true, sampleRate: 0.25);
```

### SpanReporter

Callback signature invoked when a span finishes.

**Usage**

```dart
Apm.instance.initialize(
  reporter: (SpanData data) {
    // Send to server, log, or aggregate.
  },
);
```

### buildAnomalyReporter

Helper that converts finished spans into anomaly samples. It optionally filters
by `op` and reports duration in seconds.

**Usage**

```dart
Apm.instance.initialize(
  reporter: buildAnomalyReporter(
    allowedOps: {'distance', 'fuel', 'taxi'},
    onSample: (op, durationSec) {
      // Map op -> anomaly type and record.
    },
  ),
);
```
