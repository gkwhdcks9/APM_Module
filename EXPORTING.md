# Exporting Span Data

The APM module exposes a `SpanReporter` hook for exporting spans.

Example:

```dart
Apm.instance.initialize(
  reporter: (data) {
    // data.context.traceId, data.duration, data.tags, etc.
  },
);
```

You can wire this to:
- Local persistence (SQLite / SharedPreferences)
- Network export (HTTP POST)
- Real-time visualization
