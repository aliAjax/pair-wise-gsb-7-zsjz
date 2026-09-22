import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './schedule.css';
import {
  ROOM_LIMIT,
  uid,
  newSession,
  fmtDateTime,
  fmtRange,
  fmtShortRange,
  toInputValue,
  fromInputValue,
  exhibitState,
  isPublished,
  nearestSession,
  planPublish,
  applyPublish,
} from './domain/schedule.js';
import { loadExhibits, saveExhibits } from './storage/store.js';

const STATE_LABEL = { draft: '草稿', pending: '待开放', open: '开放中', closed: '已闭馆' };
const FILTERS = ['全部', '开放中', '待开放', '已闭馆', '草稿'];

// 从展项初始化编辑缓冲区：已发布展项取最新冻结版本，草稿取工作区资料
const bufferOf = ex => {
  const v = isPublished(ex) ? ex.versions[ex.versions.length - 1] : ex;
  return {
    title: v.title,
    room: v.room,
    type: v.type,
    desc: v.desc,
    audio: v.audio,
    sessions: (v.sessions || []).map(s => ({ ...s })),
  };
};

function App() {
  const [exhibits, setExhibits] = useState(loadExhibits);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('edit');
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');

  // 每 30 秒校准一次时刻：开放到时自动可见、闭馆到时自动隐藏，无需手动刷新
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // 展项、时间区间、发布记录统一持久化；刷新后工作台与访客列表读到同一份数据
  useEffect(() => saveExhibits(exhibits), [exhibits]);

  const current = exhibits.find(x => x.id === selected) || exhibits[0];

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exhibits, null, 2)], { type: 'application/json' }));
    a.download = 'exhibition-guide.json';
    a.click();
    setNotice('已导出展项数据');
  };

  if (view === 'visitor')
    return <VisitorView exhibits={exhibits} now={now} onBack={() => setView('edit')} onOpen={id => { setSelected(id); setView('detail'); }} />;
  if (view === 'detail')
    return <DetailView ex={current} now={now} onBack={() => setView('visitor')} setNotice={setNotice} />;

  return (
    <Workspace
      exhibits={exhibits}
      setExhibits={setExhibits}
      current={current}
      selected={selected}
      setSelected={setSelected}
      now={now}
      onPreview={() => setView('visitor')}
      exportData={exportData}
      setNotice={setNotice}
    />
  );
}

