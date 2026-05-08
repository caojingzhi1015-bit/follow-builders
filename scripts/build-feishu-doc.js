#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
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

function toMarkdownLine(line) {
  const normalized = String(line || '').replace(/\r/g, '');
  if (!normalized.trim()) return '';
  if (/^https?:\/\//.test(normalized.trim())) return normalized.trim();
  return normalized.replace(/\*\*(.+?)\*\*/g, (_, content) => `**${content.trim()}**`);
}

function digestToMarkdown(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const title = extractTitle(text);
  const body = [];

  body.push(`# ${title}`);
  body.push('');

  let firstContentSeen = false;

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (line === 'Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders') {
      continue;
    }

    if (['导语', 'X / 推特动态', '技术博客', '播客动态'].includes(line)) {
      if (firstContentSeen) body.push('');
      body.push(`## ${line}`);
      body.push('');
      firstContentSeen = true;
      continue;
    }

    body.push(toMarkdownLine(rawLine));
  }

  while (body.length > 0 && !body[body.length - 1].trim()) {
    body.pop();
  }

  body.push('');
  body.push('---');
  body.push('Generated through the Follow Builders skill: https://github.com/zarazhangrui/follow-builders');
  return body.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 && args[outputIdx + 1] ? args[outputIdx + 1] : '';

  const text = await readInput();
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    console.error('Digest text is empty');
    process.exit(1);
  }

  const markdown = digestToMarkdown(normalizedText);

  if (outputPath) {
    await writeFile(outputPath, markdown, 'utf-8');
  } else {
    process.stdout.write(markdown);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
