import React from 'react';
import { deriveState, activeWindow, nextWindow } from '../domain/schedule.js';
import { fmtDateTime, fmtShort } from '../domain/time.js';

export const STATE_LABELS = {
  live: '开放中',
  scheduled: '待开放',
  draft: '草稿',
  closed: '已闭馆',
};

export function StateBadge({ state }) {
  return <span className={`status state-${state}`}>{STATE_LABELS[state]}</span>;
}

// 列表 / 详情用的一行预约状态说明
export function ScheduleHint({ exhibit, now }) {
  const state = deriveState(exhibit, now);
  if (state === 'live') {
    const w = activeWindow(exhibit, now);
    return <small className="sched-hint live">开放中 · {fmtShort(w.closeAt)} 闭馆</small>;
  }
  if (state === 'scheduled') {
    const w = nextWindow(exhibit, now);
    return <small className="sched-hint scheduled">{fmtDateTime(w.openAt)} 开放</small>;
  }
  if (state === 'closed') return <small className="sched-hint closed">已闭馆 · 发布记录已保留</small>;
  return <small className="sched-hint draft">尚未预约开放时间</small>;
}
