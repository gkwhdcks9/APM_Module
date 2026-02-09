# APM Module (Local)

Minimal APM core for tracing spans inside the app. This module provides:

- `Apm.startTransaction(name, op)`
- `span.startChild(op)`
- `span.finish()`
- optional `SpanReporter` hook for exporting span data

## Usage

```dart
import 'package:carpenter/apm/apm.dart';

void initApm() {
  Apm.instance.initialize(
    config: const ApmConfig(enabled: true, sampleRate: 1.0),
    reporter: (data) {
      // send to server or feed into chart
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
