#!/usr/bin/env bash
# ============================================================================
# collect-params.sh — 一键采集容器/宿主核心参数，输出可直接导入的 topology JSON
#
# 远程一键执行：
#   curl -fsSL https://raw.githubusercontent.com/null-object-0000/newbie-java-doctor/main/scripts/collect-params.sh | bash -s -- -o topology.json
#
# 本地用法：
#   bash collect-params.sh              # 输出 JSON 到 stdout
#   bash collect-params.sh -o file.json # 输出到文件
#   bash collect-params.sh --pretty     # 美化输出（需要 python3 或 jq）
#
# 采集范围：
#   宿主容器层 — 核心参数（CPU/内存/架构/磁盘/网络/OS）+ 核心配置（sysctl/ulimit）
#   运行时层   — 核心参数（JDK 版本）+ 核心配置（GC/JVM/Tomcat 从进程参数推断）
#
# 导入方式：在 Web 页面点击「导入」按钮，选择生成的 JSON 文件即可。
# ============================================================================

set -euo pipefail

OUTPUT_FILE=""
PRETTY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output) OUTPUT_FILE="$2"; shift 2 ;;
    --pretty)    PRETTY=true; shift ;;
    -h|--help)
      echo "用法: bash collect-params.sh [-o output.json] [--pretty]"
      exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ── 工具函数 ─────────────────────────────────────────────────────────────────

read_proc() { cat "$1" 2>/dev/null || echo ""; }

read_sysctl_val() {
  local path="/proc/sys/${1//./\/}"
  if [[ -r "$path" ]]; then
    cat "$path" 2>/dev/null | tr -d '\n'
  else
    echo ""
  fi
}

to_int() { printf '%.0f' "${1:-0}" 2>/dev/null || echo "0"; }

json_str() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g'; }

# ── 宿主容器层 · 核心参数 ───────────────────────────────────────────────────

# vCPU
VCPU=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo "1")

# 单核频率 (GHz)
CPU_MHZ=""
if command -v lscpu &>/dev/null; then
  CPU_MHZ=$(lscpu 2>/dev/null | awk -F: '/CPU max MHz|CPU MHz/ {gsub(/[[:space:]]/,"",$2); print $2; exit}')
fi
if [[ -z "$CPU_MHZ" ]]; then
  CPU_MHZ=$(awk '/cpu MHz/ {print $4; exit}' /proc/cpuinfo 2>/dev/null)
fi
if [[ -n "$CPU_MHZ" ]]; then
  CPU_GHZ=$(awk "BEGIN {printf \"%.1f\", ${CPU_MHZ}/1000}")
else
  CPU_GHZ="2.5"
fi

# 内存 (GB)
MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo "0")
MEM_GB=$(awk "BEGIN {printf \"%.0f\", ${MEM_KB}/1048576}")
[[ "$MEM_GB" -lt 1 ]] && MEM_GB=1

# 架构
ARCH_RAW=$(uname -m 2>/dev/null || echo "x86_64")
case "$ARCH_RAW" in
  x86_64|i686|i386) ARCH="x86" ;;
  aarch64|arm*)     ARCH="arm" ;;
  *)                ARCH="x86" ;;
esac

# 磁盘类型
DISK_TYPE="ssd"
if [[ -d /sys/block ]]; then
  for dev in /sys/block/sd* /sys/block/vd* /sys/block/nvme*; do
    [[ -e "$dev" ]] || continue
    rotational=$(cat "$dev/queue/rotational" 2>/dev/null || echo "")
    devname=$(basename "$dev")
    if [[ "$devname" == nvme* ]]; then
      DISK_TYPE="nvme"; break
    elif [[ "$rotational" == "0" ]]; then
      DISK_TYPE="ssd"
    elif [[ "$rotational" == "1" ]]; then
      DISK_TYPE="hdd"
    fi
  done
fi

# IOPS / 磁盘吞吐量（难以自动探测，使用合理默认值）
IOPS_LIMIT=10000
DISK_THROUGHPUT=500

