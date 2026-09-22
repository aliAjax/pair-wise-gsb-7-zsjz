import React, { useState } from 'react';
import { deriveState } from '../domain/schedule.js';
import { StateBadge, ScheduleHint } from './components.jsx';
import ExhibitEditor from './ExhibitEditor.jsx';

const FILTERS = [
  { key: '全部', match: () => true },
  { key: '开放中', match: (s) => s === 'live' },
  { key: '待开放', match: (s) => s === 'scheduled' },
  { key: '草稿', match: (s) => s === 'draft' },
  { key: '已闭馆', match: (s) => s === 'closed' },
];

function Workbench({ exhibits, selectedId, now, publishError, actions, onVisitor }) {
  const [filter, setFilter] = useState('全部');
  const [quick, setQuick] = useState({ title: '', room: '' });
  const current = exhibits.find((x) => x.id === selectedId) || exhibits[0];

  const rows = exhibits
    .map((x) => ({ x, state: deriveState(x, now) }))
    .filter(({ state }) => FILTERS.find((f) => f.key === filter).match(state));

  const exportData = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exhibits, null, 2)], { type: 'application/json' }));
    a.download = 'exhibition-guide.json';
    a.click();
    actions.notify('已导出展项数据（含全部发布记录）');
  };

  const addQuick = () => {
    if (!quick.title.trim()) {
      actions.notify('请先填写展项标题');
      return;
    }
    const id = actions.addExhibit(quick);
    setQuick({ title: '', room: '' });
    actions.select(id);
  };

  return (
    <div className="app">
      <aside>
        <div className="brand"><span className="mark">M</span><span>展览工作台</span></div>
        <div className="side-label">当前项目</div>
        <div className="project">
          <span className="project-dot" />
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
            <button className="secondary" onClick={onVisitor}>◉ 访客预览</button>
          </div>
        </header>

        <div className="content">
          <section className="list-pane">
            <div className="list-head">
              <div><h2>全部展项</h2><span>{exhibits.length} 个展项</span></div>
            </div>
            <div className="filters">
              {FILTERS.map((f) => (
                <button key={f.key} className={filter === f.key ? 'selected' : ''} onClick={() => setFilter(f.key)}>{f.key}</button>
              ))}
            </div>
            <div className="exhibit-list">
              {rows.map(({ x, state }) => (
                <button className={`exhibit-row ${current?.id === x.id ? 'chosen' : ''}`} key={x.id} onClick={() => actions.select(x.id)}>
                  <span className="thumb" style={{ background: x.draft?.color || x.records[0]?.snapshot.color }}>
                    {String(x.id).padStart(2, '0')}
                  </span>
                  <span className="row-copy">
                    <strong>{x.draft?.title || x.records[0]?.snapshot.title}</strong>
                    <small>{x.draft?.room || x.records[0]?.snapshot.room} · v{x.records.length}</small>
                    <ScheduleHint exhibit={x} now={now} />
                  </span>
                  <StateBadge state={state} />
                  <span className="chev">›</span>
                </button>
              ))}
              {rows.length === 0 && <div className="empty-list">当前筛选下没有展项</div>}
            </div>
          </section>

          <section className="form-panel">
            <div className="panel-title">
              <div><span className="eyebrow">EDIT EXHIBIT</span><h2>编辑展项</h2></div>
              {current && <StateBadge state={deriveState(current, now)} />}
            </div>
            {current && (
              <ExhibitEditor
                key={current.id}
                exhibit={current}
                now={now}
                error={publishError && publishError.exhibitId === current.id ? publishError : null}
                onPatch={(k, v) => actions.patchDraft(current.id, k, v)}
                onWindowPatch={(i, k, v) => actions.patchWindow(current.id, i, k, v)}
                onAddWindow={() => actions.addWindow(current.id)}
                onRemoveWindow={(i) => actions.removeWindow(current.id, i)}
                onPublish={() => actions.publish(current.id)}
              />
            )}
            <div className="new-form">
              <div className="panel-title"><div><span className="eyebrow">NEW ENTRY</span><h2>快速添加展项</h2></div></div>
              <div className="two">
                <input placeholder="展项标题" value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} />
                <input placeholder="展厅编号，如 A01 · 主展厅" value={quick.room} onChange={(e) => setQuick({ ...quick, room: e.target.value })} />
              </div>
              <button className="primary full" onClick={addQuick}>保存新展项（草稿）</button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Workbench;
