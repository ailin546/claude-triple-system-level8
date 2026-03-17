#!/usr/bin/env bash
# fetch_trending.sh - Find AI & crypto repos ranked by TODAY's star gains
# Strategy:
#   1. OSSInsight API (past_24_hours trending) - best source for daily star data
#   2. GitHub Search API (recently created/pushed + high stars) - supplement
#   3. Filter & classify by AI/crypto keywords
# Usage: ./fetch_trending.sh [output_dir]

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="${1:-${PROJECT_DIR}/output}"
DATE=$(date +%Y-%m-%d)
OUTPUT_FILE="${OUTPUT_DIR}/trending_${DATE}.json"
mkdir -p "$OUTPUT_DIR"

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "=== Fetching today's trending AI & crypto repos (${DATE}) ==="

# --- Step 1: OSSInsight API - repos trending in past 24 hours ---
echo ""
echo "Step 1: Fetching from OSSInsight (past 24h trending)..."

curl -sL "https://api.ossinsight.io/v1/trends/repos?period=past_24_hours&limit=100" \
  -o "${TEMP_DIR}/ossinsight_raw.json" 2>/dev/null

python3 - "${TEMP_DIR}/ossinsight_raw.json" > "${TEMP_DIR}/all_repos.jsonl" 2>/dev/null << 'PARSE_OSSINSIGHT'
import json, sys

data = json.load(open(sys.argv[1]))
rows = data.get('data', {}).get('rows', [])

for r in rows:
    repo = {
        'full_name': r.get('repo_name', ''),
        'description': r.get('description', '') or '',
        'stars': int(r.get('stars', 0)),
        'stars_today': int(r.get('stars', 0)),
        'language': r.get('primary_language', '') or '',
        'score': float(r.get('total_score', 0)),
        'source': 'ossinsight'
    }
    print(json.dumps(repo))
PARSE_OSSINSIGHT

OSSINSIGHT_COUNT=$(wc -l < "${TEMP_DIR}/all_repos.jsonl" | tr -d ' ')
echo "  Got ${OSSINSIGHT_COUNT} repos from OSSInsight"

# --- Step 2: GitHub Search API - recently active AI/crypto repos ---
echo ""
echo "Step 2: Fetching from GitHub Search API (topic-based)..."

if date -v-1d +%Y-%m-%d >/dev/null 2>&1; then
  YESTERDAY=$(date -v-1d +%Y-%m-%d)
else
  YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
fi

TOPICS_AI=("llm" "machine-learning" "deep-learning" "generative-ai" "langchain" "transformers" "computer-vision" "nlp" "ai-agent")
TOPICS_CRYPTO=("blockchain" "defi" "smart-contract" "web3" "solidity" "ethereum" "bitcoin" "cryptocurrency")

