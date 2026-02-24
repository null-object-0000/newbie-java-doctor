package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestTemplate;
import org.springframework.beans.factory.annotation.Autowired;

@RestController
public class BffController {

    @Autowired
    private RestTemplate restTemplate;

    @GetMapping("/api/goods-detail")
    public String getGoodsDetail() {
        // 请求下游极其缓慢的物流接口 (域名对应 docker-compose 中的 slow-api 服务)
        String logistics = restTemplate.getForObject("http://slow-api:8080/api/logistics", String.class);
        return "商品详情 + " + logistics;
    }
}