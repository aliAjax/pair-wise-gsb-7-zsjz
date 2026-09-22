import React, { useEffect, useRef, useState } from 'react';
import Workbench from './ui/Workbench.jsx';
import Visitor from './ui/Visitor.jsx';
import { loadExhibits, persist } from './data/store.js';
import {
  exhibitId, emptyWindow, validatePublish, freezeRecord,
} from './domain/schedule.js';

const COLORS = ['#e6b45d', '#ef8f84', '#83b9b1', '#9ba7dc', '#7fa98e', '#c98f6b'];

export default function App() {
  const [exhibits, setExhibits] = useState(loadExhibits);
  const [selectedId, setSelectedId] = useState(() => exhibits[0]?.id);
  const [view, setView] = useState('edit'); // edit | visitor
  const [now, setNow] = useState(Date.now());
  const [publishError, setPublishError] = useState(null); // { exhibitId, errors, conflicts }
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  // 展项状态（开放 / 待开放 / 闭馆）全部由时间派生，每 30 秒重新判定
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // 任何改动立即落盘，刷新后展项、时间区间与访客列表保持一致
  useEffect(() => { persist(exhibits); }, [exhibits]);

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  };

  const updateExhibit = (id, fn) => {
    setExhibits((list) => list.map((x) => (x.id === id ? fn(x) : x)));
  };

  const actions = {
    select: (id) => { setSelectedId(id); setPublishError(null); },

    addExhibit: ({ title, room }) => {
      const id = exhibitId();
      setExhibits((list) => [...list, {
        id,
        draft: {
          title: title.trim(), room: room.trim(), type: '装置', desc: '', audio: '',
          color: COLORS[list.length % COLORS.length], windows: [], reason: '',
        },
        records: [],
      }]);
      setPublishError(null);
      return id;
    },

    patchDraft: (id, key, value) => {
      updateExhibit(id, (x) => ({ ...x, draft: { ...x.draft, [key]: value } }));
      setPublishError(null);
    },

    patchWindow: (id, index, key, value) => {
      updateExhibit(id, (x) => ({
        ...x,
        draft: {
          ...x.draft,
          windows: x.draft.windows.map((w, i) => (i === index ? { ...w, [key]: value } : w)),
        },
      }));
      setPublishError(null);
    },

    addWindow: (id) => {
      updateExhibit(id, (x) => ({ ...x, draft: { ...x.draft, windows: [...x.draft.windows, emptyWindow()] } }));
    },

    removeWindow: (id, index) => {
      updateExhibit(id, (x) => ({
        ...x,
        draft: { ...x.draft, windows: x.draft.windows.filter((_, i) => i !== index) },
      }));
      setPublishError(null);
    },

    // 发布：先判定，任何冲突都整次中止，不写入任何数据；通过后一次性原子写入
    publish: (id) => {
      const target = exhibits.find((x) => x.id === id);
      const check = validatePublish(target, exhibits);
      if (!check.ok) {
        setPublishError({ exhibitId: id, errors: check.errors, conflicts: check.conflicts });
        notify('保存失败：存在冲突，请按提示调整');
        return;
      }
      const record = freezeRecord(target);
      setExhibits((list) => list.map((x) => (x.id === id
        ? { ...x, records: [...x.records, record], draft: { ...x.draft, reason: '' } }
        : x)));
      setPublishError(null);
      notify(record.version === 1 ? '已发布，访客现在可在开放时段看到该展项' : `已冻结当前内容并生成 v${record.version}`);
    },

    notify,
  };

  return (
    <>
      {view === 'visitor' ? (
        <Visitor
          exhibits={exhibits}
          selectedId={selectedId}
          now={now}
          onSelect={(id) => setSelectedId(id)}
          onBack={() => setView('edit')}
        />
      ) : (
        <Workbench
          exhibits={exhibits}
          selectedId={selectedId}
          now={now}
          publishError={publishError}
          actions={actions}
          onVisitor={() => setView('visitor')}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
