package com.apm.module;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Scope;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.SpanProcessor;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.sdk.trace.samplers.Sampler;
import io.opentelemetry.semconv.ResourceAttributes;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public final class ApmModule {
    private static volatile ApmModule instance;

    private final ApmConfig config;
    private final OpenTelemetry openTelemetry;
    private final Tracer tracer;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    private ApmModule(ApmConfig config) {
        this.config = config;
        this.openTelemetry = buildOpenTelemetry(config);
        this.tracer = openTelemetry.getTracer("apm-module", "0.1.0");
        this.objectMapper = new ObjectMapper();
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public static synchronized ApmModule init(ApmConfig config) {
        if (instance == null) {
            instance = new ApmModule(config);
        }
        return instance;
    }

    public static ApmModule get() {
        if (instance == null) {
            throw new IllegalStateException("ApmModule not initialized. Call init() first.");
        }
        return instance;
    }

    public ApmEvent startEvent(String name, Map<String, String> attrs) {
        Span span = tracer.spanBuilder(name).startSpan();
        if (attrs != null) {
            for (Map.Entry<String, String> entry : attrs.entrySet()) {
                span.setAttribute(entry.getKey(), entry.getValue());
            }
        }
        String eventId = UUID.randomUUID().toString();
        long startTime = System.currentTimeMillis();
        return new ApmEvent(eventId, name, startTime, span, attrs);
    }

    public void endEvent(ApmEvent event, StatusCode status) {
        long endTime = System.currentTimeMillis();
        event.setEndTime(endTime);
        Span span = event.getSpan();
        if (status != null) {
            span.setStatus(status);
        }
        span.end();
    }

    public void addMetric(ApmEvent event, String key, double value) {
        event.getMetrics().put(key, value);
    }

    public void addTraceStep(ApmEvent event, String name, double value) {
        event.getTrace().add(new TraceStep(name, value));
        Span span = event.getSpan();
        span.addEvent(name, Attributes.of(io.opentelemetry.api.common.AttributeKey.doubleKey("value"), value));
    }

    public int sendEvent(ApmEvent event) throws IOException, InterruptedException {
        String json = objectMapper.writeValueAsString(event);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(config.getDashboardEndpoint()))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return response.statusCode();
    }

    public void shutdown() {
        if (openTelemetry instanceof OpenTelemetrySdk) {
            OpenTelemetrySdk sdk = (OpenTelemetrySdk) openTelemetry;
            sdk.getSdkTracerProvider().shutdown().join(5, TimeUnit.SECONDS);
        }
        instance = null;
    }

    private static OpenTelemetry buildOpenTelemetry(ApmConfig config) {
        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.of(
                ResourceAttributes.SERVICE_NAME, config.getServiceName(),
                ResourceAttributes.DEPLOYMENT_ENVIRONMENT, config.getEnvironment()
        )));

        OtlpGrpcSpanExporter exporter = OtlpGrpcSpanExporter.builder()
                .setEndpoint(config.getOtlpEndpoint())
                .build();

        SpanProcessor spanProcessor = BatchSpanProcessor.builder(exporter).build();

        SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
                .setResource(resource)
                .setSampler(Sampler.traceIdRatioBased(config.getSampleRatio()))
                .addSpanProcessor(spanProcessor)
                .build();

        return OpenTelemetrySdk.builder()
                .setTracerProvider(tracerProvider)
                .build();
    }
}