# NIC 带宽 (Gbps)
NIC_SPEED_MBPS=""
for iface in /sys/class/net/*; do
  name=$(basename "$iface")
  [[ "$name" == "lo" ]] && continue
  speed=$(cat "$iface/speed" 2>/dev/null || echo "")
  if [[ -n "$speed" && "$speed" != "-1" && "$speed" -gt 0 ]] 2>/dev/null; then
    if [[ -z "$NIC_SPEED_MBPS" || "$speed" -gt "$NIC_SPEED_MBPS" ]]; then
      NIC_SPEED_MBPS="$speed"
    fi
  fi
done
if [[ -n "$NIC_SPEED_MBPS" ]]; then
  NIC_GBPS=$(awk "BEGIN {printf \"%.0f\", ${NIC_SPEED_MBPS}/1000}")
  [[ "$NIC_GBPS" -lt 1 ]] && NIC_GBPS=1
else
  NIC_GBPS=10
fi

PPS_LIMIT=1000000

# OS 版本
OS_VERSION=""
if [[ -f /etc/os-release ]]; then
  OS_VERSION=$(. /etc/os-release && echo "${PRETTY_NAME:-${NAME:-Unknown} ${VERSION:-}}")
fi
[[ -z "$OS_VERSION" ]] && OS_VERSION=$(cat /etc/redhat-release 2>/dev/null || echo "Unknown")

# 内核版本
KERNEL_VERSION=$(uname -r 2>/dev/null || echo "unknown")

# ── 宿主容器层 · 核心配置 ───────────────────────────────────────────────────

TCP_TW_REUSE=$(read_sysctl_val "net.ipv4.tcp_tw_reuse")
[[ -z "$TCP_TW_REUSE" ]] && TCP_TW_REUSE=1

IP_LOCAL_PORT_RANGE=$(read_sysctl_val "net.ipv4.ip_local_port_range")
IP_LOCAL_PORT_RANGE=$(echo "$IP_LOCAL_PORT_RANGE" | sed 's/\t/ /g; s/  */ /g; s/^ //; s/ $//')
[[ -z "$IP_LOCAL_PORT_RANGE" ]] && IP_LOCAL_PORT_RANGE="32768 60999"

TCP_MAX_TW_BUCKETS=$(read_sysctl_val "net.ipv4.tcp_max_tw_buckets")
[[ -z "$TCP_MAX_TW_BUCKETS" ]] && TCP_MAX_TW_BUCKETS=5000

ULIMIT_N=$(ulimit -n 2>/dev/null || echo "65535")
FS_NR_OPEN=$(read_sysctl_val "fs.nr_open")
[[ -z "$FS_NR_OPEN" ]] && FS_NR_OPEN=65535
FS_FILE_MAX=$(read_sysctl_val "fs.file-max")
[[ -z "$FS_FILE_MAX" ]] && FS_FILE_MAX=2097152

# ── 运行时层 · 从 Java 进程采集 ─────────────────────────────────────────────

JDK_VERSION=""
GC_TYPE="G1GC"
JVM_OPTIONS=""
TOMCAT_MAX_THREADS=200
TOMCAT_MIN_SPARE=10
TOMCAT_MAX_CONNECTIONS=10000
TOMCAT_ACCEPT_COUNT=100
VIRTUAL_THREADS=true

# 尝试从正在运行的 Java 进程获取 JVM 参数
JAVA_PID=""
if command -v pgrep &>/dev/null; then
  JAVA_PID=$(pgrep -x java 2>/dev/null | head -1 || true)
fi
if [[ -z "$JAVA_PID" ]]; then
  JAVA_PID=$(ps -eo pid,comm 2>/dev/null | awk '$2=="java" {print $1; exit}' || true)
fi

