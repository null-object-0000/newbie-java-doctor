#!/usr/bin/env bash
# ============================================================================
#  虚拟线程 vs 平台线程 — 全自动对比压测脚本
#
#  用法:
#    chmod +x run-benchmark.sh
#    ./run-benchmark.sh              # 跑全部 4 档 × 2 模式 = 8 轮
#    ./run-benchmark.sh 2c4g         # 只跑 2C4G 这一档
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

# ── 资源配置矩阵 ──────────────────────────────────────────────
#  格式: "CPU核数:容器内存:-Xmx"
declare -A PROFILES=(
  [1c2g]="1:2g:768m"
  [2c4g]="2:4g:1536m"
  [4c8g]="4:8g:3g"
  [8c16g]="8:16g:6g"
)
PROFILE_ORDER=(1c2g 2c4g 4c8g 8c16g)

# 如果传了参数，只跑指定档位
if [ $# -gt 0 ]; then
  PROFILE_ORDER=("$@")
fi

RESULTS_DIR="./results"
mkdir -p "$RESULTS_DIR"

# 首次构建镜像
echo "🔨 构建 Java 服务镜像 (仅首次耗时较久) ..."
docker-compose build java-bff

SUMMARY_FILE="$RESULTS_DIR/summary.md"
cat > "$SUMMARY_FILE" <<'HEADER'
# 虚拟线程 vs 平台线程 — 压测结果汇总

| 资源规格 | 线程模式 | 成功请求数 | 成功率 | 平均 RPS | 平均 RT | p95 RT |
|----------|----------|-----------|--------|---------|---------|--------|
HEADER

run_one() {
  local label=$1 cpus=$2 mem=$3 xmx=$4 vt=$5
  local mode; mode=$([ "$vt" = "true" ] && echo "virtual" || echo "platform")
  local tag="${label}_${mode}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🚀 实验: ${label} / ${mode} threads"
  echo "     CPU=${cpus}  MEM=${mem}  -Xmx=${xmx}  VIRTUAL_THREADS=${vt}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  export CONTAINER_CPUS="$cpus"
  export CONTAINER_MEMORY="$mem"
  export JAVA_OPTS="-Xmx${xmx}"
  export VIRTUAL_THREADS="$vt"
  export TOMCAT_MAX_THREADS=5000
  export TOMCAT_ACCEPT_COUNT=2000

  docker-compose down -v --remove-orphans 2>/dev/null || true

  echo "⏳ 启动服务 (等待健康检查通过) ..."
  docker-compose up -d

  # 等待 java-bff 健康
  local max_wait=120
  local waited=0
  while [ $waited -lt $max_wait ]; do
    if docker-compose ps java-bff 2>/dev/null | grep -q "(healthy)"; then
      echo "✅ 服务已就绪 (${waited}s)"
      break
    fi
    sleep 3
    waited=$((waited + 3))
    printf "."
  done

  if [ $waited -ge $max_wait ]; then
    echo "❌ 服务启动超时，跳过本轮"
    docker-compose logs java-bff > "$RESULTS_DIR/${tag}_error.log" 2>&1
    docker-compose down -v --remove-orphans 2>/dev/null || true
    return
  fi

  echo "🔥 开始压测 ..."
  docker-compose run --rm k6 run /scripts/test.js 2>&1 | tee "$RESULTS_DIR/${tag}.txt"

  # 从 K6 输出中提取关键指标并追加到汇总表
  local result_file="$RESULTS_DIR/${tag}.txt"
  local total_reqs avg_rt p95_rt success_rate rps
  total_reqs=$(grep 'http_reqs\b' "$result_file" | head -1 | awk '{print $2}')
  rps=$(grep 'http_reqs\b' "$result_file" | head -1 | awk '{print $3}' | tr -d '/s')
  avg_rt=$(grep 'http_req_duration\b' "$result_file" | head -1 | awk -F'=' '{print $2}' | awk '{print $1}')
  p95_rt=$(grep 'http_req_duration\b' "$result_file" | head -1 | awk -F'p\\(95\\)=' '{print $2}' | awk '{print $1}')
  local failed_line
  failed_line=$(grep 'http_req_failed' "$result_file" | head -1)
  local fail_pct
  fail_pct=$(echo "$failed_line" | awk '{print $2}')
  # 成功率 = 100% - 失败率
  success_rate=$(echo "$fail_pct" | awk -F'%' '{printf "%.2f%%", 100-$1}')

  echo "| ${label} | ${mode} | ${total_reqs:-N/A} | ${success_rate:-N/A} | ${rps:-N/A}/s | ${avg_rt:-N/A} | ${p95_rt:-N/A} |" >> "$SUMMARY_FILE"

  docker-compose down -v --remove-orphans 2>/dev/null || true
  echo "✅ 实验 ${tag} 完成"
}

# ── 主循环 ──────────────────────────────────────────────────
for profile in "${PROFILE_ORDER[@]}"; do
  if [ -z "${PROFILES[$profile]+x}" ]; then
    echo "⚠️  未知配置: $profile，跳过 (可选: ${!PROFILES[*]})"
    continue
  fi
  IFS=':' read -r cpus mem xmx <<< "${PROFILES[$profile]}"
  run_one "$profile" "$cpus" "$mem" "$xmx" "false"
  run_one "$profile" "$cpus" "$mem" "$xmx" "true"
done

echo ""
echo "🎉 全部实验完成！结果汇总:"
echo ""
cat "$SUMMARY_FILE"
echo ""
echo "📁 详细日志: $RESULTS_DIR/"
