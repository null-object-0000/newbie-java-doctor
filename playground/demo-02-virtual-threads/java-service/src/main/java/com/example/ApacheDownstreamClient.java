package com.example;

import org.apache.hc.client5.http.classic.methods.HttpGet;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.core5.http.io.entity.EntityUtils;

public class ApacheDownstreamClient implements DownstreamClient {
    private final CloseableHttpClient httpClient;
    private final String downstreamUrl;

    public ApacheDownstreamClient(CloseableHttpClient httpClient, String downstreamUrl) {
        this.httpClient = httpClient;
        this.downstreamUrl = downstreamUrl;
    }

    @Override
    public String fetchLogistics() {
        var request = new HttpGet(downstreamUrl);
        try (var response = httpClient.execute(request)) {
            int status = response.getCode();
            String body = response.getEntity() == null ? "" : EntityUtils.toString(response.getEntity());
            if (status < 200 || status >= 300) {
                throw new IllegalStateException("Downstream returned status " + status);
            }
            return body;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to call downstream", e);
        }
    }
}
