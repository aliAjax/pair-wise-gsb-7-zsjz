import assert from 'node:assert';

// 假的 localStorage：模拟浏览器存储
class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

globalThis.localStorage = new MemStorage();

const { loadExhibits, saveExhibits } = await import('../src/storage/store.js');
const { exhibitState } = await import('../src/domain/schedule.js');

// 1. 首次加载回落种子数据，四种状态各一
let data = loadExhibits();
assert.equal(data.length, 4);
const states = data.map(x => exhibitState(x));
assert.ok(states.includes('open'));
assert.ok(states.includes('pending'));
assert.ok(states.includes('closed'));
assert.ok(states.includes('draft'));

// 2. 刷新往返：保存后重新加载，展项、时间区间、版本完全一致
saveExhibits(data);
const reloaded = loadExhibits();
assert.equal(JSON.stringify(reloaded), JSON.stringify(data));

// 3. 旧版数据（status: 已发布/草稿，无时间）迁移为草稿模型，发布记录清空
globalThis.localStorage.clear();
globalThis.localStorage.setItem('guide-exhibits', JSON.stringify([
  { id: 1, title: '老展项', room: 'A01', type: '装置', desc: 'x', audio: '', status: '已发布', color: '#fff' },
]));
const migrated = loadExhibits();
assert.equal(migrated.length, 1);
assert.equal(migrated[0].title, '老展项');
assert.deepEqual(migrated[0].versions, []);
assert.deepEqual(migrated[0].sessions, []);
assert.equal(exhibitState(migrated[0]), 'draft');
// 迁移结果已写入新键，刷新后不再重复迁移
assert.ok(globalThis.localStorage.getItem('guide-exhibits-v2'));

// 4. 损坏 JSON 不炸，回落种子
globalThis.localStorage.clear();
globalThis.localStorage.setItem('guide-exhibits-v2', '{not-json');
assert.equal(loadExhibits().length, 4);

console.log('storage rules: all assertions passed');
