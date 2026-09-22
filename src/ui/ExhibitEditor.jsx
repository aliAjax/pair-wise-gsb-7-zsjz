import React, { useEffect, useState } from 'react';
import {
  emptyWindow, latestRecord, deriveState, draftChanged,
} from '../domain/schedule.js';
import { toInputValue, fromInputValue, fmtDateTime, fmtRange } from '../domain/time.js';
import { StateBadge } from './components.jsx';

// 编辑器以草稿为工作副本；已发布内容保持冻结，发布成功后草稿即与新版本一致
function ExhibitEditor({ exhibit, now, error, onPatch, onWindowPatch, onAddWindow, onRemoveWindow, onPublish }) {
  const rec = latestRecord(exhibit);
  const state = deriveState(exhibit, now);
  const d = exhibit.draft;
  const [browseVersion, setBrowseVersion] = useState(null); // null = 编辑草稿；数字 = 查看冻结版本
  useEffect(() => setBrowseVersion(null), [exhibit.id]);

  const viewing = browseVersion ? exhibit.records.find((r) => r.version === browseVersion) : null;
  const changed = rec ? draftChanged(exhibit) : true;
  const winError = (i) => error?.errors?.[`window-${i}`];

  const field = (label, node, key) => (
    <label>
      {label}
      {node}
      {error?.errors?.[key] && <small className="field-error">{error.errors[key]}</small>}
    </label>
  );

  if (viewing) {
    const snap = viewing.snapshot;
    return (
      <div className="editor">
        <div className="frozen-banner">
          <div>
            <strong>v{viewing.version} 发布记录（已冻结）</strong>
            <small>{fmtDateTime(viewing.publishedAt)} 发布 · 原因：{viewing.reason}</small>
          </div>
          <button className="link-btn" onClick={() => setBrowseVersion(null)}>返回编辑草稿</button>
        </div>
        <div className="frozen-fields">
          <label>展项标题<input value={snap.title} readOnly /></label>
          <div className="two">
            <label>所在展厅<input value={snap.room} readOnly /></label>
            <label>内容类型<input value={snap.type} readOnly /></label>
          </div>
          <label>展项介绍<textarea rows="5" value={snap.desc} readOnly /></label>
          <label>语音导览 URL<input value={snap.audio} readOnly /></label>
        </div>
        <div className="sched-block">
          <div className="sched-head"><strong>开放时间区间</strong></div>
          {snap.windows.map((w) => (
            <div className="window-row frozen" key={w.id}><span className="win-range">{fmtRange(w)}</span></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="editor">
      {field('展项标题', <input value={d.title} onChange={(e) => onPatch('title', e.target.value)} />, 'title')}
      <div className="two">
        {field('所在展厅', <input value={d.room} placeholder="如 A01 · 主展厅" onChange={(e) => onPatch('room', e.target.value)} />, 'room')}
        <label>内容类型
          <select value={d.type} onChange={(e) => onPatch('type', e.target.value)}>
            <option>装置</option><option>档案</option><option>互动</option><option>绘画</option>
          </select>
        </label>
      </div>
      {field('展项介绍', <textarea rows="5" value={d.desc} onChange={(e) => onPatch('desc', e.target.value)} />)}
      {field('语音导览 URL', <input value={d.audio} placeholder="https://…" onChange={(e) => onPatch('audio', e.target.value)} />, 'audio')}
      <small className="hint">访客扫描二维码后可播放</small>

      <div className="sched-block">
        <div className="sched-head">
          <div><strong>预约开放时间</strong><small>同一展项的时间区间不能重叠；闭馆后自动对访客隐藏</small></div>
          <button className="add-window" onClick={onAddWindow}>＋ 添加区间</button>
        </div>
        {error?.errors?.windows && <small className="field-error">{error.errors.windows}</small>}
        {d.windows.length === 0 && <div className="no-window">还没有时间区间，添加后才能发布</div>}
        {d.windows.map((w, i) => (
          <div className={`window-row ${winError(i) ? 'has-error' : ''}`} key={w.id}>
            <span className="win-index">{i + 1}</span>
            <label className="win-time">开放
              <input type="datetime-local" value={toInputValue(w.openAt)}
                onChange={(e) => onWindowPatch(i, 'openAt', fromInputValue(e.target.value))} />
            </label>
            <label className="win-time">闭馆
              <input type="datetime-local" value={toInputValue(w.closeAt)}
                onChange={(e) => onWindowPatch(i, 'closeAt', fromInputValue(e.target.value))} />
            </label>
            <button className="win-del" title="删除该区间" onClick={() => onRemoveWindow(i)}>✕</button>
            {winError(i) && <small className="field-error win-msg">{winError(i)}</small>}
          </div>
        ))}
      </div>

      {error?.errors?.capacity && <CapacityError cap={error.errors.capacity} />}

      <div className="publish-box">
        <label className="reason-label">发布原因 / 变更说明
          <input value={d.reason} placeholder={rec ? '已发布内容冻结，调整需写明原因并生成新版本' : '首次发布需填写原因'}
            onChange={(e) => onPatch('reason', e.target.value)} />
          {error?.errors?.reason && <small className="field-error">{error.errors.reason}</small>}
        </label>
        <div className="publish-foot">
          {rec
            ? <small className={changed ? 'change-warn' : 'change-ok'}>{changed ? '草稿与已发布版本不同，发布将生成 v' + (rec.version + 1) : '草稿与当前已发布版本一致'}</small>
            : <small className="change-warn">尚未发布过</small>}
          <button className="primary" onClick={onPublish}>{rec ? `发布新版本 v${rec.version + 1}` : '发布展项'} <span>↗</span></button>
        </div>
      </div>

      {rec && (
        <div className="versions">
          <div className="sched-head"><strong>发布记录</strong><span className="current-state">当前状态 <StateBadge state={state} /></span></div>
          {[...exhibit.records].reverse().map((r) => (
            <button className={`version-row ${r.version === rec.version ? 'latest' : ''}`} key={r.version} onClick={() => setBrowseVersion(r.version)}>
              <span className="ver-tag">v{r.version}</span>
              <span className="ver-copy">
                <strong>{r.reason}</strong>
                <small>{fmtDateTime(r.publishedAt)} · {r.snapshot.windows.length} 个时间区间</small>
              </span>
              <span className="chev">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CapacityError({ cap }) {
  return (
    <div className="conflict-panel">
      <strong>同展厅同时刻已达 3 个展项上限，本次保存未生效</strong>
      <p>
        “{cap.own}”与已发布展项{' '}
        {cap.conflictTitles.length
          ? cap.conflictTitles.map((t, i) => (
              <em key={t}>{i > 0 ? '、' : ''}{t}</em>
            ))
          : null}
        {' '}在 {fmtDateTime(new Date(cap.at).toISOString())} 时段冲突。请调整开放 / 闭馆时刻后重试。
      </p>
    </div>
  );
}

export default ExhibitEditor;
