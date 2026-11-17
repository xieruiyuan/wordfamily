import json, os

ROOT = "/Users/rongtai/wordfamily_deploy"
wf = json.load(open(f"{ROOT}/word_families_final.json", encoding="utf-8"))

# 紧凑元组格式：[rank, headword, [[pos, [lemma1, lemma2...]], ...]]
compact_index = []
shards = {}

for fam in wf:
    r = fam["rank"]
    sid = (r - 1) // 1000
    shards.setdefault(sid, []).append(fam)

    branches_compact = []
    for b in fam.get("pos_branches", []):
        lemmas_compact = [l.get("lemma", "") for l in b.get("lemmas", []) if l.get("lemma")]
        branches_compact.append([b.get("pos", ""), lemmas_compact])

    compact_index.append([r, fam.get("headword", ""), branches_compact])

for base in [ROOT, "/Users/rongtai"]:
    if not os.path.exists(base):
        continue
    os.makedirs(f"{base}/shards", exist_ok=True)
    json.dump(compact_index, open(f"{base}/word_index.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    for sid, items in shards.items():
        json.dump(items, open(f"{base}/shards/shard_{sid:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

idx_kb = os.path.getsize(f"{ROOT}/word_index.json") / 1024
print(f"✅ 极速分片构建完成：word_index.json 已瘦身至 {idx_kb:.1f} KB + {len(shards)} 个详情分片")
