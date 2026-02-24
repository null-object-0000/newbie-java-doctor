package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.client.RestTemplate;

@RestController
public class BffController {

    @Autowired
    private RestTemplate restTemplate;

    @GetMapping("/api/goods-detail")
    public String getGoodsDetail() {
        String body = restTemplate.getForObject("http://slow-api:8080/api/logistics", String.class);
        return "商品详情 + " + body;
    }
}
