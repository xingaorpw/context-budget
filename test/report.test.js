import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport,
  formatNumber,
  formatPercent,
  formatWindow,
  renderReport,
} from '../src/report.js';

const SKILLS = [
  {
    name: 'small',
    dir: 'C:/skills/small',
    files: 2,
    chars: 20_000,
    tokens: 20_000,
    largestFile: 'SKILL.md',
  },
  {
    name: 'big',
    dir: 'C:/skills/big',
    files: 8,
    chars: 40_000,
    tokens: 40_000,
    largestFile: 'references/guide.md',
  },
  {
    name: 'medium',
    dir: 'C:/skills/medium',
    files: 4,
    chars: 30_000,
    tokens: 30_000,
    largestFile: 'SKILL.md',
  },
  {
    name: 'tiny',
    dir: 'C:/skills/tiny',
    files: 1,
    chars: 10_000,
    tokens: 10_000,
    largestFile: 'SKILL.md',
  },
];

test('报告按 token 降序排列并计算百分比', () => {
  const report = buildReport(SKILLS, { window: 100_000 });

  assert.deepEqual(
    report.skills.map((skill) => skill.name),
    ['big', 'medium', 'small', 'tiny'],
  );
  assert.equal(report.totalSkills, 4);
  assert.equal(report.totalFiles, 15);
  assert.equal(report.totalChars, 100_000);
  assert.equal(report.totalTokens, 100_000);
  assert.equal(report.windowPercent, 100);
  assert.equal(report.skills[0].percent, 40);
  assert.equal(report.skills[1].percent, 30);
});

test('top 3 省钱计算正确', () => {
  const report = buildReport(SKILLS, { window: 100_000 });

  assert.equal(report.savings.count, 3);
  assert.equal(report.savings.tokens, 90_000);
  assert.equal(report.savings.windowPercent, 90);
  assert.equal(report.savings.perRound, 90_000);
  assert.equal(report.savings.per100Rounds, 9_000_000);
  assert.equal(report.savings.perDay, 270_000_000);
  assert.deepEqual(
    report.savings.top3.map((skill) => skill.name),
    ['big', 'medium', 'small'],
  );
});

test('JSON 结构稳定且可序列化', () => {
  const report = buildReport(SKILLS, { window: 200_000, top: 2 });
  const json = JSON.parse(JSON.stringify(report));

  assert.equal(json.window, 200_000);
  assert.equal(json.top, 2);
  assert.equal(json.skills.length, 4);
  assert.equal(json.skills[0].name, 'big');
  assert.equal(json.savings.count, 3);
  assert.equal(json.savings.top3[0].tokens, 40_000);
  assert.equal(json.savings.perDay, 270_000_000);
  assert.equal(typeof json.windowPercent, 'number');
});

test('文本报告包含表头、汇总和 top 3 建议', () => {
  const report = buildReport(SKILLS, { window: 100_000, top: 2 });
  const output = renderReport(report, { color: false });

  assert.match(output, /skill\s+文件数\s+字符\s+token\s+占窗口 %/);
  assert.match(output, /共 4 个 skill，合计 100,000 token，占 100k 窗口的 100\.00%/);
  assert.match(output, /仅显示前 2 个；共 4 个 skill/);
  assert.match(output, /关掉最贵的 3 个 skill/);
  assert.match(output, /每轮可省 90,000 token/);
  assert.match(output, /100 轮可省 9,000,000 token/);
  assert.match(output, /每天 100 轮、一个月可省 270,000,000 token/);
  assert.ok(!output.includes('\u001b['), 'color should be off by default');
});

test('颜色开关只影响 ANSI 转义', () => {
  const report = buildReport(SKILLS, { window: 100_000 });
  const plain = renderReport(report, { color: false });
  const colored = renderReport(report, { color: true });

  assert.ok(!plain.includes('\u001b['));
  assert.ok(colored.includes('\u001b['));
  assert.ok(colored.includes('context-budget'));
});

test('数字格式化辅助函数', () => {
  assert.equal(formatNumber(1234567), '1,234,567');
  assert.equal(formatPercent(12.345), '12.35%');
  assert.equal(formatWindow(200_000), '200k');
  assert.equal(formatWindow(128_000), '128k');
  assert.equal(formatWindow(1_000_000), '1M');
  assert.equal(formatWindow(123_456), '123,456');
});

test('非法 window 和 top 会被拒绝', () => {
  assert.throws(() => buildReport(SKILLS, { window: 0 }), RangeError);
  assert.throws(() => buildReport(SKILLS, { top: 0 }), RangeError);
  assert.throws(() => buildReport(SKILLS, { top: 1.5 }), RangeError);
});
