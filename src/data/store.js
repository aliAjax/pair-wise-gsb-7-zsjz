// 存储层：只负责 localStorage 读写、旧版数据迁移与结构兜底，不含任何业务判定
import { buildSeed } from '../data/seed.js';
import { uid } from '../domain/schedule.js';

const KEY = 'guide-exhibits';
const VERSION = 2;

const CONTENT_FIELDS = ['title', 'room', 'type', 'desc', 'audio', 'color'];

function normalizeWindow(w) {
  return { id: w?.id || uid(), openAt: w?.openAt || '', closeAt: w?.closeAt || '' };
}

function normalizeExhibit(raw, index) {
  const windows = Array.isArray(raw?.draft?.windows) ? raw.draft.windows.map(normalizeWindow) : [];
  const draft = raw?.draft
    ? {
        ...Object.fromEntries(CONTENT_FIELDS.map((k) => [k, raw.draft[k] ?? ''])),
        windows,
        reason: raw.draft.reason ?? '',
      }
    : null;
  const records = Array.isArray(raw?.records)
    ? raw.records.map((r, vi) => ({
        version: vi + 1,
        reason: r?.reason ?? '',
        publishedAt: r?.publishedAt ?? new Date().toISOString(),
        snapshot: {
          ...Object.fromEntries(CONTENT_FIELDS.map((k) => [k, r?.snapshot?.[k] ?? ''])),
          windows: Array.isArray(r?.snapshot?.windows) ? r.snapshot.windows.map(normalizeWindow) : [],
        },
      }))
    : [];
  return {
    id: raw?.id ?? Date.now() + index,
    draft,
    records,
  };
}

// 旧版（version 1，status 字符串）迁移：
// 已发布 -> 冻结一条 v1 记录（当前时刻前 1 小时开放、7 天后闭馆，保证迁移后仍可见）；
// 草稿 -> 仅草稿、无记录
function migrateV1(list) {
  return list.map((x, i) => {
    const base = Object.fromEntries(CONTENT_FIELDS.map((k) => [k, x[k] ?? (k === 'type' ? '装置' : k === 'color' ? '#9ba7dc' : '')]));
    if (x.status === '已发布') {
      const windows = [
        {
          id: uid(),
          openAt: new Date(Date.now() - 3600 * 1000).toISOString(),
          closeAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        },
      ];
      return {
        id: x.id ?? Date.now() + i,
        draft: { ...base, windows: windows.map((w) => ({ ...w })), reason: '' },
        records: [
          {
            version: 1,
            reason: '历史已发布展项迁移',
            publishedAt: new Date().toISOString(),
            snapshot: { ...base, windows },
          },
        ],
      };
    }
    return { id: x.id ?? Date.now() + i, draft: { ...base, windows: [], reason: '' }, records: [] };
  });
}

export function loadExhibits() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY));
  } catch {
    raw = null;
  }
  // 兼容两种落盘形态：包装对象 { version, exhibits } 与裸数组
  const list0 = Array.isArray(raw) ? raw : Array.isArray(raw?.exhibits) ? raw.exhibits : null;
  const hasSaved = list0 !== null;
  let list;
  if (list0 && list0.some((x) => x && !('draft' in x) && 'status' in x)) {
    list = migrateV1(list0);
  } else if (list0 && list0.every((x) => x && 'draft' in x && Array.isArray(x.records))) {
    list = list0.map(normalizeExhibit);
  } else if (hasSaved) {
    list = []; // 结构合法（含已清空）但数据异常时保持空，不再灌入种子
  } else {
    list = buildSeed().map(normalizeExhibit);
  }
  // 落盘一次：迁移 / 首访种子立刻固化，保证刷新后一致
  persist(list);
  return list;
}

export function persist(exhibits) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, exhibits }));
  } catch {
    // 存储不可用时仅内存生效
  }
}
