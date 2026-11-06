import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, splitSegments } from '../src/tokens.js';

test('空字符串没有 token', () => {
  assert.equal(estimateTokens(''), 0);
  assert.deepEqual(splitSegments(''), []);
});

test('纯英文估算在合理量级', () => {
  const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
  const tokens = estimateTokens(text);

  assert.ok(tokens > 100, `expected more than 100 tokens, got ${tokens}`);
  assert.ok(tokens < 400, `expected fewer than 400 tokens, got ${tokens}`);
});

test('纯中文约一字一 token', () => {
  const text = '上下文预算'.repeat(20); // 100 个 CJK 字符
  const tokens = estimateTokens(text);

  assert.ok(tokens >= 90 && tokens <= 110, `unexpected CJK token count: ${tokens}`);
});

test('中英混排介于纯中文与字符数之间', () => {
  const text = 'hello world 你好世界 '.repeat(10);
  const tokens = estimateTokens(text);

  assert.ok(tokens >= 40, `expected at least 40 tokens, got ${tokens}`);
  assert.ok(tokens <= text.length, `tokens should not exceed characters: ${tokens}`);
});

test('代码块按 3.5 字符/token 估算', () => {
  const code = '```js\n' + 'a'.repeat(350) + '\n```';
  const tokens = estimateTokens(code);

  assert.ok(tokens >= 80 && tokens <= 130, `unexpected code token count: ${tokens}`);
});

test('更长的文本不会减少 token', () => {
  const short = 'context budget';
  const long = `${short} and more context budget`;

  assert.ok(estimateTokens(long) >= estimateTokens(short));
  assert.ok(estimateTokens(`${short}!`) >= estimateTokens(short));
});

test('splitSegments 分离正文与代码块', () => {
  const segments = splitSegments('intro\n```js\nconst x = 1;\n```\noutro');

  assert.deepEqual(
    segments.map((segment) => segment.type),
    ['text', 'code', 'text'],
  );
  assert.match(segments[1].text, /const x = 1;/);
  assert.equal(segments[0].text, 'intro\n');
  assert.equal(segments[2].text, 'outro');
});

test('未闭合代码块按代码处理', () => {
  const segments = splitSegments('text\n```\nconst x = 1;');

  assert.deepEqual(
    segments.map((segment) => segment.type),
    ['text', 'code'],
  );
  assert.match(segments[1].text, /const x = 1;/);
});
