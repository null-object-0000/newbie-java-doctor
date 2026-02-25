package com.example;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class JdkDownstreamClient implements DownstreamClient {
    private final HttpClient httpClient;
    private final URI downstreamUri;
    private final Duration requestTimeout;

    public JdkDownstreamClient(HttpClient httpClient, String downstreamUrl, Duration requestTimeout) {
        this.httpClient = httpClient;
        this.downstreamUri = URI.create(downstreamUrl);
        this.requestTimeout = requestTimeout;
    }

    @Override
    public String fetchLogistics() {
        var request = HttpRequest.newBuilder(downstreamUri)
                .GET()
                .timeout(requestTimeout)
                .build();

        try {
            var response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Downstream returned status " + response.statusCode());
            }
            return response.body();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while calling downstream", e);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to call downstream", e);
        }
    }
}
