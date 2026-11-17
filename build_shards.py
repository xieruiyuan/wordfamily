import json, os

ROOT = "/Users/rongtai/wordfamily_deploy"
wf = json.load(open(f"{ROOT}/word_families_final.json", encoding="utf-8"))

index_list = []
shards = {}

for fam in wf:
    r = fam["rank"]
    sid = (r - 1) // 1000
    shards.setdefault(sid, []).append(fam)

    branches_lite = []
    for b in fam.get("pos_branches", []):
        lemmas_lite = [
            {
                "lemma": l.get("lemma", ""),
                "zh": l.get("zh", ""),
                "rare": bool(l.get("rare")),
                "forms": l.get("forms", [])
            }
            for l in b.get("lemmas", [])
        ]
        branches_lite.append({"pos": b.get("pos", ""), "lemmas": lemmas_lite})

    index_list.append({
        "rank": r,
        "headword": fam.get("headword", ""),
        "main_pos": fam.get("main_pos", ""),
        "ipa": fam.get("ipa", ""),
        "cefr": fam.get("cefr", ""),
        "pos_branches": branches_lite,
        "_lite": True
    })

for base in [ROOT, "/Users/rongtai"]:
    if not os.path.exists(base):
        continue
    os.makedirs(f"{base}/shards", exist_ok=True)
    json.dump(index_list, open(f"{base}/word_index.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    for sid, items in shards.items():
        json.dump(items, open(f"{base}/shards/shard_{sid:02d}.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

idx_mb = os.path.getsize(f"{ROOT}/word_index.json") / 1024 / 1024
print(f"✅ 分片构建完成：word_index.json ({idx_mb:.2f} MB) + {len(shards)} 个详情分片")
