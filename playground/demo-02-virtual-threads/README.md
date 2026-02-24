# 靶场演练：虚拟线程 vs 平台线程 — 资源效率对比

> **核心命题**：在相同硬件约束下，平台线程 (Platform Threads) 的并发能力受限于内存（每线程 ~1MB 栈），而 JDK 21 虚拟线程 (Virtual Threads) 可以突破这一天花板。

本靶场通过 **4 档资源规格 × 2 种线程模式 = 8 组对照实验**，用真实流量验证上述理论。

## 🧠 实验原理

### 平台线程为什么有天花板？

每个平台线程（OS 线程）拥有独立的 **线程栈**（默认 `-Xss` = 1MB）。在 I/O 密集型场景下（如调用 500ms 的下游 API），线程在等待期间被完全阻塞，无法复用。因此：

```
可用于线程栈的内存 ≈ 容器总内存 - JVM 堆 (-Xmx) - Metaspace - OS 开销
最大线程数 ≈ 可用内存 / 1MB
最大 RPS ≈ 最大线程数 / 平均 RT (0.5s)
```

### 虚拟线程如何突破？

虚拟线程的栈帧存储在 **JVM 堆** 上，每个仅消耗几 KB。当遇到 I/O 阻塞时，虚拟线程会 **主动让出载体线程 (Carrier Thread)**，让其他虚拟线程继续执行。因此：

- 同样的内存可以承载 **数千甚至上万** 个并发请求
- 瓶颈从"线程数"转移到 **CPU 核数** 或 **下游吞吐能力**

### 预期结果矩阵

| 资源规格 | -Xmx | 平台线程 ~最大并发 | 平台线程 ~RPS | 虚拟线程瓶颈 |
|----------|------|-------------------|-------------|-------------|
| 1C 2G | 768m | ~1000 | ~2000 | CPU (1核) |
| 2C 4G | 1536m | ~2000 | ~4000 | 下游/连接 |
| 4C 8G | 3g | ~4000 | ~8000 | 下游/连接 |
| 8C 16G | 6g | ~8000 | ~16000 | 下游/连接 |

> 以上为理论估算，实际结果受 GC、上下文切换、连接池等因素影响，误差 ±20% 属正常。

## 🚀 快速开始

### 方式一：一键全自动（推荐，需要 Bash 环境）

```bash
cd playground/demo-02-virtual-threads
chmod +x run-benchmark.sh

# 跑全部 4 档 × 2 模式 = 8 轮实验 (总耗时约 20-30 分钟)
./run-benchmark.sh

# 或只跑某一档
./run-benchmark.sh 2c4g
```

脚本会自动遍历所有配置、启动/停止服务、采集 K6 数据，最终输出一张汇总对比表，所有原始日志保存在 `results/` 目录。

### 方式二：手动实验

<details>
<summary><b>Bash / macOS / Linux / WSL</b></summary>

```bash
cd playground/demo-02-virtual-threads

# ── 实验 A：2C4G + 平台线程 ──
export CONTAINER_CPUS=2 CONTAINER_MEMORY=4g JAVA_OPTS="-Xmx1536m"
export VIRTUAL_THREADS=false TOMCAT_MAX_THREADS=5000
docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js
docker-compose down -v

# ── 实验 B：2C4G + 虚拟线程 ──
export VIRTUAL_THREADS=true
docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js
docker-compose down -v
```

</details>

<details>
<summary><b>PowerShell / Windows</b></summary>

```powershell
cd playground\demo-02-virtual-threads

# docker-compose exec java-bff env

# ── 实验 A：4C8G + 平台线程 ──
$env:CONTAINER_CPUS="4"; $env:CONTAINER_MEMORY="8g"; $env:JAVA_OPTS="-Xms5734m -Xmx5734m -XX:+UseZGC"
$env:VIRTUAL_THREADS="false"; $env:TOMCAT_MAX_THREADS="5000"
docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js
docker-compose down -v

# ── 实验 B：4C8G + 虚拟线程 ──
$env:CONTAINER_CPUS="4"; $env:CONTAINER_MEMORY="8g"; $env:JAVA_OPTS="-Xms5734m -Xmx5734m -XX:+UseZGC"
$env:VIRTUAL_THREADS="true"
docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js
docker-compose down -v

# 清理环境变量
Remove-Item Env:CONTAINER_CPUS, Env:CONTAINER_MEMORY, Env:JAVA_OPTS, Env:VIRTUAL_THREADS, Env:TOMCAT_MAX_THREADS -ErrorAction SilentlyContinue
```

</details>

## ⚙️ 可调参数

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CONTAINER_CPUS` | `2` | 容器 CPU 核心数限制 |
| `CONTAINER_MEMORY` | `4g` | 容器内存上限 |
| `JAVA_OPTS` | `-Xmx1536m` | JVM 启动参数（堆大小等） |
| `TOMCAT_MAX_THREADS` | `5000` | Tomcat 最大线程数（设很高，让资源成为自然天花板） |
| `TOMCAT_ACCEPT_COUNT` | `2000` | 线程满时 TCP 等待队列长度 |
| `VIRTUAL_THREADS` | `false` | 是否启用 JDK 21 虚拟线程 |

## 🔬 如何解读结果

关注 K6 报告中的这几个关键指标：

| 指标 | 含义 | 看什么 |
|------|------|--------|
| `http_reqs` | 总请求数 & 每秒请求数 (RPS) | **核心吞吐量**，平台线程 vs 虚拟线程差异最大的指标 |
| `http_req_failed` | 失败率 | 平台线程在资源不足时会出现拒绝连接 |
| `http_req_duration` avg / p95 | 响应延迟 | 虚拟线程模式下延迟应更稳定 |
| `checks_succeeded` | 200 状态码比例 | 配合失败率判断服务是否崩溃 |

### 典型现象

- **平台线程 + 小规格**：随并发上升出现大量 `connection refused`，RPS 卡在天花板，p95 延迟飙升。
- **虚拟线程 + 同规格**：请求全部成功，RPS 大幅提升，延迟稳定在 ~500ms（等于下游 RT）。
- **虚拟线程的新瓶颈**：当 RPS 足够高时，`RestTemplate` 默认的 `HttpURLConnection`（无连接池）可能因 `TIME_WAIT` 端口耗尽成为新瓶颈——这本身也是一个很好的调优教学点。

## 🏗️ 架构

```
┌─────────┐       ┌───────────────────┐       ┌──────────────┐
│  K6     │──────▶│  java-bff (被测)   │──────▶│  slow-api    │
│ 发压引擎 │       │  CPU/MEM 受限      │       │  500ms 延迟   │
│         │       │  平台/虚拟线程可切换  │       │  (WireMock)  │
└─────────┘       └───────────────────┘       └──────────────┘
```
