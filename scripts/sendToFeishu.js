#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';

const ENV_PATH = join(homedir(), '.follow-builders', '.env');
loadEnv({ path: ENV_PATH });

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

function normalizeText(text) {
  return String(text || '').replace(/\r/g, '').trim();
}

function extractTitle(text) {
  return normalizeText(text.split('\n')[0] || '今日AI行业简报');
}

function extractHtmlLink(args) {
  const htmlIdx = args.indexOf('--html-link');
  if (htmlIdx !== -1 && args[htmlIdx + 1]) {
    return args[htmlIdx + 1].trim();
  }
  return String(process.env.DIGEST_HTML_LINK || '').trim();
}

function splitSections(text) {
  const lines = normalizeText(text).split('\n');
  const sections = [];
  let current = null;

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === 'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders') continue;

    if (['导语', 'X / 推特动态', '技术博客', '播客动态'].includes(line)) {
      current = { title: line, lines: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      current = { title: '导语', lines: [] };
      sections.push(current);
    }

    current.lines.push(line);
  }

  return sections;
}

function buildContentBlocks(section) {
  const blocks = [];
  let buffer = [];

  function flushBuffer() {
    if (buffer.length === 0) return;
    blocks.push({ type: 'text', content: buffer.join('\n') });
    buffer = [];
  }

  for (const line of section.lines) {
    if (/^https?:\/\//.test(line)) {
      flushBuffer();
      blocks.push({ type: 'link', content: line });
      continue;
    }
    buffer.push(line);
  }

  flushBuffer();
  return blocks;
}

function chunkText(text, maxLength = 2600) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const paragraphs = normalized.split('\n');
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n${paragraph}` : paragraph;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (paragraph.length <= maxLength) {
      current = paragraph;
      continue;
    }

    let remaining = paragraph;
    while (remaining.length > maxLength) {
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }
    current = remaining;
  }

  if (current) chunks.push(current);
  return chunks;
}

function buildSectionElements(section) {
  const elements = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${section.title}**`
      }
    }
  ];

  for (const block of buildContentBlocks(section)) {
    if (block.type === 'link') {
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `[查看原文](${block.content})`
        }
      });
      continue;
    }

    for (const part of chunkText(block.content)) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: part
        }
      });
    }
  }

  return elements;
}

function buildCardPayload({ title, text, htmlLink }) {
  const sections = splitSections(text);
  const elements = [
    {
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**今日AI行业简报标题**\n${title}`
      }
    }
  ];

  for (const section of sections) {
    elements.push({ tag: 'hr' });
    elements.push(...buildSectionElements(section));
  }

  elements.push({ tag: 'hr' });
  if (htmlLink) {
    elements.push(
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: '查看网页链接'
            },
            type: 'primary',
            url: htmlLink
          }
        ]
      },
      {
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `网页链接：${htmlLink}`
          }
        ]
      }
    );
  } else {
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: '网页链接：未提供网页链接'
        }
      ]
    });
  }

  return {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true,
        enable_forward: true
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: title
        }
      },
      elements
    }
  };
}

async function sendCard(webhook, payload) {
  const res = await fetch(webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(`Feishu push failed: ${data.msg || res.statusText}`);
  }
}

async function main() {
  const webhook = String(process.env.FEISHU_WEBHOOK || '').trim();
  if (!webhook) {
    console.error('FEISHU_WEBHOOK is not set');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const text = await readInput();
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    console.error('Digest text is empty');
    process.exit(1);
  }

  const title = extractTitle(normalizedText);
  const htmlLink = extractHtmlLink(args);
  const payload = buildCardPayload({ title, text: normalizedText, htmlLink });

  await sendCard(webhook, payload);
  console.log(JSON.stringify({ status: 'ok', message: 'Digest sent to Feishu' }));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
