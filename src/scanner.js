import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { estimateTokens } from './tokens.js';

const SKILL_FILE_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);

/**
 * Directories that are commonly used as skill roots by agent tools.
 * The AppData path only makes sense on Windows.
 *
 * @returns {string[]}
 */
export function getDefaultRoots() {
  const home = os.homedir();
  const roots = [
    path.join(home, '.claude', 'skills'),
    path.join(home, '.codex', 'skills'),
    path.join(home, '.cursor', 'skills'),
    path.join(home, '.config', 'opencode', 'skills'),
  ];

  if (process.platform === 'win32') {
    roots.push(path.join(home, 'AppData', 'Roaming', 'Claude', 'skills'));
  }

  return roots;
}

export const DEFAULT_ROOTS = getDefaultRoots();

function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

async function collectFiles(directory, baseDirectory, collected) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    // A disappearing or unreadable directory should not abort the scan.
    return;
  }

  entries.sort((a, b) => compareText(a.name, b.name));

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(fullPath, baseDirectory, collected);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!SKILL_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    collected.push({
      fullPath,
      relativePath: toPosixPath(path.relative(baseDirectory, fullPath)),
    });
  }
}

async function scanSkillDirectory(name, directory) {
  const collected = [];
  await collectFiles(directory, directory, collected);

  let files = 0;
  let chars = 0;
  let tokens = 0;
  let largestFile = null;
  let largestFileChars = -1;

  for (const file of collected) {
    let content;
    try {
      content = await readFile(file.fullPath, 'utf8');
    } catch {
      continue;
    }

    const fileChars = content.length;
    files += 1;
    chars += fileChars;
    tokens += estimateTokens(content);

    if (fileChars > largestFileChars) {
      largestFileChars = fileChars;
      largestFile = file.relativePath;
    }
  }

  return { name, dir: directory, files, chars, tokens, largestFile };
}

/**
 * Scan skill roots. Every immediate subdirectory of a root is treated as one
 * skill. Missing or unreadable roots are skipped.
 *
 * @param {string[] | string} roots
 * @returns {Promise<Array<{
 *   name: string,
 *   dir: string,
 *   files: number,
 *   chars: number,
 *   tokens: number,
 *   largestFile: string | null
 * }>>}
 */
export async function scanSkills(roots) {
  const inputRoots = Array.isArray(roots) ? roots : roots ? [roots] : [];
  const seenRoots = new Set();
  const uniqueRoots = [];

  for (const root of inputRoots) {
    if (typeof root !== 'string' || root.trim() === '') continue;
    const resolved = path.resolve(root);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seenRoots.has(key)) continue;
    seenRoots.add(key);
    uniqueRoots.push(resolved);
  }

  const skills = [];

  for (const root of uniqueRoots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => compareText(a.name, b.name));

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      skills.push(await scanSkillDirectory(entry.name, directory));
    }
  }

  skills.sort(
    (a, b) =>
      b.tokens - a.tokens ||
      compareText(a.name, b.name) ||
      compareText(a.dir, b.dir),
  );

  return skills;
}
