library apm_tracer;

import 'dart:math';

import 'span.dart';

class ApmConfig {
  final bool enabled;
  final double sampleRate;

  const ApmConfig({
    this.enabled = true,
    this.sampleRate = 1.0,
  });
}

class Tracer {
  final ApmConfig _config;
  final Random _rng;
  final IdGenerator _ids;
  SpanReporter? _reporter;

  Tracer({ApmConfig? config, Random? rng, SpanReporter? reporter})
      : _config = config ?? const ApmConfig(),
        _rng = rng ?? Random(),
        _ids = IdGenerator(rng),
        _reporter = reporter;

  void setReporter(SpanReporter? reporter) {
    _reporter = reporter;
  }

  ISpan startTransaction(String name, String op, {String? description}) {
    if (!_config.enabled) {
      return NoopSpan(
        SpanContext(traceId: 'noop', spanId: 'noop', name: name, op: op, description: description),
      );
    }

    if (_config.sampleRate < 1.0) {
      final r = _rng.nextDouble();
      if (r > _config.sampleRate) {
        return NoopSpan(
          SpanContext(traceId: 'noop', spanId: 'noop', name: name, op: op, description: description),
        );
      }
    }

    final ctx = SpanContext(
      traceId: _ids.newTraceId(),
      spanId: _ids.newSpanId(),
      name: name,
      op: op,
      description: description,
    );
    return SimpleSpan(ctx, _ids, _reporter);
  }
}
