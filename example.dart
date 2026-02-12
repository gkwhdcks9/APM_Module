// Example usage of the local APM module.

import 'apm.dart';

void exampleUsage() {
  Apm.instance.initialize(
    config: const ApmConfig(enabled: true, sampleRate: 1.0),
    reporter: (data) {
      // Inspect span data here.
    },
  );

  final txn = Apm.instance.startTransaction('Example/Work', 'demo');
  final child = txn.startChild('compute', description: 'Example step');
  child.finish(status: SpanStatus.ok);
  txn.finish(status: SpanStatus.ok);
}
