library apm_anomaly_reporter;

import 'span.dart';

// / Converts finished spans into samples for an anomaly chart.
// /
// / Usage:
// / Apm.instance.initialize(
// /   reporter: buildAnomalyReporter(
// /     allowedOps: {'distance', 'fuel', 'taxi'},
// /     onSample: (op, durationSec) {
// /       // Map op -> AnomalyType and call recordAnomalyEvent
// /     },
// /   ),
// / );
SpanReporter buildAnomalyReporter({
  required void Function(String op, double durationSec) onSample,
  Set<String>? allowedOps,
}) {
  final filter = allowedOps ?? <String>{};
  return (SpanData data) {
    final op = data.context.op;
    if (filter.isNotEmpty && !filter.contains(op)) {
      return;
    }
    final duration = data.duration;
    if (duration == null) {
      return;
    }
    onSample(op, duration.inMicroseconds / 1e6);
  };
}