fetch_gh_topic() {
  local topic="$1"
  local category="$2"

  gh api search/repositories \
    --method GET \
    -f q="topic:${topic} pushed:>=${YESTERDAY} stars:>=20" \
    -f sort=updated \
    -f order=desc \
    -f per_page=30 \
    --jq ".items[] | {
      full_name: .full_name,
      description: (.description // \"\"),
      stars: .stargazers_count,
      stars_today: 0,
      language: (.language // \"\"),
      score: 0,
      source: \"github_api\",
      topics: .topics,
      category_hint: \"${category}\",
      license: (.license.spdx_id // \"\"),
      open_issues: .open_issues_count
    }" 2>/dev/null || true
}

for topic in "${TOPICS_AI[@]}"; do
  echo "  Searching topic: ${topic}"
  fetch_gh_topic "$topic" "ai" >> "${TEMP_DIR}/all_repos.jsonl"
  sleep 2
done

for topic in "${TOPICS_CRYPTO[@]}"; do
  echo "  Searching topic: ${topic}"
  fetch_gh_topic "$topic" "crypto" >> "${TEMP_DIR}/all_repos.jsonl"
  sleep 2
done

# --- Step 3: Classify, deduplicate, rank ---
echo ""
echo "Step 3: Classifying and ranking..."

python3 - "${TEMP_DIR}/all_repos.jsonl" "$OUTPUT_FILE" << 'PYTHON_SCRIPT'
import json, re, sys

AI_PATTERN = re.compile(
    r'artificial.intelligence|machine.learning|deep.learning|llm|large.language|'
    r'generative.ai|transformer|neural.network|computer.vision|nlp|natural.language|'
    r'gpt|diffusion|stable.diffusion|langchain|rag|retrieval.augmented|fine.tun|'
    r'tokeniz|embedding|inference|onnx|pytorch|tensorflow|keras|hugging.?face|'
    r'openai|anthropic|claude|gemini|llama|mistral|agent|autonomous|multimodal|'
    r'vision.language|text.to|speech|ocr|yolo|detection|segmentation|reinforcement|'
    r'ml.ops|mlops|data.science|feature.store|vector.database|chatbot|copilot|'
    r'ai.code|prompt|lora|quantiz|vllm|ollama|langflow|dify|langraph|crew.?ai|'
    r'autogen|semantic.kernel|ai.gateway|model.serving|training|dataset',
    re.IGNORECASE
)

CRYPTO_PATTERN = re.compile(
    r'blockchain|cryptocurrency|crypto|defi|decentralized.finance|smart.contract|'
    r'solidity|web3|ethereum|bitcoin|btc|eth|token|nft|dao|dapp|wallet|consensus|'
    r'mining|staking|swap|liquidity|amm|bridge|layer.2|l2|rollup|zk.proof|'
    r'zero.knowledge|merkle|evm|solana|polygon|avalanche|cosmos|substrate|polkadot|'
    r'cardano|rust.crypto|anchor|hardhat|foundry|truffle|metamask|uniswap|aave|chain',
    re.IGNORECASE
)

seen = {}
repos = []

input_file = sys.argv[1]
output_file = sys.argv[2]

with open(input_file) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except Exception:
            continue

        name = r.get('full_name', '')
        if not name or '/' not in name:
            continue

        # Build text for keyword matching
        text = ' '.join([
            name,
            r.get('description', ''),
            r.get('language', ''),
            ' '.join(r.get('topics', [])) if isinstance(r.get('topics'), list) else '',
            r.get('category_hint', '')
        ])

        is_ai = bool(AI_PATTERN.search(text))
        is_crypto = bool(CRYPTO_PATTERN.search(text))

        if not is_ai and not is_crypto:
            continue

        if is_ai and is_crypto:
            category = 'ai+crypto'
        elif is_ai:
            category = 'ai'
        else:
            category = 'crypto'

        r['category'] = category

        # Dedup: keep the one with more info (prefer ossinsight which has stars_today)
        if name in seen:
            existing = seen[name]
            if r.get('stars_today', 0) > existing.get('stars_today', 0):
                seen[name] = r
            elif r.get('score', 0) > existing.get('score', 0):
                seen[name] = r
        else:
            seen[name] = r

repos = list(seen.values())

# Sort: stars_today first (desc), then score (desc), then total stars (desc)
repos.sort(key=lambda x: (x.get('stars_today', 0), x.get('score', 0), x.get('stars', 0)), reverse=True)

# Take top 100
repos = repos[:100]

# Add rank and clean up
for i, r in enumerate(repos):
    r['rank'] = i + 1
    # Remove internal fields
    for key in ['source', 'category_hint', 'score']:
        r.pop(key, None)

with open(output_file, 'w') as out:
    json.dump(repos, out, indent=2, ensure_ascii=False)
PYTHON_SCRIPT

# --- Summary ---
TOTAL=$(jq length "$OUTPUT_FILE")
AI_COUNT=$(jq '[.[] | select(.category == "ai" or .category == "ai+crypto")] | length' "$OUTPUT_FILE")
CRYPTO_COUNT=$(jq '[.[] | select(.category == "crypto" or .category == "ai+crypto")] | length' "$OUTPUT_FILE")
WITH_STARS=$(jq '[.[] | select(.stars_today > 0)] | length' "$OUTPUT_FILE")

echo ""
echo "=========================================="
echo "Results: ${TOTAL} repos"
echo "  AI: ${AI_COUNT} | Crypto: ${CRYPTO_COUNT}"
echo "  With today's star data: ${WITH_STARS}"
echo "Output: ${OUTPUT_FILE}"
echo "=========================================="
echo ""
echo "Top 15 by today's stars:"
jq -r '.[:15][] | "  #\(.rank) \(if .stars_today > 0 then "🔥\(.stars_today) today" else "⭐\(.stars) total" end) \(.full_name) [\(.category)] \(.language) - \(.description // "N/A" | .[0:50])"' "$OUTPUT_FILE"
