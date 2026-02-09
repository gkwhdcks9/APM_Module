library apm;

export 'span.dart';
export 'tracer.dart';

import 'tracer.dart';
import 'span.dart';

class Apm {
  Apm._();

  static final Apm instance = Apm._();

  Tracer _tracer = Tracer();

  void initialize({ApmConfig? config, SpanReporter? reporter}) {
    _tracer = Tracer(config: config, reporter: reporter);
  }

  void setReporter(SpanReporter? reporter) {
    _tracer.setReporter(reporter);
  }

  ISpan startTransaction(String name, String op, {String? description}) {
    return _tracer.startTransaction(name, op, description: description);
  }
}
