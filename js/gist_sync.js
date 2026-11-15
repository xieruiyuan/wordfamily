import { loadStudyState, saveStudyState, mergeStudyStates } from "./store.js";

const GIST_CFG_KEY = "dict_gist_sync_cfg";
const GIST_FILENAME = "wordfamily_dict_sync.json";

export function getGistConfig() {
  try {
    return JSON.parse(localStorage.getItem(GIST_CFG_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveGistConfig(token, gistId) {
  localStorage.setItem(GIST_CFG_KEY, JSON.stringify({
    token: (token || "").trim(),
    gistId: (gistId || "").trim()
  }));
}

export async function syncWithGitHubGist(onStateUpdated) {
  const cfg = getGistConfig();
  if (!cfg.token) {
    throw new Error("请先填写具备 gist 权限的 GitHub Personal Access Token");
  }

  const headers = {
    "Authorization": `Bearer ${cfg.token}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };

  let localState = loadStudyState();

  // 若尚未填写 Gist ID，自动创建一个私密 Secret Gist
  if (!cfg.gistId) {
    const createResp = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers,
      body: JSON.stringify({
        description: "WordFamily Dictionary Sync (Favorites, Dictation & Wrong Words)",
        public: false,
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(localState, null, 2)
          }
        }
      })
    });
    if (!createResp.ok) {
      const errText = await createResp.text();
      throw new Error(`创建 Gist 失败 (${createResp.status}): ${errText}`);
    }
    const created = await createResp.json();
    saveGistConfig(cfg.token, created.id);
    return { gistId: created.id, created: true, state: localState };
  }

  // 拉取云端 Gist 并双向合并
  const getResp = await fetch(`https://api.github.com/gists/${encodeURIComponent(cfg.gistId)}`, {
    method: "GET",
    headers
  });
  if (!getResp.ok) {
    throw new Error(`读取云端 Gist 失败 (${getResp.status})，请检查 Token 与 Gist ID 是否正确`);
  }

  const gistData = await getResp.json();
  const fileObj = gistData.files?.[GIST_FILENAME] || Object.values(gistData.files || {})[0];
  let remoteState = null;
  if (fileObj && fileObj.content) {
    try {
      remoteState = JSON.parse(fileObj.content);
    } catch {
      remoteState = null;
    }
  }

  const merged = mergeStudyStates(localState, remoteState);
  saveStudyState(merged);
  if (typeof onStateUpdated === "function") {
    onStateUpdated(merged);
  }

  // 将合并后的最新状态回写至云端 Gist
  const patchResp = await fetch(`https://api.github.com/gists/${encodeURIComponent(cfg.gistId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(merged, null, 2)
        }
      }
    })
  });
  if (!patchResp.ok) {
    throw new Error(`上传同步失败 (${patchResp.status})`);
  }

  return { gistId: cfg.gistId, created: false, state: merged };
}
