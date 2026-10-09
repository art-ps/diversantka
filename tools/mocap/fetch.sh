#!/usr/bin/env bash
# Скачивает исходные BVH (конвертация cgspeed базы CMU, зеркало github.com/Shriinivas/cmubvh)
# в tools/mocap/.cache. В git не попадают. Без аргументов — все источники из clips.json.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .cache
if [ $# -gt 0 ]; then
  ids="$*"
else
  ids=$(node -e "console.log([...new Set(JSON.parse(require('fs').readFileSync('clips.json','utf8')).map(c => c.source))].join(' '))")
fi
tree=""
for id in $ids; do
  [ -f ".cache/$id.bvh" ] && continue
  [ -n "$tree" ] || tree=$(curl -fsSL "https://api.github.com/repos/Shriinivas/cmubvh/git/trees/main?recursive=1")
  path=$(printf '%s' "$tree" | grep -o "\"path\": *\"[^\"]*/Data/${id}\.zip\"" | head -1 | sed -E 's/.*"(Sequence[^"]*)"$/\1/')
  if [ -z "$path" ]; then echo "нет клипа $id в зеркале" >&2; exit 1; fi
  curl -fsSL "https://raw.githubusercontent.com/Shriinivas/cmubvh/main/$path" -o ".cache/$id.zip"
  rm -rf ".cache/$id.tmp"
  unzip -o -q ".cache/$id.zip" -d ".cache/$id.tmp"
  bvh=$(find ".cache/$id.tmp" -name '*.bvh' | head -1)
  if [ -z "$bvh" ]; then echo "в архиве $id нет .bvh" >&2; exit 1; fi
  mv "$bvh" ".cache/$id.bvh"
  rm -rf ".cache/$id.zip" ".cache/$id.tmp"
  echo "скачан $id"
done
