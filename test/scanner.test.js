import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanSkills } from '../src/scanner.js';
import { estimateTokens } from '../src/tokens.js';

async function createSkill(root, name, files) {
  const directory = path.join(root, name);
  await mkdir(directory, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(directory, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  return directory;
}

test('扫描 3 个 skill，递归统计文件并跳过缺失目录', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'context-budget-scan-'));
  const root = path.join(base, 'skills');
  const missing = path.join(base, 'does-not-exist');

  try {
    await mkdir(root, { recursive: true });

    const alphaGuide = `# Guide\n\n${'Detailed reference material. '.repeat(20)}`;
    await createSkill(root, 'alpha', {
      'SKILL.md': '# Alpha\n\nThis skill reviews code and finds bugs.\n',
      'refs/guide.md': alphaGuide,
      'config.json': '{"enabled":true}',
      'image.png': 'not counted',
    });

    const betaNotes = 'Useful notes. '.repeat(5);
    await createSkill(root, 'beta', {
      'SKILL.md': '# Beta\n\nShort skill.\n',
      'notes.txt': betaNotes,
      'UPPER.MD': '# Uppercase extension is counted\n',
    });

    await createSkill(root, 'gamma', {});

    const skills = await scanSkills([root, missing, root]);

    assert.equal(skills.length, 3);
    assert.deepEqual(
      skills.map((skill) => skill.name),
      ['alpha', 'beta', 'gamma'],
    );

    const alpha = skills.find((skill) => skill.name === 'alpha');
    assert.ok(alpha);
    assert.equal(alpha.files, 3);
    assert.equal(
      alpha.chars,
      alphaGuide.length +
        '# Alpha\n\nThis skill reviews code and finds bugs.\n'.length +
        '{"enabled":true}'.length,
    );
    assert.equal(
      alpha.tokens,
      estimateTokens(alphaGuide) +
        estimateTokens('# Alpha\n\nThis skill reviews code and finds bugs.\n') +
        estimateTokens('{"enabled":true}'),
    );
    assert.equal(alpha.largestFile, 'refs/guide.md');

    const beta = skills.find((skill) => skill.name === 'beta');
    assert.ok(beta);
    assert.equal(beta.files, 3);
    assert.equal(beta.largestFile, 'notes.txt');

    const gamma = skills.find((skill) => skill.name === 'gamma');
    assert.ok(gamma);
    assert.equal(gamma.files, 0);
    assert.equal(gamma.chars, 0);
    assert.equal(gamma.tokens, 0);
    assert.equal(gamma.largestFile, null);

    for (let index = 1; index < skills.length; index += 1) {
      assert.ok(skills[index - 1].tokens >= skills[index].tokens);
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('根目录本身不存在时返回空数组', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'context-budget-missing-'));
  const missing = path.join(base, 'nope');

  try {
    assert.deepEqual(await scanSkills([missing]), []);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