// ---------------- 工作台 ----------------
function Workspace({ exhibits, setExhibits, current, selected, setSelected, now, onPreview, exportData, setNotice }) {
  const [filter, setFilter] = useState('全部');
  const [form, setForm] = useState({ title: '', room: '' });
  const [buf, setBuf] = useState(() => (current ? bufferOf(current) : null));
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState(null); // {errors:[],conflicts:[]}

  // 切换展项或发布产生新版本后，重置编辑缓冲区
  useEffect(() => {
    if (current) {
      setBuf(bufferOf(current));
      setReason('');
      setFeedback(null);
    }
  }, [current?.id, current?.versions.length]);

  const published = current ? isPublished(current) : false;

  // 未发布草稿：编辑即时自动保存；已发布展项：调整停留在缓冲区，不触碰冻结记录
  useEffect(() => {
    if (!current || !buf || published) return;
    setExhibits(list =>
      list.map(x => (x.id === current.id ? { ...x, ...buf, sessions: buf.sessions.map(s => ({ ...s })) } : x))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buf]);

  const states = useMemo(() => {
    const m = new Map();
    exhibits.forEach(x => m.set(x.id, exhibitState(x, now)));
    return m;
  }, [exhibits, now]);

  const visible = filter === '全部' ? exhibits : exhibits.filter(x => states.get(x.id) === filter);

  const dirty = useMemo(() => {
    if (!current || !buf || !published) return false;
    const frozen = bufferOf(current);
    return JSON.stringify(buf) !== JSON.stringify(frozen);
  }, [current, buf, published]);

  const patchBuf = patch => setBuf(b => ({ ...b, ...patch }));
  const patchSession = (id, key, value) =>
    setBuf(b => ({ ...b, sessions: b.sessions.map(s => (s.id === id ? { ...s, [key]: value } : s)) }));
  const addSession = () => setBuf(b => ({ ...b, sessions: [...b.sessions, newSession(0, 0)] }));
  const removeSession = id => setBuf(b => ({ ...b, sessions: b.sessions.filter(s => s.id !== id) }));

  const add = () => {
    if (!form.title.trim()) return;
    const item = {
      id: uid(),
      title: form.title.trim(),
      room: form.room.trim(),
      type: '装置',
      desc: '',
      audio: '',
      color: ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc'][exhibits.length % 4],
      sessions: [],
      versions: [],
    };
    setExhibits([...exhibits, item]);
    setSelected(item.id);
    setForm({ title: '', room: '' });
    setNotice('展项已保存为草稿，请设置开放时间后预约发布');
  };

  // 整次保存：任何校验失败都不改动数据，并指出冲突展项
  const publish = () => {
    const merged = { ...current, ...buf };
    const plan = planPublish(merged, buf.sessions, reason, exhibits, now);
    if (!plan.ok) {
      setFeedback({ errors: plan.errors, conflicts: plan.conflicts });
      setNotice('保存失败，请根据下方提示调整');
      return;
    }
    const next = applyPublish(merged, plan.sessions, reason, now);
    setExhibits(list => list.map(x => (x.id === current.id ? next : x)));
    setFeedback(null);
    setReason('');
    setNotice(published ? `已生成 v${next.versions.length} 版本，旧版本记录已冻结保留` : '预约发布成功：开放前保持草稿，开放时自动对访客可见');
  };

  const discard = () => {
    setBuf(bufferOf(current));
    setReason('');
    setFeedback(null);
  };

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">当前项目</div>
        <div className="project">
          <span className="project-dot"></span>
          <div><strong>潮汐之后</strong><small>2024 春季展</small></div>
          <span>⌄</span>
        </div>
        <nav>
          <button className="active">▧ <span>展项预约发布</span><b>{exhibits.length}</b></button>
          <button>⌁ <span>展厅动线</span></button>
          <button>◉ <span>二维码</span></button>
        </nav>
        <div className="side-foot">
          <button>⚙ 设置</button>
          <small>已自动保存 · 刚刚</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">EXHIBITION BUILDER</span>
            <h1>展项预约发布</h1>
          </div>
          <div className="top-actions">
            <button className="secondary" onClick={exportData}>↓ 导出 JSON</button>
            <button className="secondary" onClick={onPreview}>◉ 访客预览</button>
            {current && (
              <button className="primary" onClick={publish}>
                {published ? '保存为新版本' : '预约发布'} <span>↗</span>
              </button>
            )}
          </div>
        </header>

        <div className="content">
          <section className="list-pane">
            <div className="list-head">
              <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
              <button className="add-btn" onClick={() => document.querySelector('.new-form').scrollIntoView({ behavior: 'smooth' })}>＋ 添加展项</button>
            </div>
            <div className="filters">
              {FILTERS.map(x => (
                <button className={filter === x ? 'selected' : ''} onClick={() => setFilter(x)} key={x}>{x}</button>
              ))}
            </div>
            <div className="exhibit-list">
              {visible.map(x => {
                const st = states.get(x.id);
                const near = nearestSession(x, now);
                return (
                  <button className={'exhibit-row ' + (selected === x.id ? 'chosen' : '')} key={x.id} onClick={() => setSelected(x.id)}>
                    <span className="thumb" style={{ background: x.color }}>{String(x.title).slice(0, 1)}</span>
                    <span className="row-copy">
                      <strong>{x.title}</strong>
                      <small>{x.room} · {near ? fmtShortRange(near) : (st === 'closed' ? '全部场次已闭馆' : '未设置时间')}</small>
                    </span>
                    <span className={'status ' + st}>{STATE_LABEL[st]}</span>
                    <span className="chev">›</span>
                  </button>
                );
              })}
              {!visible.length && <p className="empty-line">该状态下暂无展项</p>}
            </div>
          </section>

          <section className="form-panel">
            {current && buf && (
              <>
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">EDIT EXHIBIT {published && `· V${current.versions.length}`}</span>
                    <h2>{published ? '调整已发布展项' : '编辑展项'}</h2>
                  </div>
                  <span className={'status ' + states.get(current.id)}>{STATE_LABEL[states.get(current.id)]}</span>
                </div>

                {published && dirty && (
                  <div className="dirty-banner">
                    有未保存的调整。已发布记录已冻结，填写调整原因并保存后将生成新版本，访客在此之前看到的仍是当前版本。
                    <button onClick={discard}>放弃调整</button>
                  </div>
                )}

                <div className="editor">
                  <label>展项标题
                    <input value={buf.title} onChange={e => patchBuf({ title: e.target.value })} />
                  </label>
                  <div className="two">
                    <label>所在展厅
                      <input value={buf.room} onChange={e => patchBuf({ room: e.target.value })} />
                    </label>
                    <label>内容类型
                      <select value={buf.type} onChange={e => patchBuf({ type: e.target.value })}>
                        <option>装置</option><option>档案</option><option>互动</option><option>绘画</option>
                      </select>
                    </label>
                  </div>
                  <label>展项介绍
                    <textarea rows="4" value={buf.desc} onChange={e => patchBuf({ desc: e.target.value })} />
                  </label>
                  <label>语音导览 URL
                    <input value={buf.audio} placeholder="https://…" onChange={e => patchBuf({ audio: e.target.value })} />
                    <small className="hint">访客扫描二维码后可播放</small>
                  </label>

                  <ScheduleEditor sessions={buf.sessions} published={published} patchSession={patchSession} addSession={addSession} removeSession={removeSession} />

                  {published && (
                    <label className="reason-field">调整原因（必填，将记入新版本）
                      <input value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：延长周末开放时段 / 更换展厅" />
                    </label>
                  )}

                  {feedback && <Feedback feedback={feedback} />}

                  <button className="primary full" onClick={publish}>
                    {published ? `保存为 v${current.versions.length + 1} 新版本` : '预约发布'} <span>↗</span>
                  </button>
                </div>

                {published && <VersionHistory ex={current} />}

                <div className="new-form">
                  <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
                  <div className="two">
                    <input placeholder="展项标题" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                    <input placeholder="展厅编号" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} />
                  </div>
                  <button className="primary full" onClick={add}>保存为草稿</button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

// ---------------- 时间区间编辑 ----------------
function ScheduleEditor({ sessions, published, patchSession, addSession, removeSession }) {
  return (
    <div className="schedule-block">
      <div className="preview-heading">
        <span>开放 / 闭馆时刻</span>
        <button onClick={addSession}>＋ 添加时间段</button>
      </div>
      <small className="hint schedule-hint">
        开放前保持草稿；进入开放时段访客可见；闭馆时刻后自动对访客隐藏，发布记录保留。同一展项的时间段不可重叠。
      </small>
      <div className="session-list">
        {sessions.map((s, i) => (
          <div className="session-row" key={s.id}>
            <span className="session-no">{i + 1}</span>
            <label>开放
              <input type="datetime-local" value={toInputValue(s.start)} onChange={e => patchSession(s.id, 'start', fromInputValue(e.target.value))} />
            </label>
            <span className="session-arrow">→</span>
            <label>闭馆
              <input type="datetime-local" value={toInputValue(s.end)} onChange={e => patchSession(s.id, 'end', fromInputValue(e.target.value))} />
            </label>
            <button className="session-del" title="删除该时间段" onClick={() => removeSession(s.id)}>✕</button>
          </div>
        ))}
        {!sessions.length && <p className="empty-line">尚未设置时间段，添加后才能预约发布。</p>}
      </div>
    </div>
  );
}

// ---------------- 校验反馈：错误与冲突展项 ----------------
function Feedback({ feedback }) {
  return (
    <div className="feedback">
      {feedback.errors.map((m, i) => <p className="fb-error" key={'e' + i}>✕ {m}</p>)}
      {feedback.conflicts.map((c, i) => (
        <div className="fb-conflict" key={'c' + i}>
          <strong>展厅容量冲突：</strong>
          展厅「{c.room}」在 {fmtDateTime(c.start)} 已有 {ROOM_LIMIT} 个已发布展项同时开放，
          本次保存将达到 {c.count} 个，超出上限。
          {c.titles.length > 0 && <>冲突展项：<em>{c.titles.join('、')}</em>。</>}
          <small>整次保存未生效，请调整开放时间或更换展厅。</small>
        </div>
      ))}
    </div>
  );
}

// ---------------- 版本记录（冻结，只读） ----------------
function VersionHistory({ ex }) {
  return (
    <div className="history">
      <div className="preview-heading"><span>发布记录（{ex.versions.length} 个版本，已冻结）</span></div>
      <div className="version-list">
        {[...ex.versions].reverse().map(v => (
          <div className={'version-card ' + (v.version === ex.versions.length ? 'current' : '')} key={v.version}>
            <div className="version-head">
              <strong>V{v.version}{v.version === ex.versions.length ? ' · 当前访客可见版本' : ''}</strong>
              <small>{fmtDateTime(v.createdAt)}</small>
            </div>
            <p className="version-reason">调整原因：{v.reason}</p>
            <ul className="version-sessions">
              {v.sessions.map(s => <li key={s.id}>{fmtRange(s)} · {v.room}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- 访客视图：仅开放中的已发布展项可见 ----------------
function VisitorView({ exhibits, now, onBack, onOpen }) {
  const live = exhibits.filter(x => isPublished(x) && exhibitState(x, now) === 'open');
  return (
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
        <button className="ghost" onClick={onBack}>返回编辑</button>
      </header>
      <main className="visitor-main">
        <span className="eyebrow">VISITOR GUIDE / 2024</span>
        <h1>沿着作品，<em>走进</em>另一种时间。</h1>
        <p className="lead">当前开放 {live.length} 个展项，闭馆后将自动从列表隐藏。选择一个展项开始探索。</p>
        <div className="visitor-grid">
          {live.map(x => {
            const v = x.versions[x.versions.length - 1];
            return (
              <article className="visitor-card" key={x.id} onClick={() => onOpen(x.id)}>
                <div className="art" style={{ background: x.color }}><span>V{v.version}</span><i>↗</i></div>
                <div className="card-meta">
                  <small>{v.room}</small>
                  <h3>{v.title}</h3>
                  <p>{v.desc}</p>
                </div>
              </article>
            );
          })}
        </div>
        {!live.length && <p className="empty-line visitor-empty">当前没有开放中的展项。</p>}
      </main>
    </div>
  );
}

function DetailView({ ex, now, onBack, setNotice }) {
  const open = ex && isPublished(ex) && exhibitState(ex, now) === 'open';
  const v = open ? ex.versions[ex.versions.length - 1] : null;
  return (
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
        <button className="ghost" onClick={onBack}>← 全部展项</button>
      </header>
      {!open ? (
        <main className="detail"><p className="empty-line">该展项当前未开放或已闭馆。<button className="ghost" onClick={onBack}>返回列表</button></p></main>
      ) : (
        <main className="detail">
          <div className="detail-art" style={{ background: ex.color }}><span>V{v.version}</span></div>
          <div className="detail-copy">
            <span className="eyebrow">{v.room} / {v.type}</span>
            <h1>{v.title}</h1>
            <p>{v.desc}</p>
            <ul className="detail-sessions">
              {v.sessions.map(s => <li key={s.id}>开放时段：{fmtRange(s)}</li>)}
            </ul>
            {v.audio && <button className="audio" onClick={() => setNotice('正在播放导览音频…')}>▶ 播放语音导览</button>}
            <div className="qr">
              <div className="qr-box">▦</div>
              <div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export { App };

// 浏览器环境才挂载（Node 下用于无 DOM 的判定/存储测试）
if (typeof document !== 'undefined') {
  createRoot(document.getElementById('root')).render(<App />);
}
