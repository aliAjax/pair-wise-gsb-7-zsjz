import React from 'react';
import { isVisible, visibleContent, activeWindow } from '../domain/schedule.js';
import { fmtDateTime } from '../domain/time.js';

function Visitor({ exhibits, selectedId, now, onSelect, onBack }) {
  const live = exhibits.filter((x) => isVisible(x, now));
  const current = exhibits.find((x) => x.id === selectedId);

  if (current && isVisible(current, now)) {
    const c = visibleContent(current);
    const w = activeWindow(current, now);
    return (
      <div className="visitor">
        <header>
          <div className="brand"><span className="mark">M</span><span>潮汐美术馆 · 导览</span></div>
          <button className="ghost" onClick={onBack}>← 全部展项</button>
        </header>
        <main className="detail">
          <div className="detail-art" style={{ background: c.color }}>
            <span>{String(current.id).padStart(2, '0')}</span>
          </div>
          <div className="detail-copy">
            <span className="eyebrow">{c.room} / {c.type}</span>
            <h1>{c.title}</h1>
            <p>{c.desc}</p>
            <small className="visitor-window">展期 {fmtDateTime(w.openAt)} 至 {fmtDateTime(w.closeAt)}</small>
            {c.audio && <div><button className="audio">▶ 播放语音导览</button></div>}
            <div className="qr">
              <div className="qr-box">▦</div>
              <div><strong>分享这个展项</strong><small>扫描二维码，在手机上继续阅读</small></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="visitor">
      <header>
        <div className="brand"><span className="mark">M</span><span>潮汐美术馆</span></div>
        <button className="ghost" onClick={onBack}>返回编辑</button>
      </header>
      <main className="visitor-main">
        <span className="eyebrow">VISITOR GUIDE / 2024</span>
        <h1>此刻开放，<em>走进</em>另一种时间。</h1>
        <p className="lead">仅展示当前处于开放时段的展项。选择一个展项开始探索。</p>
        <div className="visitor-grid">
          {live.map((x) => {
            const c = visibleContent(x);
            return (
              <article className="visitor-card" key={x.id} onClick={() => onSelect(x.id)}>
                <div className="art" style={{ background: c.color }}>
                  <span>{String(x.id).padStart(2, '0')}</span><i>↗</i>
                </div>
                <div className="card-meta">
                  <small>{c.room}</small>
                  <h3>{c.title}</h3>
                  <p>{c.desc}</p>
                </div>
              </article>
            );
          })}
        </div>
        {live.length === 0 && <p className="lead" style={{ marginTop: 40 }}>当前没有开放中的展项，请在开放时段再来。</p>}
      </main>
    </div>
  );
}

export default Visitor;
