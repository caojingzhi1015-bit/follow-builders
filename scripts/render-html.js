#!/usr/bin/env node

import { readFile } from 'fs/promises';

async function readInput() {
  const args = process.argv.slice(2);

  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return readFile(args[fileIdx + 1], 'utf-8');
  }

  const messageIdx = args.indexOf('--message');
  if (messageIdx !== -1 && args[messageIdx + 1]) {
    return args[messageIdx + 1];
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function isBullet(line) {
  return /^[-•]\s+/.test(line);
}

function isUrl(line) {
  return /^https?:\/\//.test(line.trim());
}

function normalizeLine(line) {
  return line.replace(/\r/g, '').trim();
}

function getSectionClass(title) {
  if (title.includes('X / 推特')) return 'section-x';
  if (title.includes('技术博客')) return 'section-blog';
  if (title.includes('播客动态')) return 'section-podcast';
  return '';
}

function looksLikePreparedJson(text) {
  return text.trim().startsWith('{') && text.includes('"podcasts"') && text.includes('"x"');
}

function buildJsonFallbackHtml(rawText) {
  const data = JSON.parse(rawText);
  const generatedAt = data.generatedAt || new Date().toISOString();
  const dateText = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(generatedAt));

  return {
    title: `${dateText} AI行业资讯日报`,
    sections: [
      {
        title: '导语',
        lines: [
          '当前一键命令已经成功拉取到最新 feed，但输入内容仍是 prepare-digest.js 的原始 JSON。',
          '这说明你还需要在生成链路里补上“LLM 重写摘要”这一步，之后再交给 render-html.js 渲染。',
          '',
          `- **X / 推特来源数**：${data.stats?.xBuilders ?? 0}`,
          `- **推文总数**：${data.stats?.totalTweets ?? 0}`,
          `- **博客文章数**：${data.stats?.blogPosts ?? 0}`,
          `- **播客期数**：${data.stats?.podcastEpisodes ?? 0}`,
          `- **Feed 生成时间**：${data.stats?.feedGeneratedAt || '未知'}`,
          '',
          '下一步建议：先让 Claude 按 prompts 生成中文 digest 文本，再把该文本导出成 HTML。'
        ]
      }
    ]
  };
}

function linesToBlocks(lines) {
  const blocks = [];
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list });
      list = [];
    }
  }

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (isBullet(line)) {
      flushParagraph();
      list.push(line.replace(/^[-•]\s+/, ''));
      continue;
    }

    if (isUrl(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'link', url: line });
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function splitSections(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const title = normalizeLine(lines.shift() || 'AI行业资讯日报');
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) {
      if (current) current.lines.push('');
      continue;
    }

    if (['X / 推特动态', '技术博客', '播客动态'].includes(line)) {
      current = { title: line, lines: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: '导语', lines: [] };
      sections.push(current);
    }

    current.lines.push(rawLine);
  }

  return { title, sections };
}

function splitSectionItems(lines) {
  const items = [];
  let current = [];

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);
    if (!line) {
      if (current.length > 0) {
        items.push(current);
        current = [];
      }
      continue;
    }

    if (/^\*\*.+\*\*（.+）$/.test(line) && current.length > 0) {
      items.push(current);
      current = [rawLine];
      continue;
    }

    current.push(rawLine);
  }

  if (current.length > 0) {
    items.push(current);
  }

  return items;
}

function extractCardEyebrow(itemLines) {
  const first = normalizeLine(itemLines[0] || '');
  const match = first.match(/^\*\*(.+?)\*\*（(.+?)）$/);
  if (!match) return { title: '', meta: '' };
  return { title: match[1], meta: match[2] };
}

function renderBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'paragraph') {
      return `            <p>${applyInlineFormatting(block.text)}</p>`;
    }
    if (block.type === 'link') {
      const href = escapeHtml(block.url);
      return `            <p class="link"><a href="${href}">${href}</a></p>`;
    }
    if (block.type === 'list') {
      const items = block.items
        .map((item) => `              <li>${applyInlineFormatting(item)}</li>`)
        .join('\n');
      return `            <ul>\n${items}\n            </ul>`;
    }
    return '';
  }).join('\n');
}

function renderItemCard(itemLines, index) {
  const { title, meta } = extractCardEyebrow(itemLines);
  const contentLines = title ? itemLines.slice(1) : itemLines;
  const blocks = linesToBlocks(contentLines);
  const body = renderBlocks(blocks);

  return `        <article class="digest-card">
          <div class="card-glow"></div>
          <div class="card-inner">
            <div class="card-topline">
              <span class="card-index">${String(index + 1).padStart(2, '0')}</span>
              ${title ? `<div class="card-heading"><h3>${applyInlineFormatting(title)}</h3><p class="card-meta">${escapeHtml(meta)}</p></div>` : '<div class="card-heading"></div>'}
            </div>
            <div class="card-body">
${body}
            </div>
          </div>
        </article>`;
}

