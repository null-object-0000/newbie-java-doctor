package com.example;

import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

@SpringBootApplication
public class BffApplication {
    public static void main(String[] args) {
        SpringApplication.run(BffApplication.class, args);
    }

    @Bean
    public RestTemplate restTemplate() {
        var connManager = PoolingHttpClientConnectionManagerBuilder.create()
                .setMaxConnTotal(10000)
                .setMaxConnPerRoute(10000)
                .build();
        var httpClient = HttpClients.custom()
                .setConnectionManager(connManager)
                .build();
        var factory = new HttpComponentsClientHttpRequestFactory(httpClient);
        factory.setConnectTimeout(Duration.ofSeconds(5));
        return new RestTemplate(factory);
    }
}
