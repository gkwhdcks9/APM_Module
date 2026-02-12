package com.apm.module;

public final class ApmConfig {
    private final String serviceName;
    private final String environment;
    private final String otlpEndpoint;
    private final String dashboardEndpoint;
    private final double sampleRatio;

    private ApmConfig(Builder builder) {
        this.serviceName = builder.serviceName;
        this.environment = builder.environment;
        this.otlpEndpoint = builder.otlpEndpoint;
        this.dashboardEndpoint = builder.dashboardEndpoint;
        this.sampleRatio = builder.sampleRatio;
    }

    public static Builder builder() {
        return new Builder();
    }

    public String getServiceName() {
        return serviceName;
    }

    public String getEnvironment() {
        return environment;
    }

    public String getOtlpEndpoint() {
        return otlpEndpoint;
    }

    public String getDashboardEndpoint() {
        return dashboardEndpoint;
    }

    public double getSampleRatio() {
        return sampleRatio;
    }

    public static final class Builder {
        private String serviceName = "apm-service";
        private String environment = "dev";
        private String otlpEndpoint = "http://localhost:4317";
        private String dashboardEndpoint = "http://localhost:3000/ingest";
        private double sampleRatio = 1.0;

        private Builder() {
        }

        public Builder serviceName(String serviceName) {
            this.serviceName = serviceName;
            return this;
        }

        public Builder environment(String environment) {
            this.environment = environment;
            return this;
        }

        public Builder otlpEndpoint(String otlpEndpoint) {
            this.otlpEndpoint = otlpEndpoint;
            return this;
        }

        public Builder dashboardEndpoint(String dashboardEndpoint) {
            this.dashboardEndpoint = dashboardEndpoint;
            return this;
        }

        public Builder sampleRatio(double sampleRatio) {
            this.sampleRatio = sampleRatio;
            return this;
        }

        public ApmConfig build() {
            return new ApmConfig(this);
        }
    }
}