if [[ -n "$JAVA_PID" && -r "/proc/$JAVA_PID/cmdline" ]]; then
  CMDLINE=$(tr '\0' ' ' < "/proc/$JAVA_PID/cmdline" 2>/dev/null || true)

  # JVM 启动参数
  JVM_OPTS_RAW=$(echo "$CMDLINE" | grep -oP '(-X\S+|-D\S+|--add-\S+)' | tr '\n' ' ' | sed 's/ $//')
  [[ -n "$JVM_OPTS_RAW" ]] && JVM_OPTIONS="$JVM_OPTS_RAW"

  # GC 类型推断
  if echo "$CMDLINE" | grep -qiP '(UseZGC|ZGenerational)'; then
    GC_TYPE="ZGC"
  elif echo "$CMDLINE" | grep -qi 'UseShenandoahGC'; then
    GC_TYPE="Shenandoah"
  elif echo "$CMDLINE" | grep -qi 'UseConcMarkSweepGC'; then
    GC_TYPE="CMS"
  elif echo "$CMDLINE" | grep -qi 'UseParallelGC'; then
    GC_TYPE="Parallel"
  elif echo "$CMDLINE" | grep -qi 'UseG1GC'; then
    GC_TYPE="G1GC"
  elif echo "$CMDLINE" | grep -qi 'UseSerialGC'; then
    GC_TYPE="Serial"
  fi

  # Spring Boot Tomcat 相关（从 -D 参数读取）
  val=$(echo "$CMDLINE" | grep -oP '(?<=-Dserver\.tomcat\.threads\.max=)\d+' || true)
  [[ -n "$val" ]] && TOMCAT_MAX_THREADS=$val
  val=$(echo "$CMDLINE" | grep -oP '(?<=-Dserver\.tomcat\.threads\.min-spare=)\d+' || true)
  [[ -n "$val" ]] && TOMCAT_MIN_SPARE=$val
  val=$(echo "$CMDLINE" | grep -oP '(?<=-Dserver\.tomcat\.max-connections=)\d+' || true)
  [[ -n "$val" ]] && TOMCAT_MAX_CONNECTIONS=$val
  val=$(echo "$CMDLINE" | grep -oP '(?<=-Dserver\.tomcat\.accept-count=)\d+' || true)
  [[ -n "$val" ]] && TOMCAT_ACCEPT_COUNT=$val

  if echo "$CMDLINE" | grep -q 'spring.threads.virtual.enabled=false'; then
    VIRTUAL_THREADS=false
  fi
fi

# JDK 版本：优先从进程的 java 二进制获取，否则用 PATH 里的 java
detect_jdk_version() {
  local java_bin="$1"
  local ver_output
  ver_output=$("$java_bin" -version 2>&1 || true)
  echo "$ver_output" | head -1 | sed 's/.*"\(.*\)".*/\1/' | cut -d. -f1 | sed 's/^1$/1.8/'
}

if [[ -n "$JAVA_PID" && -r "/proc/$JAVA_PID/exe" ]]; then
  JAVA_BIN=$(readlink -f "/proc/$JAVA_PID/exe" 2>/dev/null || true)
  if [[ -n "$JAVA_BIN" && -x "$JAVA_BIN" ]]; then
    JDK_VERSION=$(detect_jdk_version "$JAVA_BIN")
  fi
fi
if [[ -z "$JDK_VERSION" ]] && command -v java &>/dev/null; then
  JDK_VERSION=$(detect_jdk_version java)
fi
[[ -z "$JDK_VERSION" ]] && JDK_VERSION="21"

# 尝试读取 Spring Boot application.properties / application.yml 中的 Tomcat 配置
detect_spring_config() {
  local search_dirs=("/app" "/opt" "/home" ".")
  local found=""
  for dir in "${search_dirs[@]}"; do
    [[ -d "$dir" ]] || continue
    found=$(find "$dir" -maxdepth 5 -name "application.properties" -o -name "application.yml" -o -name "application.yaml" 2>/dev/null | head -3)
    [[ -n "$found" ]] && break
  done
  [[ -z "$found" ]] && return

  while IFS= read -r cfg_file; do
    [[ -r "$cfg_file" ]] || continue

    if [[ "$cfg_file" == *.properties ]]; then
      local v
      v=$(grep -oP '(?<=server\.tomcat\.threads\.max=)\d+' "$cfg_file" 2>/dev/null || true)
      [[ -n "$v" ]] && TOMCAT_MAX_THREADS=$v
      v=$(grep -oP '(?<=server\.tomcat\.threads\.min-spare=)\d+' "$cfg_file" 2>/dev/null || true)
      [[ -n "$v" ]] && TOMCAT_MIN_SPARE=$v
      v=$(grep -oP '(?<=server\.tomcat\.max-connections=)\d+' "$cfg_file" 2>/dev/null || true)
      [[ -n "$v" ]] && TOMCAT_MAX_CONNECTIONS=$v
      v=$(grep -oP '(?<=server\.tomcat\.accept-count=)\d+' "$cfg_file" 2>/dev/null || true)
      [[ -n "$v" ]] && TOMCAT_ACCEPT_COUNT=$v

      if grep -q 'spring.threads.virtual.enabled=true' "$cfg_file" 2>/dev/null; then
        VIRTUAL_THREADS=true
      elif grep -q 'spring.threads.virtual.enabled=false' "$cfg_file" 2>/dev/null; then
        VIRTUAL_THREADS=false
      fi
    fi
  done <<< "$found"
}
detect_spring_config

