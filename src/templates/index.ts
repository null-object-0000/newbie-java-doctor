import ioBoundBff from './io-bound-bff.json'

export const demoTemplates = [
    {
        label: '经典案例 1: 慢依赖拖垮中间层 (Tomcat 线程池瓶颈)',
        key: 'io-bound-bff',
        data: ioBoundBff, // 具体的 JSON 数据
        description: '模拟一个简单的聚合网关，因为下游第三方 API 响应极慢（500ms），导致自身 Tomcat 线程池迅速耗尽的场景。'
    }
]