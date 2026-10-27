#!/bin/bash
# 推送后的线上验证：确认 GitHub Pages 已部署到最新版本
# 用法：bash scripts/verify_online_deploy.sh
set -u

BASE="https://brunsonliu.github.io/Age-of-Discovery"

echo "=== 1. 第三批场景图是否已上线（d15/d25 之前是 404）==="
for f in d15 d20 d25; do
  printf "  %s.png -> " "$f"
  curl -s -o /dev/null -w "%{http_code}\n" --noproxy '*' --max-time 20 "$BASE/assets/scenes/$f.png"
done

echo
echo "=== 2. 已被删除的 ocean.geojson 应为 404（本地已删）==="
printf "  ocean.geojson -> "
curl -s -o /dev/null -w "%{http_code}\n" --noproxy '*' --max-time 20 "$BASE/data/ocean.geojson"

echo
echo "=== 3. 构建指纹（index-*.js）==="
curl -s --noproxy '*' --max-time 20 "$BASE/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1

echo
echo "=== 4. 页面可用性 ==="
curl -s -o /dev/null -w "  index.html -> %{http_code}\n" --noproxy '*' --max-time 20 "$BASE/"

echo
echo "=== 5. 本地 git 状态 ==="
cd "$(dirname "$0")/.." 2>/dev/null
git rev-list --count origin/main..HEAD 2>/dev/null | xargs -I{} echo "  未推送提交数: {}"
