# 靶场演练：被慢依赖拖垮的聚合服务 (I/O Bound)

这是一个用于验证 `Capa Tuner` 算法准确性的真实压测沙盒。模拟了一个常见线上故障：**下游第三方 API 响应缓慢，导致自身 Tomcat 线程池迅速耗尽，并发暴跌。**

## 🧪 演练步骤

1. **理论推演**：在 Capa Tuner 在线工具中加载本案例，计算出理论天花板为 **400 QPS**。
2. **构建并启动靶场**：
   ```bash
   docker-compose up -d
   ```
3. **注入流量**：
   ```bash
   docker-compose run --rm k6 run /scripts/test.js
   ```
4. **验证结果**：等待压测结束，K6 报告中的 `http_reqs` (成功吞吐量) 将精准卡在 **~400 RPS** 左右。

## ⚙️ 可调参数

关键参数已外置为环境变量，**修改后只需 `docker-compose up -d` 重启，无需 rebuild**：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `TOMCAT_MAX_THREADS` | `200` | Tomcat 最大工作线程数 |
| `TOMCAT_MIN_SPARE` | `50` | Tomcat 最小空闲线程数 |
| `TOMCAT_ACCEPT_COUNT` | `100` | 线程满时 TCP 等待队列长度 |
| `VIRTUAL_THREADS` | `false` | 是否启用 JDK 21 虚拟线程 |

### 对比实验示例

<details>
<summary><b>Bash / macOS / Linux</b></summary>

```bash
# 实验 1：200 平台线程 (理论天花板 200/0.5s = 400 RPS)
VIRTUAL_THREADS=false docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js

# 实验 2：200 虚拟线程 (突破线程池瓶颈)
VIRTUAL_THREADS=true docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js

# 实验 3：50 平台线程 (理论天花板 50/0.5s = 100 RPS)
TOMCAT_MAX_THREADS=50 VIRTUAL_THREADS=false docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js
```

</details>

<details>
<summary><b>PowerShell / Windows</b></summary>

```powershell
# 实验 1：200 平台线程 (理论天花板 200/0.5s = 400 RPS)
$env:VIRTUAL_THREADS="false"; docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js

# 实验 2：虚拟线程 (突破线程池瓶颈)
$env:VIRTUAL_THREADS="true"; docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js

# 实验 3：50 平台线程 (理论天花板 50/0.5s = 100 RPS)
$env:TOMCAT_MAX_THREADS="50"; $env:VIRTUAL_THREADS="false"; docker-compose up -d
docker-compose run --rm k6 run /scripts/test.js

# 实验结束后清理环境变量
Remove-Item Env:TOMCAT_MAX_THREADS, Env:VIRTUAL_THREADS -ErrorAction SilentlyContinue
```

</details>