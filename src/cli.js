#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDefaultRoots, scanSkills } from './scanner.js';
import { buildReport, renderReport } from './report.js';

const VERSION = '0.1.0';

const USAGE = `context-budget ${VERSION}

算出你的 AI agent 每轮对话被 skill 收了多少 "税"。

用法:
  node src/cli.js [scan] [options]

选项:
  --root <dir>      追加一个 skill 根目录（可重复）
  --window <n>      上下文窗口大小，默认 200000
  --top <n>         表格显示前 n 个 skill，默认 10
  --json            输出 JSON，便于脚本处理
  --no-color        禁用 ANSI 颜色
  -h, --help        显示帮助
  -v, --version     显示版本

示例:
  node src/cli.js
  node src/cli.js --root ./my-skills --window 128000 --top 5
  node src/cli.js --json`;

function readValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} 需要一个值`);
  }
  return value;
}

function parsePositiveInteger(value, option) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${option} 必须是正整数，收到 "${value}"`);
  }
  return number;
}

/**
 * @param {string[]} argv
 * @returns {{
 *   command: string,
 *   roots: string[],
 *   window: number,
 *   top: number,
 *   json: boolean,
 *   color: boolean,
 *   help: boolean,
 *   version: boolean
 * }}
 */
export function parseArgs(argv = []) {
  const options = {
    command: 'scan',
    roots: [],
    window: 200_000,
    top: 10,
    json: false,
    color: true,
    help: false,
    version: false,
  };

  let sawCommand = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === 'scan') {
      if (sawCommand) throw new Error('只能指定一个子命令');
      sawCommand = true;
      options.command = 'scan';
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--version' || arg === '-v') {
      options.version = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--no-color') {
      options.color = false;
      continue;
    }

    if (arg === '--root' || arg.startsWith('--root=')) {
      const value = arg.startsWith('--root=')
        ? arg.slice('--root='.length)
        : readValue(argv, index, '--root');
      if (!arg.startsWith('--root=')) index += 1;
      if (value.trim() === '') throw new Error('--root 不能为空');
      options.roots.push(value);
      continue;
    }

    if (arg === '--window' || arg.startsWith('--window=')) {
      const value = arg.startsWith('--window=')
        ? arg.slice('--window='.length)
        : readValue(argv, index, '--window');
      if (!arg.startsWith('--window=')) index += 1;
      options.window = parsePositiveInteger(value, '--window');
      continue;
    }

    if (arg === '--top' || arg.startsWith('--top=')) {
      const value = arg.startsWith('--top=')
        ? arg.slice('--top='.length)
        : readValue(argv, index, '--top');
      if (!arg.startsWith('--top=')) index += 1;
      options.top = parsePositiveInteger(value, '--top');
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`未知选项: ${arg}`);
    }

    throw new Error(`未知子命令: ${arg}`);
  }

  return options;
}

function printNoSkills(stdout, roots) {
  const lines = [
    '没有找到任何 skill。',
    '',
    '已扫描以下目录：',
    ...roots.map((root) => `  - ${root}`),
    '',
    '不存在的目录会自动跳过。每个 skills 目录下的每个子目录算一个 skill。',
    '用 --root <dir> 追加自定义目录，例如：',
    '  node src/cli.js --root ./my-skills',
  ];
  stdout.write(`${lines.join('\n')}\n`);
}

/**
 * Run the CLI.
 *
 * @param {string[]} argv
 * @param {{stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream}} [io]
 * @returns {Promise<number>} exit code
 */
export async function run(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`错误：${error.message}\n\n${USAGE}\n`);
    return 1;
  }

  if (options.help) {
    stdout.write(`${USAGE}\n`);
    return 0;
  }

  if (options.version) {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  const roots = [
    ...getDefaultRoots(),
    ...options.roots.map((root) => path.resolve(root)),
  ];

  let skills;
  try {
    skills = await scanSkills(roots);
  } catch (error) {
    stderr.write(`扫描失败：${error.message}\n`);
    return 1;
  }

  const report = buildReport(skills, {
    window: options.window,
    top: options.top,
  });

  if (options.json) {
    stdout.write(`${JSON.stringify({ ...report, roots }, null, 2)}\n`);
    return 0;
  }

  if (skills.length === 0) {
    printNoSkills(stdout, roots);
    return 0;
  }

  const color =
    options.color &&
    Boolean(stdout.isTTY) &&
    !('NO_COLOR' in process.env);

  stdout.write(`${renderReport(report, { color })}\n`);
  return 0;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (import.meta.url === invokedPath) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`未处理的错误：${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
