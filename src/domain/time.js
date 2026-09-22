// 纯时间工具：ISO 字符串与 datetime-local 控件值互转、展示格式化
const pad = (n) => String(n).padStart(2, '0');

// ISO -> datetime-local 需要的本地时区字符串（YYYY-MM-DDTHH:mm）
export function toInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local 控件值 -> ISO；为空或非法时返回 ''
export function fromInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

export function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtShort(iso) {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fmtRange = (w) => `${fmtDateTime(w.openAt)} → ${fmtDateTime(w.closeAt)}`;
