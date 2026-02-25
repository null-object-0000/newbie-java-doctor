package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BffController {
    private final DownstreamClient downstreamClient;

    public BffController(DownstreamClient downstreamClient) {
        this.downstreamClient = downstreamClient;
    }

    @GetMapping("/api/goods-detail")
    public String getGoodsDetail() {
        String body = downstreamClient.fetchLogistics();
        return "商品详情 + " + body;
    }
}
