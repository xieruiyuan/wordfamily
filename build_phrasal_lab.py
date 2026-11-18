import json, os, re

ROOT = "/Users/rongtai/wordfamily_deploy"
vp = json.load(open(f"{ROOT}/verb_phrases.json", encoding="utf-8"))
wf = json.load(open(f"{ROOT}/word_families_final.json", encoding="utf-8"))

# 建立词头 -> (rank, 核心动词中文释义) 映射
meta_map = {}
for fam in wf:
    hw = fam.get("headword", "").lower()
    r = fam.get("rank", 99999)
    zh = ""
    for b in fam.get("pos_branches", []):
        if b.get("pos") == "v.":
            for l in b.get("lemmas", []):
                if l.get("lemma", "").lower() == hw and l.get("zh"):
                    zh = l["zh"]
                    break
        if zh:
            break
    if not zh:
        for b in fam.get("pos_branches", []):
            for l in b.get("lemmas", []):
                if l.get("lemma", "").lower() == hw and l.get("zh"):
                    zh = l["zh"]
                    break
            if zh:
                break
    meta_map[hw] = (r, zh)

CORE_PARTICLES = ["up", "out", "off", "in", "on", "down", "over", "away", "back", "through", "into", "for", "around", "about", "by", "with", "to", "at", "from", "after", "across", "along", "apart", "aside", "together"]
particle_set = set(CORE_PARTICLES)
particle_counts = {p: 0 for p in CORE_PARTICLES}

verbs_out = []
total_phrases = 0

for verb, payload in vp.items():
    pvs = payload.get("phrasal_verbs", []) if isinstance(payload, dict) else []
    if not pvs:
        continue
    v_low = verb.lower().strip()
    rank, v_zh = meta_map.get(v_low, (99999, ""))
    grouped = {}
    v_count = 0
    for item in pvs:
        phrase = item.get("phrase", "").strip()
        if not phrase:
            continue
        words = re.findall(r"[a-zA-Z']+", phrase.lower())
        part = "other"
        for w in words[1:]:
            if w in particle_set:
                part = w
                break
        if part == "other" and len(words) > 1:
            part = words[-1]
        if part in particle_counts:
            particle_counts[part] += 1

        senses_clean = []
        for s in item.get("senses", []):
            senses_clean.append({
                "m": s.get("meaning", ""),
                "en": s.get("example_en", ""),
                "zh": s.get("example_zh", "")
            })
        entry = {
            "p": phrase,
            "s": senses_clean,
            "reg": item.get("register", []),
            "sep": item.get("separable", "")
        }
        grouped.setdefault(part, []).append(entry)
        v_count += 1
        total_phrases += 1

    if v_count > 0:
        verbs_out.append({
            "v": verb,
            "r": rank,
            "zh": v_zh,
            "n": v_count,
            "g": grouped
        })

# 默认按短语数量降序、词频升序排列，核心高频大户排在最前面
verbs_out.sort(key=lambda x: (-x["n"], x["r"]))
top_particles = [p for p, c in sorted(particle_counts.items(), key=lambda x: -x[1]) if c > 0]

out_data = {
    "total_verbs": len(verbs_out),
    "total_phrases": total_phrases,
    "particles": top_particles,
    "verbs": verbs_out
}

out_path = f"{ROOT}/phrasal_verbs_lab.json"
json.dump(out_data, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
kb = os.path.getsize(out_path) / 1024
print(f"✅ 独立数据包 phrasal_verbs_lab.json 生成完毕：{len(verbs_out)} 个核心动词，{total_phrases} 条短语，体积 {kb:.1f} KB")
