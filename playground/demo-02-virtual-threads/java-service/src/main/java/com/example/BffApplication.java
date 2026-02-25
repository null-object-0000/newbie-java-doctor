package com.example;

import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManager;
import org.apache.hc.core5.util.TimeValue;
import org.apache.hc.core5.util.Timeout;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;

import java.net.http.HttpClient;
import java.time.Duration;

@SpringBootApplication
public class BffApplication {
    private static final String DOWNSTREAM_URL = "http://slow-api:8080/api/logistics";

    public static void main(String[] args) {
        SpringApplication.run(BffApplication.class, args);
    }

    @Bean
    @ConditionalOnProperty(name = "bff.http-client", havingValue = "jdk", matchIfMissing = true)
    public DownstreamClient jdkDownstreamClient() {
        var jdkClient = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        return new JdkDownstreamClient(jdkClient, DOWNSTREAM_URL, Duration.ofSeconds(10));
    }

    @Bean
    @ConditionalOnProperty(name = "bff.http-client", havingValue = "apache")
    public DownstreamClient apacheDownstreamClient() {
        var connManager = new PoolingHttpClientConnectionManager();
        connManager.setMaxTotal(12000);
        connManager.setDefaultMaxPerRoute(12000);

        CloseableHttpClient httpClient = HttpClients.custom()
                .setConnectionManager(connManager)
                .evictExpiredConnections()
                .evictIdleConnections(TimeValue.ofMinutes(1))
                .setDefaultRequestConfig(
                        org.apache.hc.client5.http.config.RequestConfig.custom()
                                .setConnectionRequestTimeout(Timeout.ofSeconds(5))
                                .setResponseTimeout(Timeout.ofSeconds(10))
                                .build()
                )
                .build();

        return new ApacheDownstreamClient(httpClient, DOWNSTREAM_URL);
    }
}
