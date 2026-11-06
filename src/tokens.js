/**
 * Small, dependency-free token estimator.
 *
 * This is intentionally a heuristic: it is meant for comparing skills, not for
 * billing. See README.md for the rules and the expected error range.
 */

const CJK_RANGES = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3040, 0x30ff], // Hiragana + Katakana
  [0xac00, 0xd7af], // Hangul Syllables
];

function isCjk(codePoint) {
  for (const [start, end] of CJK_RANGES) {
    if (codePoint >= start && codePoint <= end) return true;
  }
  return false;
}

function isLatinLetterOrDigit(codePoint) {
  return (
    (codePoint >= 0x30 && codePoint <= 0x39) || // 0-9
    (codePoint >= 0x41 && codePoint <= 0x5a) || // A-Z
    (codePoint >= 0x61 && codePoint <= 0x7a) // a-z
  );
}

/**
 * Split text into prose and fenced-code segments.
 *
 * Fence lines themselves are not counted; only the content between them is.
 * An unclosed fence is treated as code through the end of the text.
 *
 * @param {string} text
 * @returns {Array<{type: 'text' | 'code', text: string}>}
 */
export function splitSegments(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const segments = [];
  // Keep line endings so character counts remain faithful to the input.
  const lines = text.split(/(?<=\n)/);
  let buffer = '';
  let inCode = false;

  const flush = () => {
    if (buffer.length === 0) return;
    segments.push({ type: inCode ? 'code' : 'text', text: buffer });
    buffer = '';
  };

  for (const line of lines) {
    if (/^[ \t]*```/.test(line)) {
      flush();
      inCode = !inCode;
      continue;
    }
    buffer += line;
  }

  flush();
  return segments;
}

function estimateProse(text) {
  let cjk = 0;
  let latin = 0;
  let other = 0;

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (isCjk(codePoint)) {
      cjk += 1;
    } else if (isLatinLetterOrDigit(codePoint)) {
      latin += 1;
    } else {
      other += 1;
    }
  }

  // CJK is close to one token per character. Latin text is roughly four
  // characters per token, and punctuation/whitespace roughly six.
  return cjk + Math.ceil(latin / 4) + Math.ceil(other / 6);
}

/**
 * Estimate the number of tokens in a string.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;

  let total = 0;
  for (const segment of splitSegments(text)) {
    if (segment.type === 'code') {
      // Code is denser than prose in most tokenizers.
      total += Math.ceil(segment.text.length / 3.5);
    } else {
      total += estimateProse(segment.text);
    }
  }
  return total;
}