function renderSection(section) {
  const sectionClass = getSectionClass(section.title);
  const blocks = linesToBlocks(section.lines);
  const body = renderBlocks(blocks);

  return `    <section class="digest-section ${sectionClass}">
      <div class="section-head">
        <h2>${escapeHtml(section.title)}</h2>
      </div>
      <article class="digest-card section-card">
        <div class="card-glow"></div>
        <div class="card-inner">
          <div class="card-body">
${body}
          </div>
        </div>
      </article>
    </section>`;
}

function getDailyThemeSeed(title) {
  const match = String(title || '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getDailyTheme(title) {
  const themes = [
    {
      bg: '#f3f0ea',
      bgSoft: '#ece7df',
      bgDeep: '#e5ded3',
      text: '#2f302d',
      textSoft: '#5e6059',
      textFaint: '#8a8c84',
      strong: '#232420',
      divider: 'rgba(128, 137, 148, 0.22)',
      cardBg: 'rgba(255, 252, 247, 0.82)',
      cardBorder: 'rgba(139, 156, 171, 0.24)',
      cardShadow: '0 18px 36px rgba(84, 78, 68, 0.08)',
      link: '#6f8794',
      linkHover: '#556b77',
      accent: '#9fb2bc',
      accentSoft: 'rgba(159, 178, 188, 0.18)',
      accentInk: 'rgba(159, 178, 188, 0.12)',
      accentInkSoft: 'rgba(159, 178, 188, 0.06)',
      grain: 'rgba(66, 67, 62, 0.035)'
    },
    {
      bg: '#f4f4ef',
      bgSoft: '#ededE6',
      bgDeep: '#e4e6dc',
      text: '#2c312c',
      textSoft: '#596056',
      textFaint: '#878f84',
      strong: '#212621',
      divider: 'rgba(125, 144, 128, 0.22)',
      cardBg: 'rgba(251, 252, 248, 0.84)',
      cardBorder: 'rgba(146, 164, 149, 0.24)',
      cardShadow: '0 18px 36px rgba(69, 84, 68, 0.07)',
      link: '#6e8978',
      linkHover: '#55705f',
      accent: '#a8b7a3',
      accentSoft: 'rgba(168, 183, 163, 0.18)',
      accentInk: 'rgba(168, 183, 163, 0.12)',
      accentInkSoft: 'rgba(168, 183, 163, 0.06)',
      grain: 'rgba(62, 67, 61, 0.032)'
    },
    {
      bg: '#f5f1ef',
      bgSoft: '#eee7e4',
      bgDeep: '#e5ddda',
      text: '#322d2d',
      textSoft: '#625959',
      textFaint: '#918686',
      strong: '#272121',
      divider: 'rgba(151, 132, 137, 0.2)',
      cardBg: 'rgba(255, 251, 250, 0.84)',
      cardBorder: 'rgba(176, 151, 157, 0.22)',
      cardShadow: '0 18px 36px rgba(88, 71, 71, 0.07)',
      link: '#8d7177',
      linkHover: '#735b60',
      accent: '#c2a7ac',
      accentSoft: 'rgba(194, 167, 172, 0.18)',
      accentInk: 'rgba(194, 167, 172, 0.12)',
      accentInkSoft: 'rgba(194, 167, 172, 0.06)',
      grain: 'rgba(67, 61, 61, 0.032)'
    },
    {
      bg: '#f2eee8',
      bgSoft: '#ece5dc',
      bgDeep: '#e3dacd',
      text: '#302c28',
      textSoft: '#625b53',
      textFaint: '#90867c',
      strong: '#25211d',
      divider: 'rgba(150, 132, 112, 0.2)',
      cardBg: 'rgba(255, 251, 246, 0.84)',
      cardBorder: 'rgba(179, 159, 138, 0.22)',
      cardShadow: '0 18px 36px rgba(92, 79, 63, 0.07)',
      link: '#8f7b67',
      linkHover: '#735f4d',
      accent: '#c0ae98',
      accentSoft: 'rgba(192, 174, 152, 0.18)',
      accentInk: 'rgba(192, 174, 152, 0.12)',
      accentInkSoft: 'rgba(192, 174, 152, 0.06)',
      grain: 'rgba(67, 61, 54, 0.032)'
    },
    {
      bg: '#f2f3f1',
      bgSoft: '#ebeeeb',
      bgDeep: '#e1e5e1',
      text: '#2e3133',
      textSoft: '#5b6266',
      textFaint: '#879094',
      strong: '#24282a',
      divider: 'rgba(129, 142, 152, 0.2)',
      cardBg: 'rgba(249, 251, 250, 0.84)',
      cardBorder: 'rgba(149, 165, 172, 0.22)',
      cardShadow: '0 18px 36px rgba(70, 81, 86, 0.07)',
      link: '#73878f',
      linkHover: '#596a71',
      accent: '#a9b9be',
      accentSoft: 'rgba(169, 185, 190, 0.18)',
      accentInk: 'rgba(169, 185, 190, 0.12)',
      accentInkSoft: 'rgba(169, 185, 190, 0.06)',
      grain: 'rgba(60, 66, 69, 0.03)'
    }
  ];

  const seed = getDailyThemeSeed(title);
  const index = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % themes.length;
  return themes[index];
}

function buildThemeCssVars(theme) {
  return `
      --bg: ${theme.bg};
      --bg-soft: ${theme.bgSoft};
      --bg-deep: ${theme.bgDeep};
      --text: ${theme.text};
      --text-soft: ${theme.textSoft};
      --text-faint: ${theme.textFaint};
      --strong: ${theme.strong};
      --divider: ${theme.divider};
      --card-bg: ${theme.cardBg};
      --card-border: ${theme.cardBorder};
      --card-shadow: ${theme.cardShadow};
      --link: ${theme.link};
      --link-hover: ${theme.linkHover};
      --accent: ${theme.accent};
      --accent-soft: ${theme.accentSoft};
      --accent-ink: ${theme.accentInk};
      --accent-ink-soft: ${theme.accentInkSoft};
      --grain: ${theme.grain};`;
}

function renderHtmlDocument(title, sections) {
  const content = sections.map(renderSection).join('\n\n');
  const theme = getDailyTheme(title);
  const themeCssVars = buildThemeCssVars(theme);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
${themeCssVars}
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      min-height: 100%;
    }

    body {
      position: relative;
      margin: 0;
      overflow-x: hidden;
      background:
        radial-gradient(circle at 12% 18%, var(--accent-ink) 0, transparent 24%),
        radial-gradient(circle at 86% 12%, var(--accent-ink-soft) 0, transparent 22%),
        radial-gradient(circle at 82% 84%, var(--accent-ink-soft) 0, transparent 24%),
        linear-gradient(180deg, var(--bg-soft) 0%, var(--bg) 56%, var(--bg-deep) 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      line-height: 1.88;
      letter-spacing: 0.01em;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(118deg, transparent 0%, transparent 44%, var(--accent-ink) 48%, transparent 52%, transparent 100%),
        linear-gradient(72deg, transparent 0%, transparent 56%, var(--accent-ink-soft) 60%, transparent 64%, transparent 100%),
        radial-gradient(circle at 8% 24%, var(--accent-soft) 0 2px, transparent 3px),
        radial-gradient(circle at 91% 18%, var(--accent-soft) 0 2px, transparent 3px),
        radial-gradient(circle at 88% 82%, var(--accent-soft) 0 2px, transparent 3px);
      opacity: 0.38;
      mix-blend-mode: multiply;
    }

    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.12;
      background-image:
        radial-gradient(circle at 20% 20%, var(--grain) 0 0.8px, transparent 1px),
        radial-gradient(circle at 80% 30%, var(--grain) 0 0.7px, transparent 1px),
        radial-gradient(circle at 40% 75%, var(--grain) 0 0.8px, transparent 1px);
      background-size: 18px 18px, 24px 24px, 22px 22px;
    }

    .page {
      position: relative;
      z-index: 1;
      width: min(100%, 1180px);
      margin: 0 auto;
      padding: 54px 24px 96px;
    }

    .hero {
      position: relative;
      margin-bottom: 34px;
      padding-bottom: 30px;
      border-bottom: 1px solid var(--divider);
    }

    .hero::after {
      content: "";
      position: absolute;
      left: 0;
      bottom: -1px;
      width: min(240px, 42vw);
      height: 1px;
      background: linear-gradient(90deg, var(--accent), transparent);
    }

    h1 {
      margin: 0;
      font-size: clamp(36px, 5vw, 68px);
      line-height: 1.05;
      font-weight: 800;
      color: var(--strong);
      letter-spacing: -0.035em;
      text-wrap: balance;
    }

    .hero p {
      margin: 16px 0 0;
      max-width: 760px;
      color: var(--text-soft);
      font-size: 15px;
      line-height: 1.9;
    }

    .digest-section {
      position: relative;
      margin: 0 0 30px;
    }

    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--divider);
    }

    .digest-section h2 {
      margin: 0;
      font-size: 12px;
      line-height: 1.4;
      font-weight: 700;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: var(--text-faint);
    }

    .section-card {
      width: 100%;
    }

    .digest-card {
      position: relative;
      overflow: hidden;
      min-width: 0;
      border: 1px solid rgba(255, 255, 255, 0.34);
      border-top-color: rgba(255, 255, 255, 0.55);
      border-left-color: rgba(255, 255, 255, 0.4);
      border-radius: 28px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.22) 18%, rgba(255, 255, 255, 0.14) 100%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.22), transparent 42%),
        var(--card-bg);
      box-shadow:
        0 24px 48px rgba(102, 96, 88, 0.12),
        0 8px 18px rgba(255, 255, 255, 0.18) inset,
        0 -10px 18px rgba(255, 255, 255, 0.08) inset;
      backdrop-filter: blur(18px) saturate(120%);
      -webkit-backdrop-filter: blur(18px) saturate(120%);
    }

    .digest-card::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 100% 0%, var(--accent-ink) 0, transparent 36%),
        radial-gradient(circle at 0% 100%, var(--accent-ink-soft) 0, transparent 34%);
      opacity: 0.72;
    }

    .digest-card::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image:
        linear-gradient(135deg, rgba(255, 255, 255, 0.42) 0%, rgba(255, 255, 255, 0.12) 24%, transparent 48%),
        radial-gradient(circle at 12% 16%, rgba(255, 255, 255, 0.18) 0 1px, transparent 1.4px),
        radial-gradient(circle at 68% 74%, rgba(255, 255, 255, 0.1) 0 1px, transparent 1.5px);
      background-size: auto, 22px 22px, 28px 28px;
      opacity: 0.28;
    }

    .card-glow {
      position: absolute;
      inset: 0 auto auto 0;
      width: 100%;
      height: 1px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.78), var(--accent), transparent 72%);
      pointer-events: none;
      z-index: 1;
      opacity: 0.95;
    }

    .card-inner {
      position: relative;
      z-index: 2;
      padding: 24px 24px 22px;
    }

    .card-topline {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: start;
      margin-bottom: 16px;
    }

    .card-index {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 34px;
      padding: 0 10px;
      border: 1px solid rgba(255, 255, 255, 0.44);
      color: var(--text-faint);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.14em;
      background: rgba(255, 255, 255, 0.34);
      box-shadow: 0 4px 10px rgba(255, 255, 255, 0.12) inset;
      border-radius: 999px;
    }

    .card-heading h3 {
      margin: 0;
      color: var(--strong);
      font-size: 20px;
      line-height: 1.35;
      font-weight: 750;
    }

    .card-meta {
      margin: 6px 0 0;
      color: var(--text-faint);
      font-size: 13px;
      line-height: 1.65;
    }

    .card-body > *:last-child {
      margin-bottom: 0;
    }

    p {
      margin: 0 0 14px;
      color: var(--text);
      font-size: 15px;
      word-break: break-word;
    }

    ul {
      margin: 0 0 14px;
      padding-left: 0;
      list-style: none;
    }

    li {
      position: relative;
      margin: 0 0 12px;
      padding-left: 16px;
      color: var(--text);
      font-size: 15px;
    }

    li::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0.92em;
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
      opacity: 0.7;
      transform: translateY(-50%);
    }

    strong {
      color: var(--strong);
      font-weight: 800;
    }

    .link {
      margin-top: -2px;
      color: var(--text-faint);
      font-size: 13px;
    }

    a {
      color: var(--link);
      text-decoration: none;
      word-break: break-all;
      border-bottom: 1px solid var(--accent-soft);
      transition: color 180ms ease, border-color 180ms ease;
    }

    a:hover {
      color: var(--link-hover);
      border-color: var(--accent);
    }

    @media (max-width: 900px) {
      .section-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .page {
        width: 100%;
        padding: 28px 16px 56px;
      }

      .hero {
        margin-bottom: 22px;
        padding-bottom: 22px;
      }

      .hero p {
        font-size: 14px;
        margin-top: 12px;
      }

      .section-head {
        margin-bottom: 14px;
        padding-bottom: 10px;
      }

      .card-inner {
        padding: 20px 18px 18px;
      }

      .card-topline {
        gap: 12px;
        margin-bottom: 14px;
      }

      .card-heading h3 {
        font-size: 18px;
      }

      .card-meta,
      .link {
        font-size: 12px;
      }

      p,
      li {
        font-size: 14px;
        line-height: 1.84;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p>高质量 AI Builders 日报，面向开发者与行业从业者的深度阅读版本。</p>
    </header>
${content}
  </main>
</body>
</html>`;
}

async function main() {
  const input = (await readInput()).trim();

  if (!input) {
    console.error('Empty digest text');
    process.exit(1);
  }

  const parsed = looksLikePreparedJson(input)
    ? buildJsonFallbackHtml(input)
    : splitSections(input);

  const html = renderHtmlDocument(parsed.title, parsed.sections);
  process.stdout.write(html);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