# ── 组装 JSON ────────────────────────────────────────────────────────────────

# Logback 核心配置使用合理默认值（日志配置通常存在 XML 中，自动解析复杂度高）
LOGBACK_MAX_FILE_SIZE="100MB"
LOGBACK_MAX_HISTORY=30
LOGBACK_QUEUE_SIZE=256
LOGBACK_DISCARDING_THRESHOLD=20
LOGBACK_MAX_FLUSH_TIME_MS=5000
LOGBACK_NEVER_BLOCK=false

cat_json() {
cat << ENDJSON
{
  "nodes": [
    {
      "id": "n-client-default",
      "layerId": "client",
      "label": "客户端层",
      "nodeSource": "default",
      "x": 0,
      "y": 0,
      "params": {
        "businessScenario": "io",
        "concurrentUsers": 100,
        "targetThroughputRps": 500,
        "expectedFailureRatePercent": 0
      },
      "config": {}
    },
    {
      "id": "n-host-default",
      "layerId": "host",
      "label": "宿主容器层",
      "nodeSource": "default",
      "x": 0,
      "y": 250,
      "params": {
        "spec": {
          "vCpu": ${VCPU},
          "cpuFreqGhz": ${CPU_GHZ},
          "memoryGb": ${MEM_GB},
          "architecture": "${ARCH}"
        },
        "storage": {
          "diskType": "${DISK_TYPE}",
          "iopsLimit": ${IOPS_LIMIT},
          "throughputMbPerSec": ${DISK_THROUGHPUT}
        },
        "network": {
          "nicBandwidthGbps": ${NIC_GBPS},
          "ppsLimit": ${PPS_LIMIT}
        },
        "os": {
          "osVersion": "$(json_str "$OS_VERSION")",
          "kernelVersion": "$(json_str "$KERNEL_VERSION")"
        }
      },
      "config": {
        "net": {
          "tcpTwReuse": $(to_int "$TCP_TW_REUSE"),
          "ipLocalPortRange": "$(json_str "$IP_LOCAL_PORT_RANGE")",
          "tcpMaxTwBuckets": $(to_int "$TCP_MAX_TW_BUCKETS")
        },
        "fs": {
          "ulimitN": $(to_int "$ULIMIT_N"),
          "fsNrOpen": $(to_int "$FS_NR_OPEN"),
          "fsFileMax": $(to_int "$FS_FILE_MAX")
        }
      }
    },
    {
      "id": "n-runtime-default",
      "layerId": "runtime",
      "label": "运行时层",
      "nodeSource": "default",
      "x": 0,
      "y": 500,
      "params": {
        "jdkVersion": "$(json_str "$JDK_VERSION")",
        "logLinesPerRequest": 5,
        "logSizeBytesPerRequest": 512
      },
      "config": {
        "gc": "$(json_str "$GC_TYPE")",
        "jvmOptions": "$(json_str "$JVM_OPTIONS")",
        "virtualThreadsEnabled": ${VIRTUAL_THREADS},
        "tomcatMaxThreads": ${TOMCAT_MAX_THREADS},
        "tomcatMinSpareThreads": ${TOMCAT_MIN_SPARE},
        "tomcatMaxConnections": ${TOMCAT_MAX_CONNECTIONS},
        "tomcatAcceptCount": ${TOMCAT_ACCEPT_COUNT},
        "logbackMaxFileSize": "${LOGBACK_MAX_FILE_SIZE}",
        "logbackMaxHistory": ${LOGBACK_MAX_HISTORY},
        "logbackQueueSize": ${LOGBACK_QUEUE_SIZE},
        "logbackDiscardingThreshold": ${LOGBACK_DISCARDING_THRESHOLD},
        "logbackMaxFlushTimeMs": ${LOGBACK_MAX_FLUSH_TIME_MS},
        "logbackNeverBlock": ${LOGBACK_NEVER_BLOCK}
      }
    }
  ],
  "edges": [
    {
      "id": "e-n-client-default-n-host-default",
      "source": "n-client-default",
      "target": "n-host-default",
      "params": {
        "networkEnv": "intra_dc",
        "messageSizeBytes": 1024
      }
    },
    {
      "id": "e-n-host-default-n-runtime-default",
      "source": "n-host-default",
      "target": "n-runtime-default"
    }
  ]
}
ENDJSON
}

