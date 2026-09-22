// 判定层：时间区间、状态判定、冲突校验、发布版本——全部为纯函数，不碰存储与页面。

export const HOUR = 3600000;
export const DAY = 24 * HOUR;
// 同一展厅同一时刻最多同时开放的已发布展项数
export const ROOM_LIMIT = 3;

let seq = 0;
export const uid = () => `id-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const newSession = (start = 0, end = 0) => ({ id: uid(), start, end });

// 半开区间 [start,end)：首尾相接不算重叠，同一展项的区间因此可以背靠背
const overlap = (a, b) => a.start < b.end && b.start < a.end;

// ---------- 时间展示（纯函数，页面层调用） ----------
const p2 = n => String(n).padStart(2, '0');
export const fmtDateTime = ms => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const fmtRange = s => s.start ? `${fmtDateTime(s.start)} → ${fmtDateTime(s.end)}` : '未设置时间';
export const fmtShort = ms => {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const fmtShortRange = s => s.start ? `${fmtShort(s.start)} → ${fmtShort(s.end)}` : '未设置';

// datetime-local 控件值 <-> 毫秒
export const toInputValue = ms => {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const fromInputValue = v => (v ? new Date(v).getTime() : 0);

// ---------- 状态判定 ----------
// 展项状态由「是否已发布」与「当前时刻所处的时间区间」推导：
//   draft    未发布（开放前保持草稿，访客不可见；即使预填了时间也仍是草稿）
//   pending  已发布但当前早于任一区间（待开放，访客仍不可见）
//   open     已发布且当前落在某个区间内（访客可见）
//   closed   已发布且所有区间均已结束（自动隐藏，发布记录保留）
export function exhibitState(ex, now = Date.now()) {
  if (!isPublished(ex)) return 'draft';
  const sched = activeSessions(ex);
  if (sched.some(s => s.start <= now && now < s.end)) return 'open';
  if (sched.some(s => now < s.start)) return 'pending';
  return 'closed';
}

export const isPublished = ex => Array.isArray(ex.versions) && ex.versions.length > 0;
// 已发布展项以最新版本（versions 最后一项）为冻结快照；未发布展项用工作区草稿时间
export const activeSessions = ex =>
  isPublished(ex) ? ex.versions[ex.versions.length - 1].sessions : ex.sessions || [];

// 距当前最近的一个区间（用于工作台时间提示）
export function nearestSession(ex, now = Date.now()) {
  const sessions = activeSessions(ex);
  if (!sessions.length) return null;
  return sessions
    .filter(s => s.end > now)
    .sort((a, b) => a.start - b.start)[0] || null;
}

// ---------- 同一展项区间校验 ----------
// 同一展项时间区间不得重叠；并要求 end > start
export function selfOverlap(sessions) {
  for (let i = 0; i < sessions.length; i++) {
    for (let j = i + 1; j < sessions.length; j++) {
      if (overlap(sessions[i], sessions[j])) return { a: sessions[i], b: sessions[j] };
    }
  }
  return null;
}

// ---------- 展厅容量校验（扫描线） ----------
// 入参为其它已发布展项的冻结快照 [{id,title,room,sessions}]，
// 同一展厅同一时刻重叠的已发布展项数不得超过 ROOM_LIMIT。
// 返回首个超限时间段及其冲突展项。
export function checkRoomCapacity(snapshot, room, limit = ROOM_LIMIT) {
  const events = [];
  for (const ex of snapshot) {
    if (ex.room !== room) continue;
    for (const s of ex.sessions) {
      if (!s.start || !s.end) continue;
      events.push({ t: s.start, d: 1, id: ex.id, title: ex.title });
      events.push({ t: s.end, d: -1, id: ex.id, title: ex.title });
    }
  }
  // 同刻先闭后开：区间半开，端点相接不计入并发
  events.sort((a, b) => a.t - b.t || a.d - b.d);

  const active = new Map(); // id -> title
  let count = 0;
  for (const ev of events) {
    if (ev.d === 1) {
      count++;
      active.set(ev.id, ev.title);
      if (count > limit) {
        return {
          room,
          start: ev.t,
          count,
          conflicts: [...active.values()],
        };
      }
    } else {
      active.delete(ev.id);
      count--;
    }
  }
  return null;
}

// ---------- 发布前整体校验（判定 + 汇总冲突） ----------
// rows: 表单中的时间区间 {id,start,end}（毫秒）
// others: 其它展项（草稿或已发布均可，只有已发布快照参与容量判定）
export function planPublish(ex, rows, reason, others = [], now = Date.now()) {
  const errors = [];
  const conflicts = [];

  if (isPublished(ex) && !reason.trim()) {
    errors.push('已发布记录已冻结，调整必须填写调整原因以生成新版本。');
  }
  if (!ex.title.trim()) errors.push('请填写展项标题。');
  if (!ex.room.trim()) errors.push('请填写所在展厅。');
  if (!rows.length) errors.push('至少需要设置一个开放时间区间。');

  const sessions = rows.map(r => ({ id: r.id, start: Number(r.start) || 0, end: Number(r.end) || 0 }));
  for (const s of sessions) {
    if (!s.start || !s.end) errors.push('存在未填写完整的开放/闭馆时刻。');
    else if (s.end <= s.start) errors.push(`${fmtDateTime(s.start)} 的闭馆时刻必须晚于开放时刻。`);
  }

  const dup = selfOverlap(sessions);
  if (dup) {
    errors.push(`本展项时间区间重叠：${fmtShortRange(dup.a)} 与 ${fmtShortRange(dup.b)}。`);
  }

  if (!errors.length) {
    // 自身的冻结快照（旧版本）不参与计数——新版本替换它；
    // 其它展项只统计其已发布版本。
    const otherPublished = others
      .filter(o => o.id !== ex.id && isPublished(o))
      .map(o => {
        const v = o.versions[o.versions.length - 1];
        return { id: o.id, title: o.title, room: v.room, sessions: v.sessions };
      });
    const violation = checkRoomCapacity([...otherPublished, { id: ex.id, title: ex.title, room: ex.room, sessions }], ex.room);
    if (violation) {
      conflicts.push({
        room: violation.room,
        start: violation.start,
        count: violation.count,
        titles: violation.conflicts.filter(t => t !== ex.title),
      });
    }
  }

  return { ok: !errors.length && !conflicts.length, errors, conflicts, sessions };
}

// ---------- 版本（冻结记录） ----------
export function buildVersion(ex, sessions, reason, now = Date.now()) {
  return {
    version: (isPublished(ex) ? ex.versions[ex.versions.length - 1].version : 0) + 1,
    reason: isPublished(ex) ? reason.trim() : '首次发布',
    createdAt: now,
    title: ex.title,
    room: ex.room,
    type: ex.type,
    desc: ex.desc,
    audio: ex.audio,
    color: ex.color,
    sessions: sessions.map(s => ({ id: s.id || uid(), start: s.start, end: s.end })),
  };
}

// 校验通过后应用发布：新版本追加到 versions（旧记录全部保留），工作区资料同步
export function applyPublish(ex, sessions, reason, now = Date.now()) {
  const version = buildVersion(ex, sessions, reason, now);
  return {
    ...ex,
    title: version.title,
    room: version.room,
    type: version.type,
    desc: version.desc,
    audio: version.audio,
    sessions: version.sessions.map(s => ({ ...s })),
    versions: [...(ex.versions || []), version],
  };
}
