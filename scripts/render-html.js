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

function renderBlocks(blocks) {
  return blocks.map((block) => {
    if (block.type === 'paragraph') {
      return `        <p>${applyInlineFormatting(block.text)}</p>`;
    }
    if (block.type === 'link') {
      const href = escapeHtml(block.url);
      return `        <p class="link"><a href="${href}">${href}</a></p>`;
    }
    if (block.type === 'list') {
      const items = block.items
        .map((item) => `          <li>${applyInlineFormatting(item)}</li>`)
        .join('\n');
      return `        <ul>\n${items}\n        </ul>`;
    }
    return '';
  }).join('\n');
}

function renderSection(section) {
  const blocks = linesToBlocks(section.lines);
  const body = renderBlocks(blocks);
  const sectionClass = getSectionClass(section.title);

  return `    <section class="digest-section ${sectionClass}">\n      <h2>${escapeHtml(section.title)}</h2>\n${body}\n    </section>`;
}

function renderHtmlDocument(title, sections) {
  const content = sections.map(renderSection).join('\n\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #18202a;
      --muted: #5d6b82;
      --border: #dfe5ef;
      --accent-x: #1d9bf0;
      --accent-blog: #7c4dff;
      --accent-podcast: #ff7a59;
      --strong: #0f172a;
      --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
      color: var(--text);
      line-height: 1.7;
      padding: 20px 14px 40px;
    }

    .page {
      max-width: 780px;
      margin: 0 auto;
    }

    .hero {
      background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 22px 18px;
      box-shadow: var(--shadow);
      margin-bottom: 18px;
    }

    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.3;
      letter-spacing: -0.02em;
    }

    .hero p {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .digest-section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px 16px;
      box-shadow: var(--shadow);
      margin-bottom: 14px;
    }

    .digest-section h2 {
      margin: 0 0 14px;
      font-size: 18px;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .digest-section h2::before {
      content: "";
      display: inline-block;
      width: 6px;
      height: 22px;
      border-radius: 999px;
      background: #9aa6b2;
      flex: 0 0 auto;
    }

    .section-x h2::before {
      background: var(--accent-x);
    }

    .section-blog h2::before {
      background: var(--accent-blog);
    }

    .section-podcast h2::before {
      background: var(--accent-podcast);
    }

    p {
      margin: 0 0 12px;
      font-size: 15px;
      word-break: break-word;
    }

    ul {
      margin: 0 0 12px;
      padding-left: 20px;
    }

    li {
      margin: 0 0 8px;
      font-size: 15px;
    }

    strong {
      color: var(--strong);
      font-weight: 700;
      background: rgba(255, 214, 10, 0.18);
      padding: 0 2px;
      border-radius: 4px;
    }

    .link {
      margin-top: -4px;
    }

    a {
      color: #2563eb;
      text-decoration: none;
      word-break: break-all;
    }

    a:hover {
      text-decoration: underline;
    }

    @media (max-width: 640px) {
      body {
        padding: 14px 10px 28px;
      }

      .hero {
        border-radius: 16px;
        padding: 18px 14px;
      }

      h1 {
        font-size: 24px;
      }

      .digest-section {
        border-radius: 16px;
        padding: 16px 14px;
      }

      .digest-section h2 {
        font-size: 17px;
      }

      p,
      li {
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p>已为手机阅读优化，支持本地直接打开，无需外部资源。</p>
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
