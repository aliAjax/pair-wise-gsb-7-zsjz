// 资料层：首次进入时的演示展项（基于当前时刻生成，能看到全部四种状态）
const COLORS = ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc', '#7fa98e', '#c98f6b'];
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const win = (openOffset, closeOffset) => ({
  openAt: new Date(Date.now() + openOffset).toISOString(),
  closeAt: new Date(Date.now() + closeOffset).toISOString(),
});

// 返回全新展项聚合数组；id 由调用方（存储层迁移 / 无数据时）决定是否持久化
export function buildSeed() {
  const frozen = (id, base, version, reason, publishedAt, windows) => ({
    id,
    draft: {
      title: base.title,
      room: base.room,
      type: base.type,
      desc: base.desc,
      audio: base.audio,
      color: base.color,
      windows: windows.map((w) => ({ ...w })),
      reason: '',
    },
    records: [{ version, reason, publishedAt, snapshot: { ...base, windows: windows.map((w) => ({ ...w })) } }],
  });

  return [
    // A01 主展厅：开放中 3 个，正好达到上限，再排一个可演示整次保存被拒
    frozen(1, {
      title: '潮汐之后', room: 'A01 · 主展厅', type: '装置', color: COLORS[0],
      desc: '一件记录海岸线变化的沉浸式影像装置。',
      audio: 'https://example.com/audio.mp3',
    }, 1, '春季展首批展项上线', new Date(Date.now() - 2 * DAY).toISOString(),
      [win(-2 * HOUR, 3 * HOUR)]),

    frozen(2, {
      title: '潮间带观测', room: 'A01 · 主展厅', type: '绘画', color: COLORS[4],
      desc: '以写生记录退潮后滩涂两小时内的光线变化。',
      audio: '',
    }, 1, '配合潮汐主题同期开放', new Date(Date.now() - DAY).toISOString(),
      [win(-HOUR, 5 * HOUR)]),

    frozen(3, {
      title: '海平面档案', room: 'A01 · 主展厅', type: '档案', color: COLORS[5],
      desc: '过去四十年沿海水文站数据的可视化长卷。',
      audio: '',
    }, 2, '补充近十年数据后重新发布', new Date(Date.now() - 3 * HOUR).toISOString(),
      [win(-90 * 60 * 1000, 4 * HOUR)]),

    // 已排期待开放
    frozen(4, {
      title: '未寄出的信', room: 'B02 · 纸上时间', type: '档案', color: COLORS[1],
      desc: '来自三代人的手写信件与声音档案。',
      audio: '',
    }, 1, '布展完成，预约明日开放', new Date(Date.now() - 6 * HOUR).toISOString(),
      [win(DAY, DAY + 4 * HOUR), win(3 * DAY, 3 * DAY + 4 * HOUR)]),

    // 已闭馆：访客不可见，发布记录保留
    frozen(5, {
      title: '柔软的边界', room: 'C01 · 新媒介', type: '互动', color: COLORS[2],
      desc: '观众的移动会改变墙面上的光影。',
      audio: '',
    }, 1, '特展结束，归档保留', new Date(Date.now() - 10 * DAY).toISOString(),
      [win(-8 * DAY, -7 * DAY)]),

    // 纯草稿：从未发布
    {
      id: 6,
      draft: {
        title: '夜间场计划', room: 'C01 · 新媒介', type: '互动', color: COLORS[3],
        desc: '面向夜场访客的低照度声音装置，方案待定稿。',
        audio: '', windows: [], reason: '',
      },
      records: [],
    },
  ];
}
