package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

@RestController
public class BffController {

    @Autowired
    private HttpClient httpClient;

    @GetMapping("/api/goods-detail")
    public String getGoodsDetail() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://slow-api:8080/api/logistics"))
                .version(HttpClient.Version.HTTP_1_1)
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        return "商品详情 + " + response.body();
    }
}
