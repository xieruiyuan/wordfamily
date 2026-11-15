const STORAGE_KEY = "dict_study_state_v1";
const LEGACY_FAV_KEY = "dict_fav_ranks";

export function loadStudyState() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    raw = null;
  }

  // 兼容迁移旧版 dict_fav_ranks
  let legacyFavs = [];
  try {
    legacyFavs = JSON.parse(localStorage.getItem(LEGACY_FAV_KEY) || "[]");
  } catch {
    legacyFavs = [];
  }

  const state = {
    updated_at: raw?.updated_at || Date.now(),
    favorites: Array.isArray(raw?.favorites) ? raw.favorites : legacyFavs,
    mastered_ranks: Array.isArray(raw?.mastered_ranks) ? raw.mastered_ranks : [],
    wrong_stats: (raw?.wrong_stats && typeof raw.wrong_stats === "object") ? raw.wrong_stats : {}
  };

  if (!raw && legacyFavs.length) {
    saveStudyState(state);
  }
  return state;
}

export function saveStudyState(state) {
  state.updated_at = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  localStorage.setItem(LEGACY_FAV_KEY, JSON.stringify(state.favorites));
}

export function recordDictationResult(state, rank, isCorrect) {
  const key = String(rank);
  if (isCorrect) {
    if (!state.mastered_ranks.includes(rank)) {
      state.mastered_ranks.push(rank);
    }
  } else {
    const prev = state.wrong_stats[key] || { count: 0, last_wrong: 0 };
    state.wrong_stats[key] = {
      count: (Number(prev.count) || 0) + 1,
      last_wrong: Date.now()
    };
  }
  saveStudyState(state);
}

export function removeWrongRecord(state, rank) {
  delete state.wrong_stats[String(rank)];
  saveStudyState(state);
}

// 双向无损合并（用于本地与 GitHub Gist 同步）
export function mergeStudyStates(localState, remoteState) {
  if (!remoteState || typeof remoteState !== "object") return localState;

  const favSet = new Set([
    ...(Array.isArray(localState.favorites) ? localState.favorites : []),
    ...(Array.isArray(remoteState.favorites) ? remoteState.favorites : [])
  ]);

  const masteredSet = new Set([
    ...(Array.isArray(localState.mastered_ranks) ? localState.mastered_ranks : []),
    ...(Array.isArray(remoteState.mastered_ranks) ? remoteState.mastered_ranks : [])
  ]);

  const mergedWrong = {};
  const allKeys = new Set([
    ...Object.keys(localState.wrong_stats || {}),
    ...Object.keys(remoteState.wrong_stats || {})
  ]);

  for (const k of allKeys) {
    const l = localState.wrong_stats?.[k];
    const r = remoteState.wrong_stats?.[k];
    if (l && r) {
      mergedWrong[k] = {
        count: Math.max(Number(l.count) || 0, Number(r.count) || 0),
        last_wrong: Math.max(Number(l.last_wrong) || 0, Number(r.last_wrong) || 0)
      };
    } else {
      mergedWrong[k] = l || r;
    }
  }

  return {
    updated_at: Math.max(Number(localState.updated_at) || 0, Number(remoteState.updated_at) || 0, Date.now()),
    favorites: [...favSet],
    mastered_ranks: [...masteredSet],
    wrong_stats: mergedWrong
  };
}
