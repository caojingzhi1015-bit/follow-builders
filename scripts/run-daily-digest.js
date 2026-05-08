#!/usr/bin/env node

import { readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { homedir } from 'os';
import { config as loadEnv } from 'dotenv';

const root = process.cwd();
const scriptsDir = join(root, 'scripts');
const lastDigestPath = join(root, 'last-digest.json');
const digestTextPath = join(root, 'latest-digest.txt');
const markdownPath = join(root, 'latest-digest.md');
const htmlPath = join(root, 'latest-digest.html');
const indexHtmlPath = join(root, 'index.html');
const envPath = join(homedir(), '.follow-builders', '.env');

loadEnv({ path: envPath });

function runNodeScript(file, input = '', extraArgs = []) {
  return spawnSync(process.execPath, [join(scriptsDir, file), ...extraArgs], {
    input,
    encoding: 'utf8',
    env: process.env
  });
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options
  });
}

function requireSuccess(result, fallbackMessage) {
  if (result.status !== 0) {
    const message = (result.stderr || result.stdout || fallbackMessage || 'Command failed').trim();
    throw new Error(message);
  }
  return result;
}

function hasUsableLastDigest() {
  if (!existsSync(lastDigestPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(lastDigestPath, 'utf8'));
    return parsed && parsed.status === 'ok';
  } catch {
    return false;
  }
}

function getMessageTarget() {
  const chatId = process.env.FEISHU_BOT_CHAT_ID?.trim();
  if (chatId) {
    return { mode: 'chat', value: chatId };
  }

  const userId = process.env.FEISHU_BOT_USER_ID?.trim() || process.env.FEISHU_USER_OPEN_ID?.trim() || 'ou_bf7ae172d0c399986a1d4753fe8dde6a';
  if (userId) {
    return { mode: 'user', value: userId };
  }

  return null;
}

function readFileUtf8(path) {
  return readFile(path, 'utf8');
}

async function createDocument(markdownPathValue) {
  const command = `python -c "from pathlib import Path; import sys; text=Path(r'${markdownPathValue.replace(/\\/g, '/')}').read_text(encoding='utf-8'); sys.stdout.buffer.write(text.encode('utf-8'))" | lark-cli docs +create --api-version v2 --doc-format markdown --content -`;
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    env: process.env
  });
  requireSuccess(result, 'Failed to create Feishu document');

  const parsed = JSON.parse(result.stdout);
  const url = parsed?.data?.document?.url;
  if (!url) {
    throw new Error('Feishu document URL missing from docs +create output');
  }
  return { url, raw: parsed };
}

async function sendDocumentLink(docUrl) {
  const text = `今日AI行业日报已更新： ${docUrl}`;

  if (process.env.FEISHU_BOT_CHAT_ID?.trim()) {
    const command = `lark-cli im +messages-send --as bot --chat-id ${JSON.stringify(process.env.FEISHU_BOT_CHAT_ID.trim())} --text ${JSON.stringify(text)}`;
    const chatResult = spawnSync(command, {
      shell: true,
      encoding: 'utf8',
      env: process.env
    });
    requireSuccess(chatResult, 'Failed to send Feishu message');
    return JSON.parse(chatResult.stdout);
  }

  const userId = process.env.FEISHU_BOT_USER_ID?.trim() || process.env.FEISHU_USER_OPEN_ID?.trim() || 'ou_bf7ae172d0c399986a1d4753fe8dde6a';
  const command = `lark-cli im +messages-send --as bot --user-id ${JSON.stringify(userId)} --text ${JSON.stringify(text)}`;
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    env: process.env
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'Failed to send Feishu message');
  }
  requireSuccess(result, 'Failed to send Feishu message');
  return JSON.parse(result.stdout);
}

async function main() {
  let digestJson = '';

  if (hasUsableLastDigest()) {
    digestJson = await readFileUtf8(lastDigestPath);
  } else {
    const prepared = runNodeScript('prepare-digest.js');
    requireSuccess(prepared, 'prepare-digest failed');
    if (!prepared.stdout.trim()) throw new Error('prepare-digest produced empty output');
    digestJson = prepared.stdout;
    await writeFile(lastDigestPath, digestJson, 'utf8');
  }

  const built = runNodeScript('build-digest.js', digestJson);
  requireSuccess(built, 'build-digest failed');
  if (!built.stdout.trim()) throw new Error('build-digest produced empty output');
  await writeFile(digestTextPath, built.stdout, 'utf8');

  const markdownBuilt = runNodeScript('build-feishu-doc.js', built.stdout, ['--output', markdownPath]);
  requireSuccess(markdownBuilt, 'build-feishu-doc failed');

  const rendered = runNodeScript('render-html.js', built.stdout);
  requireSuccess(rendered, 'render-html failed');
  if (!rendered.stdout.trim()) throw new Error('render-html produced empty output');
  await writeFile(htmlPath, rendered.stdout, 'utf8');
  await copyFile(htmlPath, indexHtmlPath);

  const document = await createDocument(markdownPath);
  const message = await sendDocumentLink(document.url);

  process.stdout.write(JSON.stringify({
    status: 'ok',
    digestTextPath,
    markdownPath,
    htmlPath,
    indexHtmlPath,
    documentUrl: document.url,
    message
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
