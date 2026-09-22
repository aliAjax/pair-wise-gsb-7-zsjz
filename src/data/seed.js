// 资料层：初始示例资料。状态不在这里固化——由判定层根据当前时刻推导。
import { HOUR, DAY, uid } from '../domain/schedule.js';

// 以相对当前时刻的偏移构造一段区间
const snap = (startOffset, durationHours) => ({
  start: startOffset,
  end: startOffset + durationHours * HOUR,
});

// 以当前时刻为基准构造示例，保证刷新后能看到开放中 / 待开放 / 已闭馆三种状态
export function buildSeed(now = Date.now()) {
  const colors = ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'];

  const openSessions = [
    snap(-HOUR, 4),           // 当前处于开放区间内
    snap(2 * DAY - HOUR, 3),  // 下一场
  ];

  const pendingSessions = [snap(DAY + 2 * HOUR, 4), snap(DAY + 6 * HOUR, 2)];

  const closedSessions = [snap(-3 * DAY, 5), snap(-DAY - 3 * HOUR, 2)];

  // 草稿：开放前保持草稿，访客不可见；预填好时间区间，便于演示发布校验
  const draftSessions = [{ start: now + 2 * DAY, end: now + 2 * DAY + 3 * HOUR }].map(s => ({ id: uid(), ...s }));

  const v1 = (title, room, type, desc, sessions) => ({
    version: 1,
    reason: '首次发布',
    createdAt: now - DAY,
    title, room, type, desc,
    audio: '',
    color: null,
    sessions,
  });

  const mkPublished = (title, room, type, desc, color, sessions) => {
    const id = uid();
    const abs = sessions.map(s => ({ id: uid(), start: now + s.start, end: now + s.end }));
    return {
      id,
      title, room, type, desc, color,
      audio: 'https://example.com/audio.mp3',
      sessions: abs,
      versions: [{ ...v1(title, room, type, desc, abs), color }],
    };
  };

  return [
    mkPublished('潮汐之后', 'A01 · 主展厅', '装置',
      '一件记录海岸线变化的沉浸式影像装置。', colors[0], openSessions),
    mkPublished('未寄出的信', 'B02 · 纸上时间', '档案',
      '来自三代人的手写信件与声音档案。', colors[1], pendingSessions),
    mkPublished('柔软的边界', 'C01 · 新媒介', '互动',
      '观众的移动会改变墙面上的光影。', colors[2], closedSessions),
    {
      id: uid(),
      title: '纸上回响',
      room: 'A01 · 主展厅',
      type: '绘画',
      desc: '以铅笔与水彩复刻旧照片里的家庭场景。',
      audio: '',
      color: colors[3],
      sessions: draftSessions.map(s => ({ ...s })),
      versions: [],
    },
  ];
}
