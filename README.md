# Newbie Java Doctor

该系统致力于通过分层诊断模型，在压测时精准定位瓶颈，并在上线前提供基于硬件底座的最优配置集。系统将复杂的请求链路抽象为"节点"与"连线"，每个组件承载特定的性能属性。

- [LinkLayer](./LinkLayer.md)
- [Reference](./Reference.md)

---

## 一键采集容器参数

在目标容器（Linux）上执行以下命令，即可自动采集宿主容器层 + 运行时层的核心参数与配置，生成可直接导入的 JSON 文件。

### 远程执行

```bash
# 采集并保存到文件（推荐）
curl -fsSL https://raw.githubusercontent.com/null-object-0000/newbie-java-doctor/main/scripts/collect-params.sh | bash -s -- -o topology.json

# 采集并直接输出到终端
curl -fsSL https://raw.githubusercontent.com/null-object-0000/newbie-java-doctor/main/scripts/collect-params.sh | bash
```

> 如果容器中没有 `curl`，可以用 `wget`：
>
> ```bash
> wget -qO- https://raw.githubusercontent.com/null-object-0000/newbie-java-doctor/main/scripts/collect-params.sh | bash -s -- -o topology.json
> ```

### 本地执行

```bash
bash scripts/collect-params.sh -o topology.json
```

### 采集范围

| 层 | 类别 | 采集项 |
|---|---|---|
| 宿主容器层 | 核心参数 | vCPU、单核频率、内存、架构、磁盘类型、NIC 带宽、OS 版本、内核版本 |
| 宿主容器层 | 核心配置 | `tcp_tw_reuse`、`ip_local_port_range`、`tcp_max_tw_buckets`、`ulimit -n`、`fs.nr_open`、`fs.file-max` |
| 运行时层 | 核心参数 | JDK 版本 |
| 运行时层 | 核心配置 | GC 类型、JVM 启动参数、Tomcat 线程/连接配置（从进程参数 + Spring 配置文件推断） |

### 导入方式

1. 将生成的 `topology.json` 文件下载到本地
2. 打开 Web 页面，点击右上角 **「导入」** 按钮
3. 选择 JSON 文件即可

> **提示**：IOPS / 磁盘吞吐量 / PPS 等难以自动探测的参数使用默认值，客户端层参数（并发数、目标吞吐量等）属于压测目标需手动设置，导入后均可在页面上调整。
