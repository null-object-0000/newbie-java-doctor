# Newbie Java Doctor

Java 全链路容量评估与瓶颈诊断工具。通过可视化拓扑图构建请求链路，自动计算各层理论天花板，精准定位性能瓶颈并给出最优配置建议。

![Vue](https://img.shields.io/badge/Vue_3-4FC08D?logo=vuedotjs&logoColor=fff)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=fff)

## 核心能力

**可视化拓扑建模** — 拖拽节点 + 连线，快速构建请求链路拓扑图

**分层瓶颈诊断** — 从客户端 → 接入层 → 宿主容器 → 运行时 → 依赖层逐层分析

**天花板计算** — 自动计算带宽、PPS、端口、文件句柄、线程池等维度的理论最大 QPS

**智能配置推荐** — 基于 Little's Law 等模型推荐 JVM、Tomcat、内核参数

**一键参数采集** — 提供脚本自动采集容器环境参数，导入即用

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 一键采集容器参数

在目标容器（Linux）上执行以下命令，自动采集宿主容器层 + 运行时层参数，生成可导入的 JSON 文件。

```bash
curl -fsSL https://raw.githubusercontent.com/null-object-0000/newbie-java-doctor/main/scripts/collect-params.sh | bash -s -- -o topology.json
```

<details>
<summary>更多执行方式</summary>

**使用 wget：**

```bash
wget -qO- https://raw.githubusercontent.com/null-object-0000/newbie-java-doctor/main/scripts/collect-params.sh | bash -s -- -o topology.json
```

**本地执行：**

```bash
bash scripts/collect-params.sh -o topology.json
```

</details>

### 采集范围

| 层 | 采集项 |
|---|---|
| 宿主容器层 | vCPU、内存、磁盘类型、NIC 带宽、OS/内核版本、TCP 参数、文件句柄限制 |
| 运行时层 | JDK 版本、GC 类型、JVM 启动参数、Tomcat 线程/连接配置 |

采集完成后，在 Web 页面点击 **「导入」** 选择 JSON 文件即可。IOPS 等难以自动探测的参数可导入后在页面手动调整。

## 链路分层模型

| 层 | 说明 |
|---|---|
| Client Layer | 负载目标定义（并发数、目标吞吐量、预期失败率） |
| Access Layer | 接入网关（Tengine / Nginx / API Gateway） |
| Host Layer | 宿主容器硬件约束与内核参数 |
| Runtime Layer | JVM 配置、Tomcat 线程池、日志级别 |
| Dependency Layer | 外部依赖（Redis、数据库、HTTP API） |

详见 [LinkLayer.md](./LinkLayer.md) 和 [Reference.md](./Reference.md)。

## 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Vue 3 + TypeScript |
| 状态管理 | Pinia |
| UI 组件 | Naive UI |
| 拓扑可视化 | AntV X6 |
| 构建工具 | Vite |

## License

MIT
