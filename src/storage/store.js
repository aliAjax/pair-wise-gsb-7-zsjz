// 存储层：只管 localStorage 读写与旧数据迁移，不做任何业务判定。
import { buildSeed } from '../data/seed.js';

const KEY = 'guide-exhibits-v2';
const LEGACY_KEY = 'guide-exhibits';

// 旧版（无时间区间的 status 草稿/已发布）迁移为新模型：
// 一律转为未发布草稿，时间区间留空，由使用者重新预约
function migrateLegacy(raw) {
  try {
    const old = JSON.parse(raw);
    if (!Array.isArray(old)) return null;
    return old.map(x => ({
      id: String(x.id),
      title: x.title || '未命名展项',
      room: x.room || '',
      type: x.type || '装置',
      desc: x.desc || '',
      audio: x.audio || '',
      color: x.color || '#9ba7dc',
      sessions: [],
      versions: [],
    }));
  } catch {
    return null;
  }
}

export function loadExhibits() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateLegacy(legacy);
      if (migrated) {
        localStorage.setItem(KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    // localStorage 不可用时回落到种子数据（内存态）
  }
  return buildSeed();
}

export function saveExhibits(exhibits) {
  try {
    localStorage.setItem(KEY, JSON.stringify(exhibits));
    return true;
  } catch {
    return false;
  }
}
