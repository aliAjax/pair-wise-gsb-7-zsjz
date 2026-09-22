// 预约发布判定层：全部为纯函数，不接触存储与页面
// 数据模型见 store.js，关键结构：
//   展项 exhibit = { id, title, room, type, desc, audio, color,
//                    draft: {...内容, windows:[{id,openAt,closeAt}]} | null,
//                    records: [ 已发布记录（冻结），按版本升序 ] }
//   record = { version, reason, publishedAt, snapshot:{ title, room, type, desc, audio, color, windows } }

export const MAX_LIVE_PER_ROOM = 3; // 同一展厅同一时刻最多 3 个已发布展项
const MINUTE = 60 * 1000;

let seq = 1;
export const uid = () => {
  const t = Date.now().toString(36);
  const s = (seq++).toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${t}-${s}-${r}`;
};
export const exhibitId = () => Date.now() + seq++;

export const emptyWindow = () => ({ id: uid(), openAt: '', closeAt: '' });

// 时间区间为左闭右开 [openAt, closeAt)，首尾相接不算重叠
export function intervalsOverlap(a, b) {
  return a.openAt < b.closeAt && b.openAt < a.closeAt;
}

export function isWindowLive(w, now = Date.now()) {
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  return !!w.openAt && !!w.closeAt && new Date(w.openAt).getTime() <= t && t < new Date(w.closeAt).getTime();
}

export function isWindowScheduled(w, now = Date.now()) {
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  return !!w.openAt && !!w.closeAt && new Date(w.openAt).getTime() > t;
}

export function validWindow(w) {
  if (!w.openAt || !w.closeAt) return false;
  const o = new Date(w.openAt).getTime();
  const c = new Date(w.closeAt).getTime();
  return !Number.isNaN(o) && !Number.isNaN(c) && c - o >= MINUTE;
}

// 展项当前判定状态：draft 草稿 / scheduled 已排期待开放 / live 开放中 / closed 已闭馆
export function deriveState(exhibit, now = Date.now()) {
  const rec = latestRecord(exhibit);
  if (!rec) return 'draft';
  const wins = rec.snapshot.windows || [];
  if (wins.some((w) => isWindowLive(w, now))) return 'live';
  if (wins.some((w) => isWindowScheduled(w, now))) return 'scheduled';
  return 'closed';
}

// 访客可见：存在已发布记录且当前落在某个开放区间内（闭馆后自动隐藏，记录仍保留）
export function isVisible(exhibit, now = Date.now()) {
  return deriveState(exhibit, now) === 'live';
}

export function activeWindow(exhibit, now = Date.now()) {
  const rec = latestRecord(exhibit);
  return (rec?.snapshot.windows || []).find((w) => isWindowLive(w, now)) || null;
}

export function nextWindow(exhibit, now = Date.now()) {
  const rec = latestRecord(exhibit);
  if (!rec) return null;
  return (rec.snapshot.windows || [])
    .filter((w) => validWindow(w) && new Date(w.openAt).getTime() > (typeof now === 'number' ? now : new Date(now).getTime()))
    .sort((a, b) => new Date(a.openAt) - new Date(b.openAt))[0] || null;
}

export const latestRecord = (exhibit) =>
  exhibit.records && exhibit.records.length ? exhibit.records[exhibit.records.length - 1] : null;

export const visibleContent = (exhibit) => (latestRecord(exhibit) ? latestRecord(exhibit).snapshot : exhibit.draft);

// 候选草稿（带 windows）与其他展项最新发布记录的逐区间占用冲突
// 每个区间带上归属信息，事件扫描；同一房间同一时刻超过 MAX_LIVE_PER_ROOM 即冲突
export function findCapacityConflicts(candidate, others) {
  const ownRoom = (candidate.room || '').trim();
  const intervals = [];
  candidate.windows.forEach((w) => {
    intervals.push({ window: w, exhibitId: candidate.id, title: candidate.title, room: ownRoom });
  });
  others.forEach((ex) => {
    const rec = latestRecord(ex);
    if (!rec) return;
    (rec.snapshot.windows || []).forEach((w) => {
      if (validWindow(w) && (rec.snapshot.room || '').trim() === ownRoom) {
        intervals.push({ window: w, exhibitId: ex.id, title: rec.snapshot.title, room: ownRoom });
      }
    });
  });

  const conflicts = []; // { at, ids:Set, titles:Set }
  const events = [];
  intervals.forEach((iv) => {
    if (!validWindow(iv.window)) return;
    events.push({ t: new Date(iv.window.openAt).getTime(), type: 'start', iv });
    events.push({ t: new Date(iv.window.closeAt).getTime(), type: 'end', iv });
  });
  // 左闭右开：先处理 end 再处理 start，首尾相接不触发
  events.sort((a, b) => a.t - b.t || (a.type === 'end' ? -1 : 1));
  const active = new Map();
  const seen = new Set(); // 相同涉事展项集合只报一次
  for (const ev of events) {
    if (ev.type === 'end') {
      active.delete(ev.iv.window.id);
    } else {
      active.set(ev.iv.window.id, ev.iv);
      if (active.size > MAX_LIVE_PER_ROOM) {
        const ids = new Set();
        const titles = new Set();
        active.forEach((x) => {
          ids.add(x.exhibitId);
          titles.add(x.title);
        });
        const key = [...ids].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          conflicts.push({ at: ev.t, ids, titles });
        }
      }
    }
  }
  return conflicts;
}

// 草稿相对最新冻结记录是否有实质改动（决定“发布”是否会生成新版本）
export function draftChanged(exhibit) {
  const rec = latestRecord(exhibit);
  if (!rec) return true;
  const a = exhibit.draft;
  const b = rec.snapshot;
  const fields = ['title', 'room', 'type', 'desc', 'audio', 'color'];
  if (fields.some((k) => (a[k] ?? '') !== (b[k] ?? ''))) return true;
  const aw = (a.windows || []).filter(validWindow).map((w) => `${w.openAt}|${w.closeAt}`).sort();
  const bw = (b.windows || []).map((w) => `${w.openAt}|${w.closeAt}`).sort();
  return JSON.stringify(aw) !== JSON.stringify(bw);
}

// 发布前校验。失败时返回 { ok:false, errors:{...}, conflicts }，整次保存中止
// 超限冲突展项以 titles / conflictTitles 指出
export function validatePublish(exhibit, allExhibits) {
  const d = exhibit.draft;
  const errors = {};
  if (!(d.title || '').trim()) errors.title = '请填写展项标题';
  if (!(d.room || '').trim()) errors.room = '请填写所在展厅';
  if (!(d.reason || '').trim()) errors.reason = '发布需要填写原因 / 变更说明';

  const windows = d.windows || [];
  windows.forEach((w, i) => {
    if (!w.openAt || !w.closeAt) errors[`window-${i}`] = '开放与闭馆时刻都必须设置';
    else if (!validWindow(w)) errors[`window-${i}`] = '闭馆时刻需晚于开放时刻至少 1 分钟';
  });
  // 同一展项时间区间不得重叠
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      if (validWindow(windows[i]) && validWindow(windows[j]) && intervalsOverlap(windows[i], windows[j])) {
        errors[`window-${j}`] = `与第 ${i + 1} 个时间区间重叠`;
      }
    }
  }
  if (windows.length === 0) errors.windows = '至少设置一个开放 / 闭馆时间区间';

  const conflicts = Object.keys(errors).some((k) => k.startsWith('window'))
    ? []
    : findCapacityConflicts(
        { id: exhibit.id, title: d.title, room: d.room, windows },
        allExhibits.filter((x) => x.id !== exhibit.id)
      );

  if (conflicts.length) {
    const own = (d.title || '').trim() || '该展项';
    const titles = new Set();
    conflicts.forEach((c) => c.titles.forEach((t) => t !== own && titles.add(t)));
    errors.capacity = {
      own,
      conflictTitles: [...titles],
      at: conflicts[0].at,
    };
  }

  return { ok: Object.keys(errors).length === 0, errors, conflicts };
}

// 冻结当前草稿生成新版本记录（发布成功时调用）
export function freezeRecord(exhibit, nowIso = new Date().toISOString()) {
  const d = exhibit.draft;
  const windows = (d.windows || []).filter(validWindow).map((w) => ({ ...w }));
  const snapshot = {
    title: d.title,
    room: d.room,
    type: d.type,
    desc: d.desc,
    audio: d.audio,
    color: d.color,
    windows,
  };
  const version = (latestRecord(exhibit)?.version || 0) + 1;
  return { version, reason: d.reason.trim(), publishedAt: nowIso, snapshot };
}