# 输出采集摘要到 stderr（不影响 JSON 管道）
summary() {
  echo "┌─────────────────────────────────────────────────────────" >&2
  echo "│ 容器参数采集完成" >&2
  echo "├─────────────────────────────────────────────────────────" >&2
  echo "│ 宿主容器层" >&2
  echo "│   vCPU:        ${VCPU}" >&2
  echo "│   频率:        ${CPU_GHZ} GHz" >&2
  echo "│   内存:        ${MEM_GB} GB" >&2
  echo "│   架构:        ${ARCH} (${ARCH_RAW})" >&2
  echo "│   磁盘类型:    ${DISK_TYPE}" >&2
  echo "│   NIC 带宽:    ${NIC_GBPS} Gbps" >&2
  echo "│   OS:          ${OS_VERSION}" >&2
  echo "│   Kernel:      ${KERNEL_VERSION}" >&2
  echo "│   tcp_tw_reuse:       ${TCP_TW_REUSE}" >&2
  echo "│   ip_local_port_range: ${IP_LOCAL_PORT_RANGE}" >&2
  echo "│   tcp_max_tw_buckets: ${TCP_MAX_TW_BUCKETS}" >&2
  echo "│   ulimit -n:   ${ULIMIT_N}" >&2
  echo "│   fs.nr_open:  ${FS_NR_OPEN}" >&2
  echo "│   fs.file-max: ${FS_FILE_MAX}" >&2
  echo "├─────────────────────────────────────────────────────────" >&2
  echo "│ 运行时层" >&2
  echo "│   JDK 版本:    ${JDK_VERSION}" >&2
  echo "│   GC:          ${GC_TYPE}" >&2
  if [[ -n "$JAVA_PID" ]]; then
    echo "│   Java PID:    ${JAVA_PID}" >&2
  else
    echo "│   Java PID:    (未检测到运行中的 Java 进程)" >&2
  fi
  if [[ -n "$JVM_OPTIONS" ]]; then
    echo "│   JVM Options: ${JVM_OPTIONS:0:80}..." >&2
  else
    echo "│   JVM Options: (默认值)" >&2
  fi
  echo "│   Tomcat:      max-threads=${TOMCAT_MAX_THREADS}, max-connections=${TOMCAT_MAX_CONNECTIONS}" >&2
  echo "└─────────────────────────────────────────────────────────" >&2
}

summary

# 输出 JSON
if [[ -n "$OUTPUT_FILE" ]]; then
  if $PRETTY; then
    if command -v python3 &>/dev/null; then
      cat_json | python3 -m json.tool > "$OUTPUT_FILE"
    elif command -v jq &>/dev/null; then
      cat_json | jq '.' > "$OUTPUT_FILE"
    else
      cat_json > "$OUTPUT_FILE"
    fi
  else
    cat_json > "$OUTPUT_FILE"
  fi
  echo "✓ JSON 已写入: ${OUTPUT_FILE}" >&2
else
  if $PRETTY; then
    if command -v python3 &>/dev/null; then
      cat_json | python3 -m json.tool
    elif command -v jq &>/dev/null; then
      cat_json | jq '.'
    else
      cat_json
    fi
  else
    cat_json
  fi
fi
