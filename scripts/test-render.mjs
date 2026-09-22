// 渲染冒烟测试：用 vite 的 SSR 模块通道加载真实页面（处理 JSX/CSS，不新增依赖），
// 服务端渲染一次工作台与访客视图，验证关键内容与状态标签都在。
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, logLevel: 'error', appType: 'custom' });
try {
  const mod = await server.ssrLoadModule('/src/main.jsx');
  const html = renderToString(React.createElement(mod.App));
  if (!html.includes('展项预约发布')) throw new Error('工作台标题缺失');
  if (!html.includes('开放 / 闭馆时刻')) throw new Error('时间区间编辑区缺失');
  if (!html.includes('发布记录')) throw new Error('发布记录区缺失');
  if (!/开放中/.test(html) || !/待开放/.test(html) || !/已闭馆/.test(html) || !/草稿/.test(html)) {
    throw new Error('四种状态标签未全部呈现');
  }
  console.log('render smoke: workspace rendered with all states');
} finally {
  await server.close();
}
