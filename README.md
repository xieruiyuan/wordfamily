# WordFamily & Verb Lab — 双引擎认知英语词汇典

这是一个**零后端依赖、纯静态数据驱动**的个人定制英语词汇辨析系统，由两大互补引擎组成：
1. **同根词族引擎（`index.html`）**：从**词源与构词法**出发，按词根聚合派生词家族；
2. **认知语义与句法配价实验室（`verb_lab.html`）**：从**认知隐喻与句法结构**出发，将全库 3,410 个动词语义框架按「四维句法配价（作格双用 / 纯不及物 / 直接及物 / 介词及物）」切分，并提供词间微差与典型名词搭配辨析。

---

## 一、 仓库文件清单与功能说明

| 文件名 | 文件大小 | 核心作用与定位 |
| :--- | :--- | :--- |
| `align_verb_senses.py` | `6.1 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `audit_gallery.html` | `939.7 KB` | 【前端页面文件】静态展示或测试页面。 |
| `boost_phrasal_verbs.py` | `6.2 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `build_phrasal_lab.py` | `3.3 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `build_shards.py` | `1.2 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `enrich_isolated_groups.py` | `7.7 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `enrich_native_frames.py` | `7.6 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `extract_verbs.py` | `1.1 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `fast_finish_align.py` | `5.8 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `finalize_verb_lab.sh` | `20.2 KB` | 【辅助资源文件】项目配置或参考资料。 |
| `french_index.html` | `59.3 KB` | 【前端页面文件】静态展示或测试页面。 |
| `french_word_families.json` | `11.11 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `gen_context_examples.py` | `11.0 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `gen_frame_nuances.py` | `6.8 KB` | 【离线批处理脚本】调用 Gemini API 批量生成全库 3,410 个语义框架的「认知边界 + 词间微差 + 典型名词搭配」，支持并发与断点续跑。 |
| `index.html` | `8.0 KB` | 【线上主入口 / 引擎一】同根词族词典前端页面，按词源与词根展示单词派生家族网络。 |
| `phrasal_verbs_lab.json` | `586.8 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `prepare_tier_verbs.py` | `2.7 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `rebuild_verb_4modes.py` | `8.0 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `run_verb_semantic_api.py` | `10.0 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `tag_optional_prep.py` | `7.0 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `tag_registers.py` | `8.5 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `tag_valency.py` | `16.4 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `topic_taxonomy.json` | `663.5 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `upgrade_ergative_and_hl.py` | `10.6 KB` | 【离线数据处理脚本】用于词库清洗、词频匹配、多义项拆分或 JSON 结构转换的 Python 工具脚本。 |
| `verb_4modes_ckpt.json` | `821.0 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_api_checkpoint.json` | `721.1 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_candidates.json` | `2.22 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_ergative_pair_ckpt.json` | `814.0 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_examples_ckpt.json` | `5.89 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_frame_nuances_ckpt.json` | `4.28 MB` | 【本地缓存文件】gen_frame_nuances.py 的断点续跑进度存档，防止网络超时重试导致重复计费。 |
| `verb_lab.html` | `48.4 KB` | 【线上核心引擎 / 引擎二】认知语义框架与四维句法配价实验室（单文件 HTML+CSS+JS，含折叠辨析表、作格双例句对齐、四级排序、美音朗读）。 |
| `verb_native_frames_ckpt.json` | `4.29 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_opt_prep_ckpt.json` | `16.9 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_phrases.json` | `2.43 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_phrases.pre_merge.bak.json` | `1.88 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_pv_boost_ckpt.json` | `791.7 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_registers_ckpt.json` | `209.1 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_sense_align_ckpt.json` | `1.41 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_taxonomy_test.json` | `4.36 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verb_taxonomy_v2.json` | `24.88 MB` | 【核心数据库】verb_lab.html 的全量结构化语义框架库（3,410 个框架，含认知边界导语、词间微差、名词搭配与句法配价标注）。 |
| `verb_valency_ckpt.json` | `475.7 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `verbecc.log` | `0.0 KB` | 【辅助资源文件】项目配置或参考资料。 |
| `verbs_to_classify.json` | `842.1 KB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `word_families_final.json` | `25.30 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `word_families_final.pre_final_merge.bak.json` | `25.30 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `word_families_final.pre_merge.bak.json` | `24.72 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |
| `word_index.json` | `1.27 MB` | 【静态数据文件】词族或词典模块的结构化 JSON 数据源。 |

---

## 二、 核心实现原理（`verb_lab.html`）

`verb_lab.html` 采用原生 HTML5 + CSS3 + Vanilla JS 单文件架构，所有计算、过滤、排序与朗读均在客户端浏览器本地完成（**线上运行 0 API 消耗**）：

1. **异步数据加载与状态驱动渲染**
   - 页面启动时通过 `fetch('verb_taxonomy_v2.json')` 加载全量 JSON 数据至内存。
   - 顶部的双语切换（`Chinese: ON/OFF`）、例句展开（`Examples: ON/OFF`）、全章折叠（`Collapse All`）、词频/语域/句法筛选器及实时搜索框，均通过修改全局状态触发 `render()` 局部重绘。

2. **四维句法配价分栏（Four-Dimensional Valency）**
   - 每个语义框架下的词条按 `valency` 字段自动归入四个句法分区：
     - **`ergative`（自变/致使双用 `Sth V ↔ Sb/Sth V sth`）**：渲染时自动核对 `ex_dir` 字段，强制统一展示顺序——**第一条永远为 `Autonomous`（自变 `Sth V`），第二条永远为 `Causative`（致使 `Sb/Sth V sth`）**。
     - **`intransitive`（纯自主不及物 `Sth/Sb V`）**
     - **`transitive`（直接及物 `Sb/Sth V sth`）**
     - **`prepositional`（不及物 + 固定介词 `Sb/Sth V + prep + sth`）**

3. **四级确定性排序算法（`sortItemsUniformly`）**
   - 每个句法分区内的单词卡片均按以下优先级严格排序：
     1. **核心度等级**：`CORE` > `COMMON` > `UNCOMMON` > `RARE`；
     2. **Zipf 词频降序**：同级内按 `zipf` 数值从高到低排列（短语动词缺省基准分为 `4.1`）；
     3. **字母顺序**：词频接近时按 `A–Z` 字母顺序排列。

4. **可折叠三列辨析表（`renderNuanceStrip`）**
   - 解析 `nuance_en` / `nuance_zh` 字段（以 `·` 分隔词项，末尾括号 `(collocations)` 自动提取并渲染为右侧蓝色搭配胶囊）。
   - 默认折叠为单行摘要栏，点击后展开为三列网格对照表（词头 | 核心语义微差 | 典型名词搭配）。

5. **原生美音朗读（`speakWord`）**
   - 基于浏览器原生 `Web Speech API (speechSynthesis)` 实现，优先自动匹配系统内置自然美音（如 `Samantha` / `Ava` / `Allison`），支持单击朗读与连点打断重读。

---

## 三、 日常 Debug 与维护指南

- **修改单词释义、例句或标签**：直接编辑 `verb_taxonomy_v2.json` 对应词条即可。修改后建议在终端运行以下命令校验 JSON 语法完整性：
  ```bash
  python3 -m json.tool verb_taxonomy_v2.json > /dev/null && echo "JSON 格式正常"
  ```
- **修改页面排版、配色或交互逻辑**：直接编辑 `verb_lab.html`（CSS 位于顶部 `<style>`，JS 逻辑位于底部 `<script>`）。
- **部署上线（GitHub Pages）**：
  ```bash
  git add .
  git commit -m "Update dictionary content or UI"
  git push
  ```