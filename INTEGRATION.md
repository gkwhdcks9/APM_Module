# Integration Guide

1) Initialize APM once at app startup.
2) Start a transaction for each user action.
3) Create child spans for sub-steps.
4) Finish spans and transaction.

Example:

```dart
final txn = Apm.instance.startTransaction('Record/Save', 'ui.action');
final span = txn.startChild('db', description: 'Save record');
// ...
span.finish(status: SpanStatus.ok);
txn.finish(status: SpanStatus.ok);
```
