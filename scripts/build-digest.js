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
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。！？：；])/g, '$1')
    .replace(/([，。！？：；])\s+/g, '$1')
    .trim();
}

function stripUrls(text) {
  return clean(text.replace(/https?:\/\/\S+/g, ''));
}

function emphasize(text) {
  return `**${clean(text)}**`;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
}

function pickMeaningfulSentence(text) {
  const sentences = stripUrls(text)
    .replace(/([。！？!?])/g, '$1\n')
    .split('\n')
    .map((s) => clean(s))
    .filter(Boolean);

  const ranked = sentences
    .map((sentence) => {
      let score = 0;
      if (/\d/.test(sentence)) score += 3;
      if (/launch|launches|released|release|open|free|context|model|agent|API|MCP|Claude Code|GPT|Sonnet|OpenAI|Anthropic|benchmark|growth|cost|token/i.test(sentence)) score += 3;
      if (sentence.length > 18) score += 1;
      if (/\b(we|they|it|this|that)\b/i.test(sentence)) score += 1;
      return { sentence, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.sentence || clean(text).slice(0, 80);
}

function summarizeTweet(tweet, name) {
  const base = pickMeaningfulSentence(tweet.text);
  const lead = tweet.isQuote ? `${name} 转述并强调` : `${name} 重点提到`;
  const topic = base.length > 36 ? base.slice(0, 36) + '…' : base;
  const parts = [];

  if (tweet.text.includes('80x') || tweet.text.includes('200k') || tweet.text.includes('4.7') || tweet.text.includes('thousands')) {
    parts.push(emphasize(topic));
  } else {
    parts.push(topic);
  }

  const extras = [];
  if (/\d/.test(tweet.text)) extras.push('有明确数字');
  if (/launch|released|free|open|available|request access|webhooks|agent|MCP|Claude Code/i.test(tweet.text)) extras.push('包含产品/能力发布');
  if ((tweet.likes || 0) >= 100 || (tweet.retweets || 0) >= 10 || (tweet.replies || 0) >= 10) extras.push('互动较高');

  const extraText = extras.length > 0 ? `，${extras.join('，')}` : '';
  return `${lead}${extraText}：${parts.join('')}。`;
}

function summarizeTweets(builder) {
  const tweets = (builder.tweets || [])
    .slice()
    .sort((a, b) => ((b.likes || 0) + (b.retweets || 0) + (b.replies || 0)) - ((a.likes || 0) + (a.retweets || 0) + (a.replies || 0)))
    .slice(0, 2);

  if (tweets.length === 0) return null;

  const intro = `${builder.name}`;
  const lines = tweets.map((tweet) => {
    const text = summarizeTweet(tweet, builder.name);
    return `- ${text}\n${tweet.url}`;
  });

  return [`${intro}`, ...lines].join('\n');
}

function summarizeBlogs(blogs) {
  if (!blogs || blogs.length === 0) return [];

  return blogs.map((blog) => {
    const title = clean(blog.title || '未命名文章');
    const source = clean(blog.name || blog.source || '技术博客');
    const snippet = clean(blog.summary || blog.description || blog.content || '');
    const firstSentence = pickMeaningfulSentence(snippet || title);
    const line = firstSentence ? emphasize(firstSentence) : title;
    return `${source}：${title}\n- ${line}\n${blog.url || ''}`.trim();
  });
}

function summarizePodcast(podcast) {
  const title = clean(podcast.title || '播客节目');
  const source = clean(podcast.name || '播客动态');
  const transcript = stripUrls(podcast.transcript || '');
  const sentences = transcript
    .replace(/\n+/g, ' ')
    .replace(/Speaker\s+\d+\s*\|\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g, '')
    .split(/[。！？!?]/)
    .map((s) => clean(s))
    .filter(Boolean);

  const picks = unique(
    sentences
      .map((s) => ({
        s,
        score: (s.match(/\d/g) || []).length + (/(model|agent|Code|Claude|OpenAI|Anthropic|growth|product|future|build|launch|loop|batch|computer use)/i.test(s) ? 3 : 0) + (s.length > 20 ? 1 : 0)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.s)
  );

  const lead = picks[0] ? emphasize(picks[0]) : emphasize('这期内容的核心在于模型能力正在把软件工作流推向更自动化的方向');
  const extras = picks.slice(1).map((p) => `- ${p}`);

  return [`${source}：${title}`, `- ${lead}`, ...extras, podcast.url || ''].filter(Boolean).join('\n');
}

function buildDigest(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid feed JSON');
  }

  if (data.status === 'error') {
    const date = formatDate(new Date());
    return [`${date} AI行业资讯日报`, '', '导语', '', `- ${emphasize('最新 feed 拉取失败')}`, `- 错误信息：${clean(data.message || '未知错误')}`, '', 'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'].join('\n');
  }

  const date = formatDate(normalizeDate(data.generatedAt));
  const sections = [];

  const xItems = Array.isArray(data.x) ? data.x : [];
  const xLines = [];
  for (const builder of xItems) {
    const summary = summarizeTweets(builder);
    if (summary) xLines.push(summary);
  }
  if (xLines.length > 0) {
    sections.push('X / 推特动态');
    sections.push(xLines.join('\n\n'));
  }

  const blogItems = Array.isArray(data.blogs) ? data.blogs : [];
  const blogLines = summarizeBlogs(blogItems);
  if (blogLines.length > 0) {
    sections.push('技术博客');
    sections.push(blogLines.join('\n\n'));
  }

  const podcastItems = Array.isArray(data.podcasts) ? data.podcasts : [];
  if (podcastItems.length > 0) {
    sections.push('播客动态');
    sections.push(podcastItems.map(summarizePodcast).join('\n\n'));
  }

  if (sections.length === 0) {
    return [`${date} AI行业资讯日报`, '', '今日暂无重要更新。', '', 'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'].join('\n');
  }

  return [`${date} AI行业资讯日报`, '', ...sections, '', 'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders'].join('\n');
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
