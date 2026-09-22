import assert from 'node:assert';
import {
  HOUR, ROOM_LIMIT, exhibitState, isPublished, planPublish, applyPublish,
  checkRoomCapacity, selfOverlap,
} from '../src/domain/schedule.js';

const now = 1_000_000_000_000;
let id = 0;
const s = (start, end) => ({ id: `s${id++}`, start, end });
const mkDraft = (over = {}) => ({
  id: `e${id++}`, title: '展项' + id, room: 'A01', type: '装置', desc: '', audio: '',
  color: '#000', sessions: [], versions: [], ...over,
});
const publishOnce = (ex, sessions, t = now) => {
  const p = planPublish(ex, sessions, '', [], t);
  assert(p.ok, p.errors + ' / ' + JSON.stringify(p.conflicts));
  return applyPublish(ex, p.sessions, '', t);
};

// 1. 状态：草稿 / 待开放 / 开放中 / 已闭馆
assert.equal(exhibitState(mkDraft(), now), 'draft');
let ex = publishOnce(mkDraft(), [s(now + HOUR, now + 3 * HOUR)]);
assert.equal(exhibitState(ex, now), 'pending');
assert.equal(exhibitState(ex, now + 2 * HOUR), 'open');
assert.equal(exhibitState(ex, now + 4 * HOUR), 'closed');

// 2. 半开区间：首尾相接不重叠；真正重叠能检出
assert.equal(selfOverlap([s(0, 10), s(10, 20)]), null);
assert.ok(selfOverlap([s(0, 11), s(10, 20)]));

// 3. 闭馆后自动隐藏但记录保留（isPublished 仍为 true，versions 不动）
const frozenAt = ex.versions.length;
assert.equal(exhibitState(ex, now + 4 * HOUR), 'closed');
assert.equal(isPublished(ex), true);
assert.equal(ex.versions.length, frozenAt);

// 4. 同展厅同一时刻最多 3 个已发布展项，第 4 个整次失败且指出冲突展项
const room = 'A01';
const others = [];
for (let i = 0; i < ROOM_LIMIT; i++) {
  others.push(publishOnce(mkDraft({ room, title: `占用${i + 1}` }), [s(now + 2 * HOUR, now + 5 * HOUR)]));
}
const newbie = mkDraft({ room, title: '新来的' });
let plan = planPublish(newbie, [s(now + 3 * HOUR, now + 4 * HOUR)], '', others, now);
assert.equal(plan.ok, false);
assert.equal(plan.conflicts.length, 1);
assert.equal(plan.conflicts[0].count, ROOM_LIMIT + 1);
assert.deepEqual(plan.conflicts[0].titles.sort(), ['占用1', '占用2', '占用3']);

// 与三个展项错峰则放行
plan = planPublish(newbie, [s(now + 5 * HOUR, now + 6 * HOUR)], '', others, now);
assert(plan.ok, JSON.stringify(plan.conflicts));

// 自身旧版本不占名额：同一展项调整时间后重新保存不应与自己冲突
const mine = others[0];
const selfPlan = planPublish(
  { ...mine, title: '占用1改时间' },
  [s(now + 3 * HOUR, now + 4 * HOUR)],
  '改时间', others, now
);
assert(selfPlan.ok, JSON.stringify(selfPlan.conflicts));

// 不同展厅互不影响
assert(planPublish(mkDraft({ room: 'B02', title: '别的厅' }), [s(now + 3 * HOUR, now + 4 * HOUR)], '', others, now).ok);

// 5. 整次保存失败时数据不变（planPublish 不修改入参）
const before = JSON.stringify(others);
planPublish(newbie, [s(now + 3 * HOUR, now + 4 * HOUR)], '', others, now);
assert.equal(JSON.stringify(others), before);

// 6. 已发布冻结：无原因不能生成新版本
ex = publishOnce(mkDraft({ title: '原件' }), [s(now + HOUR, now + 2 * HOUR)]);
const noReason = planPublish({ ...ex, title: '改了' }, ex.sessions, '', [ex], now);
assert.equal(noReason.ok, false);
assert.ok(noReason.errors[0].includes('冻结'));
// 原版本内容保持冻结
assert.equal(ex.versions[0].title, '原件');

// 有原因 -> 新版本，旧记录保留且内容冻结
const withReason = planPublish({ ...ex, title: '改了' }, ex.sessions, '更换标题', [ex], now);
assert(withReason.ok, withReason.errors.join(';'));
const v2 = applyPublish({ ...ex, title: '改了' }, withReason.sessions, '更换标题', now);
assert.equal(v2.versions.length, 2);
assert.equal(v2.versions[0].title, '原件');
assert.equal(v2.versions[1].title, '改了');
assert.equal(v2.versions[0].reason, '首次发布');
assert.equal(v2.versions[1].reason, '更换标题');
// 访客状态推导以最新版本为准
assert.equal(exhibitState(v2, now + 90 * 60000), 'open');

// 7. 输入校验：空时间、闭馆早于开放、本展项区间重叠
assert.equal(planPublish(mkDraft(), [], '', [], now).ok, false);
assert.equal(planPublish(mkDraft(), [s(now + 2 * HOUR, now + HOUR)], '', [], now).ok, false);
assert.equal(planPublish(mkDraft(), [s(0, 0)], '', [], now).ok, false);
const dup = planPublish(mkDraft(), [s(now + HOUR, now + 3 * HOUR), s(now + 2 * HOUR, now + 4 * HOUR)], '', [], now);
assert.equal(dup.ok, false);
assert.ok(dup.errors[0].includes('重叠'));

// 8. 容量扫描线：三个展项首尾相接（端点重合）不算超限
const chain = ['a', 'b', 'c'].map(t =>
  publishOnce(mkDraft({ room: 'X', title: t }), [s(now + HOUR, now + 2 * HOUR)]));
assert(planPublish(mkDraft({ room: 'X', title: 'd' }), [s(now + 2 * HOUR, now + 3 * HOUR)], '', chain, now).ok);

console.log('domain rules: all assertions passed');
