library apm_span;

import 'dart:math';

enum SpanStatus {
  ok,
  error,
  cancelled,
}

class SpanContext {
  final String traceId;
  final String spanId;
  final String? parentSpanId;
  final String name;
  final String op;
  final String? description;

  SpanContext({
    required this.traceId,
    required this.spanId,
    required this.name,
    required this.op,
    this.parentSpanId,
    this.description,
  });
}

class SpanData {
  final SpanContext context;
  final DateTime startTime;
  final DateTime? endTime;
  final Duration? duration;
  final SpanStatus? status;
  final Map<String, String> tags;
  final Map<String, Object?> data;

  SpanData({
    required this.context,
    required this.startTime,
    this.endTime,
    this.duration,
    this.status,
    Map<String, String>? tags,
    Map<String, Object?>? data,
  })  : tags = tags ?? <String, String>{},
        data = data ?? <String, Object?>{};
}

typedef SpanReporter = void Function(SpanData data);

typedef SpanIdGenerator = String Function();

typedef TraceIdGenerator = String Function();

String _randomHex(Random rng, int length) {
  const chars = '0123456789abcdef';
  final sb = StringBuffer();
  for (var i = 0; i < length; i++) {
    sb.write(chars[rng.nextInt(chars.length)]);
  }
  return sb.toString();
}

class IdGenerator {
  final Random _rng;
  IdGenerator([Random? rng]) : _rng = rng ?? Random();

  String newTraceId() => _randomHex(_rng, 32);

  String newSpanId() => _randomHex(_rng, 16);
}

abstract class ISpan {
  SpanContext get context;
  ISpan startChild(String op, {String? description});
  void setTag(String key, String value);
  void setData(String key, Object? value);
  void finish({SpanStatus? status});
  bool get isNoop;
}

class NoopSpan implements ISpan {
  final SpanContext _context;
  NoopSpan(this._context);

  @override
  SpanContext get context => _context;

  @override
  ISpan startChild(String op, {String? description}) => this;

  @override
  void setTag(String key, String value) {}

  @override
  void setData(String key, Object? value) {}

  @override
  void finish({SpanStatus? status}) {}

  @override
  bool get isNoop => true;
}

class SimpleSpan implements ISpan {
  final SpanContext _context;
  final DateTime _startTime;
  final Stopwatch _stopwatch = Stopwatch();
  final Map<String, String> _tags = <String, String>{};
  final Map<String, Object?> _data = <String, Object?>{};
  final SpanReporter? _reporter;
  final IdGenerator _ids;
  bool _finished = false;

  SimpleSpan(this._context, this._ids, this._reporter) : _startTime = DateTime.now() {
    _stopwatch.start();
  }

  @override
  SpanContext get context => _context;

  @override
  ISpan startChild(String op, {String? description}) {
    if (_finished) {
      return NoopSpan(_context);
    }
    final childCtx = SpanContext(
      traceId: _context.traceId,
      spanId: _ids.newSpanId(),
      parentSpanId: _context.spanId,
      name: _context.name,
      op: op,
      description: description,
    );
    return SimpleSpan(childCtx, _ids, _reporter);
  }

  @override
  void setTag(String key, String value) {
    if (_finished) return;
    _tags[key] = value;
  }

  @override
  void setData(String key, Object? value) {
    if (_finished) return;
    _data[key] = value;
  }

  @override
  void finish({SpanStatus? status}) {
    if (_finished) return;
    _finished = true;
    _stopwatch.stop();
    final endTime = DateTime.now();
    final data = SpanData(
      context: _context,
      startTime: _startTime,
      endTime: endTime,
      duration: _stopwatch.elapsed,
      status: status,
      tags: Map<String, String>.from(_tags),
      data: Map<String, Object?>.from(_data),
    );
    if (_reporter != null) {
      _reporter!(data);
    }
  }

  @override
  bool get isNoop => false;
}
