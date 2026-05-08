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

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clean(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？：；])/g, '$1')
    .replace(/([，。！？：；])\s+/g, '$1')
    .trim();
}

function stripUrls(text) {
  return clean(String(text || '').replace(/https?:\/\/\S+/g, ''));
}

function emphasize(text) {
  const value = clean(text);
  return value ? `**${value}**` : '';
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function formatDate(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getBioLabel(bio = '') {
  const lower = bio.toLowerCase();

  if (lower.includes('ceo @replit')) return 'Replit CEO';
  if (lower.includes('ceo @every')) return 'Every CEO';
  if (lower.includes('product at roblox')) return 'Roblox 产品负责人';
  if (lower.includes('claude code @anthropicai')) return 'Anthropic Claude Code 团队';
  if (lower.includes('president & ceo @ycombinator')) return 'Y Combinator CEO';
  if (lower.includes('builder. dangerously skips permissions')) return 'Follow Builders 作者';
  if (lower.includes('claude is an ai assistant built by @anthropicai')) return 'Anthropic 官方账号';
  if (lower.includes('anthropic')) return 'Anthropic 团队';
  if (lower.includes('openai')) return 'OpenAI 团队';

  const companyMatch = bio.match(/(?:ceo|founder|partner|product|engineer|researcher)\s+@([A-Za-z0-9_.-]+)/i);
  if (companyMatch) return `${companyMatch[1]} 团队`;

  return 'AI Builders 观察者';
}

function getAuthorHeading(name, bio) {
  return `${emphasize(name)}（${getBioLabel(bio)}）`;
}

function splitSentences(text) {
  return stripUrls(text)
    .replace(/\n+/g, ' ')
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map((sentence) => clean(sentence))
    .filter(Boolean);
}

function splitParagraphs(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((part) => clean(part))
    .filter(Boolean);
}

function splitRawLines(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => clean(line))
    .filter(Boolean);
}

function normalizeLongText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatFullTextBlock(label, text) {
  const normalized = normalizeLongText(text);
  if (!normalized) return '';

  const paragraphs = splitParagraphs(normalized);
  if (paragraphs.length > 1) {
    return [label, ...paragraphs].join('\n');
  }

  const lines = splitRawLines(normalized);
  if (lines.length > 1) {
    return [label, ...lines].join('\n');
  }

  return `${label}${clean(normalized)}`;
}

function pickRepresentativeQuote(text) {
  const quoteMatch = String(text || '').match(/["“](.+?)["”]/);
  if (quoteMatch?.[1]) return clean(quoteMatch[1]);
  return pickTopSentences(text, 1)[0] || stripUrls(text);
}

function scoreSentence(sentence) {
  let score = 0;
  if (/\d/.test(sentence)) score += 3;
  if (/agent|model|launch|release|free|context|API|MCP|Claude Code|GPT|Sonnet|Opus|Anthropic|OpenAI|growth|revenue|compute|loop|memory|webhooks/i.test(sentence)) score += 4;
  if (/future|predict|argues|thinks|believe|important|worth|focus|strategy/i.test(sentence)) score += 2;
  if (sentence.length >= 35 && sentence.length <= 180) score += 2;
  return score;
}

function pickTopSentences(text, count = 3) {
  return splitSentences(text)
    .map((sentence) => ({ sentence, score: scoreSentence(sentence) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((item) => item.sentence);
}

function shortenQuote(text, maxLength = 160) {
  const value = clean(text).replace(/^"|"$/g, '');
  if (!value) return '';
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function buildCorePoint(tweet) {
  const top = pickTopSentences(tweet.text, 2);
  const sentence = top[0] || stripUrls(tweet.text);
  if (!sentence) return '这条动态主要围绕 AI 产品与工作流的最新变化展开。';

  if (/80x|growth|revenue|compute/i.test(tweet.text)) {
    return `核心观点：这条动态突出强调了 ${emphasize('模型使用与商业增长正在同步加速')}，背后反映的是算力、需求与产品成熟度的共振。`;
  }

  if (/memory|webhooks|outcomes|agent|loop/i.test(tweet.text)) {
    return `核心观点：这条动态围绕 ${emphasize('agent 工作流能力升级')} 展开，重点不只是功能更新，而是让 AI 系统更接近可持续协作的生产工具。`;
  }

  return `核心观点：${sentence}`;
}

function buildInsight(tweet, builder) {
  const text = tweet.text || '';

  if (/80x|growth|revenue|compute/i.test(text)) {
    return '深度解读：增长与算力被同时强调，说明头部模型厂商当前最核心的约束仍然不是需求，而是供给能力。对开发者来说，这意味着更强模型会持续释放新工作流，但真正的竞争点会逐步转向谁能率先把这些能力产品化。';
  }

  if (/memory|Dreaming|webhooks|Outcomes|agent|loop/i.test(text)) {
    return '深度解读：这类更新的价值不在单一 feature，而在于 agent 正从一次性回答工具，演化为能记忆、评估、迭代、回调的长期执行系统。对开发团队而言，这会直接影响自动化测试、代码审查、异步任务编排等工作方式。';
  }

  if (/phone|thousands|agents|literacy|printing press/i.test(text)) {
    return '深度解读：这里传递的不是单点工具技巧，而是软件生产方式正在发生结构性变化。AI 正在降低构建门槛，并把“会不会写代码”的问题，转向“能否定义问题、组织流程、验证结果”。';
  }

  if (/Code with Claude|come say hi/i.test(text)) {
    return '深度解读：这类内容本身信息密度不高，但它往往反映了产品推广、社区运营和开发者教育正在同步推进。对行业从业者来说，值得关注的不只是技术迭代，还有生态形成的速度。';
  }

  return `深度解读：${builder.name} 这条动态的价值在于，它并不只是给出一个结论，而是在释放其所在团队当前关注的优先级。对于开发者和行业从业者而言，真正值得关注的是这些判断会如何影响工具链、组织流程与下一阶段的产品机会。`;
}

function buildQuote(tweet) {
  const quote = shortenQuote(pickRepresentativeQuote(tweet.text), 220);
  return quote ? `关键引用：“${quote}”` : '关键引用：原文未出现足够有代表性的可引用句子。';
}

function buildFullTweetBody(tweet) {
  return formatFullTextBlock('完整原文：', tweet.text || '');
}

function summarizeTweets(builder) {
  const tweets = (builder.tweets || [])
    .slice()
    .sort((a, b) => ((b.likes || 0) + (b.retweets || 0) + (b.replies || 0)) - ((a.likes || 0) + (a.retweets || 0) + (a.replies || 0)));

  if (tweets.length === 0) return null;

  return tweets.map((tweet) => [
    getAuthorHeading(builder.name, builder.bio),
    buildCorePoint(tweet),
    buildInsight(tweet, builder),
    buildQuote(tweet),
    buildFullTweetBody(tweet),
    `原文链接：${tweet.url}`
  ].filter(Boolean).join('\n')).join('\n\n');
}

function summarizeBlog(blog) {
  const source = clean(blog.name || blog.source || '技术博客');
  const title = clean(blog.title || '未命名文章');
  const body = normalizeLongText(blog.summary || blog.description || blog.content || title);
  const sentence = pickTopSentences(body, 1)[0] || clean(body);
  const fullBody = formatFullTextBlock('完整原文：', body);

  return [
    `${emphasize(source)}：${title}`,
    `核心观点：${sentence}`,
    '深度解读：技术博客的真正价值不在公告本身，而在它通常提前透露了平台接下来会重点投入的能力方向。对开发者而言，这类信息往往比功能列表更值得跟踪，因为它决定了未来工具链与实践方式的演进。',
    `关键引用：“${shortenQuote(pickRepresentativeQuote(body), 220)}”`,
    fullBody,
    blog.url ? `原文链接：${blog.url}` : ''
  ].filter(Boolean).join('\n');
}

function summarizePodcast(podcast) {
  const source = clean(podcast.name || '播客动态');
  const title = clean(podcast.title || '播客节目');
  const transcript = normalizeLongText(
    String(podcast.transcript || '')
      .replace(/Speaker\s+\d+\s*\|\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g, ' ')
      .replace(/\n+/g, '\n')
  );
  const picks = pickTopSentences(transcript, 3);
  const lead = picks[0] || '这期内容聚焦 AI 驱动的软件生产方式变化。';
  const fullBody = formatFullTextBlock('完整原文：', transcript);

  return [
    `${emphasize(source)}：${title}`,
    `核心观点：${lead}`,
    '深度解读：播客内容的价值往往在于，它能把产品表层变化背后的组织逻辑、技术判断与长期趋势说透。对开发者和行业从业者来说，这比单独一条功能发布更有参考意义，因为它更接近决策者对未来的真实判断。',
    `关键引用：“${shortenQuote(pickRepresentativeQuote(transcript), 220)}”`,
    fullBody,
    podcast.url ? `原文链接：${podcast.url}` : ''
  ].filter(Boolean).join('\n');
}

function buildDigest(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid feed JSON');
  }

  const date = formatDate(normalizeDate(data.generatedAt));

  if (data.status === 'error') {
    return [
      `${date} AI行业资讯日报`,
      '',
      '导语',
      '',
      `核心说明：${emphasize('最新 feed 拉取失败')}`,
      `深度解读：当前问题出在上游内容获取环节，而不是本地日报生成逻辑。只要 feed 恢复可用，这条链路就能自动重新产出完整日报。`,
      `关键引用：“${clean(data.message || '未知错误')}”`,
      '',
      'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'
    ].join('\n');
  }

  const sections = [];

  const xItems = Array.isArray(data.x) ? data.x : [];
  const xBlocks = xItems.map(summarizeTweets).filter(Boolean);
  if (xBlocks.length > 0) {
    sections.push('X / 推特动态');
    sections.push(xBlocks.join('\n\n'));
  }

  const blogItems = Array.isArray(data.blogs) ? data.blogs : [];
  const blogBlocks = blogItems.map(summarizeBlog).filter(Boolean);
  if (blogBlocks.length > 0) {
    sections.push('技术博客');
    sections.push(blogBlocks.join('\n\n'));
  }

  const podcastItems = Array.isArray(data.podcasts) ? data.podcasts : [];
  const podcastBlocks = podcastItems.map(summarizePodcast).filter(Boolean);
  if (podcastBlocks.length > 0) {
    sections.push('播客动态');
    sections.push(podcastBlocks.join('\n\n'));
  }

  if (sections.length === 0) {
    return [
      `${date} AI行业资讯日报`,
      '',
      '今日暂无重要更新。',
      '',
      'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'
    ].join('\n');
  }

  return [
    `${date} AI行业资讯日报`,
    '',
    ...sections,
    '',
    'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'
  ].join('\n');
}

async function main() {
  const raw = (await readInput()).trim();
  const data = tryParseJson(raw);

  if (!data) {
    console.error('build-digest.js expects JSON input from prepare-digest.js');
    process.exit(1);
  }

  process.stdout.write(buildDigest(data));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
