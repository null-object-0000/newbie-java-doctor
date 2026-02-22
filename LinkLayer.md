# 链路分层

* 文档中的 **环境约束**（硬件/基础设施的物理边界） 是使用者提供的并且不能或很难修改的，**负载目标**（业务方的性能期望和负载画像） 是业务方定义的性能要求，**可调配置**（调优旋钮） 则是可以基于环境约束与负载目标来调整或自动计算推荐的。

## 1. Client Layer (客户端层)

**定位**：流量的发令枪与性能 KPI 的定义者。

**负载目标**：

* **业务场景**：IO 密集型/计算密集型
* **网络环境**：公网/内网（同中心/跨中心）
* **报文大小**
* **并发用户数**：同时发起请求的模拟用户数。
* **目标吞吐量**：系统必须达到的每秒请求数。
* **预期失败率**：默认为 0%，不允许有失败请求。

## 2. Access Layer (接入网关层)

    往往此环节完全由运维角色管控，本方案暂时不将其纳入调优和排障方向中，仅用以完善链路。

**定位**：流量的咽喉，管理连接的建立与分发。

**核心节点**：Tengine / Nginx / API Gateway。

## 3. Host Layer (宿主容器层)

**定位**：物理边界，决定了资源的"天花板"与 OS 内核行为。

**环境约束**：

* **规格维度 (Computing Specification)**：
  * **CPU**：逻辑核数（vCPU）、单核频率（影响计算密集型任务的 RT）。
  * **内存**：物理内存（决定了 JVM 堆内存与堆外内存的分配上限）。
  * **Architecture**：X86 或 ARM（影响指令集效率及某些库的性能）。
* **存储维度 (Storage / IOPS)**：
  * **Disk Type**：SSD / NVMe / HDD。
  * **IOPS 上限**：每秒读写次数。
  * **Throughput**：磁盘吞吐量 (MB/s)。
* **网络维度 (Network Throughput)**：
  * **NIC 带宽**: 10Gbps / 25Gbps 网卡。
  * **PPS 上限**: 每秒包转发率（高并发小报文场景下的隐形瓶颈）。
* **软件环境与内核 (OS & Kernel)**：
  * **OS Version**: 如 AlmaLinux, Ubuntu, Centos 7/8。
  * **Kernel Version**: 影响是否支持某些高性能特性（如 io_uring, BBR）。

**可调配置**：

* **net**：
  * **net.ipv4.tcp_tw_reuse**：允许使用处于TIME-WAIT状态的socket（即TIME-WAIT状态的端口）进行新的TCP连接。取值范围：0：关。1：全局开启。2：只对loopback开启。
  * **net.ipv4.ip_local_port_range**：端口号范围。
  * **net.ipv4.tcp_max_tw_buckets**：允许最多timewait状态的TCP连接数。
* **fs**：
  * **ulimit -n/fs.nr_open/fs.file-max**：一个进程允许的最大打开文件句柄数量。

## 4 Application Layer (应用层)

### 4.1 Runtime Layer (运行时层)

**定位**：业务逻辑执行体与 Java 运行时。

**环境约束**：

* **运行时**：
  * **JDK 版本**

**负载目标**：

* **日志条数**：单次请求所产生的日志条数。
* **日志大小**：单次请求所产生的所有日志大小。

**可调配置**：

* **运行时**：
  * **垃圾回收器**
  * **JVM 配置**
* **Web 容器**：
  * **Spring Boot**：
    * **spring.threads.virtual.enabled**：Whether to use virtual threads.
    * **Tomcat**：
      * **server.tomcat.threads.max**：Maximum amount of worker threads. Doesn't have an effect if virtual threads are enabled.
      * **server.tomcat.threads.min-spare**：Minimum amount of worker threads. Doesn't have an effect if virtual threads are enabled.
      * **server.tomcat.max-connections**：Maximum number of connections that the server accepts and processes at any given time.
      * **server.tomcat.accept-count**：Maximum queue length for incoming connection requests when all possible request processing threads are in use.
* **日志组件**：
  * **Logback**：
    * **Appender**：
      * **RollingFileAppender**：
        * **maxFileSize**：Each time the current log file reaches maxFileSize before the current time period ends, it will be archived with an increasing index, starting at 0.
        * **maxHistory**：The optional maxHistory property controls the maximum number of archive files to keep, asynchronously deleting older files.
      * **AsyncAppender**：
        * **queueSize**：The maximum capacity of the blocking queue. By default, queueSize is set to 256.
        * **discardingThreshold**：By default, when the blocking queue has 20% capacity remaining, it will drop events of level TRACE, DEBUG and INFO, keeping only events of level WARN and ERROR. To keep all events, set discardingThreshold to 0.
        * **maxFlushTime**：When the LoggerContext is stopped, the AsyncAppender stop method waits up to this timeout for the worker thread to complete. Use maxFlushTime to specify a maximum queue flush timeout in milliseconds. Events that cannot be processed within this window are discarded.
        * **neverBlock**：If false (the default) the appender will block on appending to a full queue rather than losing the message. Set to true and the appender will just drop the message and will not block your application.

### 4.2 Dependency Layer (依赖层)

**定位**：应用向外请求资源的闸门，需兼顾 **自身驱动配置 (Client)** 与 **目标服务水位 (Server)** 的勾稽关系。

**环境约束**：

* **依赖的 Client 类型**
* **网络环境**：公网/内网（同中心/跨中心）
* **报文大小**
* **Redis Server**：
  * **内存容量**
  * **分片数量**
* **Database Server**：
  * **引擎**
  * **CPU**
  * **内存**
  * **最大连接数**
  * **最大IOPS**
  * **储存空间**

**负载目标**：

* **三方服务 / API**：
  * **QPS**：对方提供的限流阈值（如每秒允许 500 次请求）。
  * **SLA RT**：对方承诺的标准响应耗时（还需考虑网络传输耗时）。

**可调配置**：

* **HTTP Client**：
  * **Java HTTP Client**：
    * **version**
    * **executor**
    * **timeout**：Sets a timeout for this request.
  * **OkHttp**
    * **Dispatcher.MaxRequestsPerHost**：The maximum number of requests for each host to execute concurrently. This limits requests by the URL's host name. Note that concurrent requests to a single IP address may still exceed this limit: multiple hostnames may share an IP address or be routed through the same HTTP proxy.
    * **Dispatcher.MaxRequests**：The maximum number of requests to execute concurrently. Above this requests queue in memory, waiting for the running calls to complete.
    * **ConnectionPool.MaxIdleConnections**
    * **ConnectionPool.KeepAliveDuration**
    * **connectTimeout**：Sets the default connect timeout for new connections.
    * **readTimeout**：Sets the default read timeout for new connections.
    * **writeTimeout**：Sets the default write timeout for new connections.
  * **Apache HttpClient**：
    * **MaxConnTotal**：maximum total connection value.
    * **MaxConnPerRoute**：maximum connection per route value.
    * **ConnectionConfig.TimeToLive**：Defines the total span of time connections can be kept alive or execute requests.
    * **connectionRequestTimeout**：the connection lease request timeout used when requesting a connection from the connection manager.
    * **responseTimeout**：Determines the timeout until arrival of a response from the opposite endpoint.
* **Redis Client**：
  * **Jedis**
  * **Lettuce**
  * **Redisson**
