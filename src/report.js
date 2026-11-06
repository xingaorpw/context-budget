const DEFAULT_WINDOW = 200_000;
const DEFAULT_TOP = 10;

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
};

/**
 * Format an integer with thousands separators without relying on locale data.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatNumber(value) {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatPercent(value) {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(2)}%`;
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatWindow(value) {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value >= 1_000 && value % 1_000 === 0) return `${value / 1_000}k`;
  return formatNumber(value);
}

function percentOf(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

function validateWindow(value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError('window must be a positive integer');
  }
  return value;
}

function validateTop(value) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError('top must be a positive integer');
  }
  return value;
}

/**
 * Build a serializable report from scanner output.
 *
 * @param {Array<object>} skills
 * @param {{window?: number, top?: number}} [options]
 * @returns {object}
 */
export function buildReport(skills, options = {}) {
  const windowSize = validateWindow(options.window ?? DEFAULT_WINDOW);
  const top = validateTop(options.top ?? DEFAULT_TOP);
  const input = Array.isArray(skills) ? skills : [];

  const normalized = input.map((skill) => ({
    name: String(skill?.name ?? ''),
    dir: String(skill?.dir ?? ''),
    files: Number.isFinite(skill?.files) ? skill.files : 0,
    chars: Number.isFinite(skill?.chars) ? skill.chars : 0,
    tokens: Number.isFinite(skill?.tokens) ? skill.tokens : 0,
    largestFile: skill?.largestFile ?? null,
  }));

  normalized.sort(
    (a, b) =>
      b.tokens - a.tokens ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0),
  );

  const totalFiles = normalized.reduce((sum, skill) => sum + skill.files, 0);
  const totalChars = normalized.reduce((sum, skill) => sum + skill.chars, 0);
  const totalTokens = normalized.reduce((sum, skill) => sum + skill.tokens, 0);

  const enriched = normalized.map((skill) => ({
    ...skill,
    percent: percentOf(skill.tokens, windowSize),
  }));

  const top3 = enriched.slice(0, 3);
  const savedTokens = top3.reduce((sum, skill) => sum + skill.tokens, 0);

  return {
    window: windowSize,
    top,
    totalSkills: normalized.length,
    totalFiles,
    totalChars,
    totalTokens,
    windowPercent: percentOf(totalTokens, windowSize),
    skills: enriched,
    savings: {
      count: top3.length,
      top3: top3.map((skill) => ({
        name: skill.name,
        tokens: skill.tokens,
        percent: skill.percent,
      })),
      tokens: savedTokens,
      windowPercent: percentOf(savedTokens, windowSize),
      perRound: savedTokens,
      per100Rounds: savedTokens * 100,
      perDay: savedTokens * 100 * 30,
    },
  };
}

function displayWidth(text) {
  let width = 0;
  for (const char of String(text)) {
    const codePoint = char.codePointAt(0);
    const isWide =
      (codePoint >= 0x1100 && codePoint <= 0x115f) ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
      (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
      (codePoint >= 0x20000 && codePoint <= 0x3fffd);
    width += isWide ? 2 : 1;
  }
  return width;
}

function pad(text, width, align = 'left') {
  const padding = ' '.repeat(Math.max(0, width - displayWidth(text)));
  return align === 'right' ? `${padding}${text}` : `${text}${padding}`;
}

function colorize(enabled, code, text) {
  return enabled ? `${code}${text}${ANSI.reset}` : text;
}

/**
 * Render a human-readable report. Accepts either buildReport() output or a raw
 * skills array.
 *
 * @param {object | Array<object>} report
 * @param {{color?: boolean, top?: number}} [options]
 * @returns {string}
 */
export function renderReport(report, options = {}) {
  const color = Boolean(options.color);
  const built = Array.isArray(report)
    ? buildReport(report, { window: options.window, top: options.top })
    : report;

  if (!built || !Array.isArray(built.skills)) {
    throw new TypeError('renderReport expects a report object or a skills array');
  }

  const limit = validateTop(options.top ?? built.top ?? DEFAULT_TOP);
  const visible = built.skills.slice(0, limit);

  const headers = ['skill', '文件数', '字符', 'token', '占窗口 %'];
  const rows = visible.map((skill) => [
    skill.name,
    formatNumber(skill.files),
    formatNumber(skill.chars),
    formatNumber(skill.tokens),
    formatPercent(skill.percent),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(
      displayWidth(header),
      ...rows.map((row) => displayWidth(row[index])),
      0,
    ),
  );
  const numericColumns = [1, 2, 3, 4];
  const align = widths.map((_, index) =>
    numericColumns.includes(index) ? 'right' : 'left',
  );

  const lines = [];
  lines.push(
    colorize(color, `${ANSI.bold}${ANSI.cyan}`, 'context-budget · skill token 占用'),
  );
  lines.push('');
  lines.push(
    colorize(
      color,
      ANSI.bold,
      headers
        .map((header, index) => pad(header, widths[index], align[index]))
        .join('  '),
    ),
  );
  lines.push(
    colorize(
      color,
      ANSI.dim,
      widths.map((width) => '-'.repeat(width)).join('  '),
    ),
  );

  if (rows.length === 0) {
    lines.push(colorize(color, ANSI.dim, '（没有可显示的 skill）'));
  } else {
    for (const row of rows) {
      lines.push(
        row
          .map((cell, index) => pad(cell, widths[index], align[index]))
          .join('  '),
      );
    }
  }

  if (built.totalSkills > visible.length) {
    lines.push('');
    lines.push(
      colorize(
        color,
        ANSI.dim,
        `仅显示前 ${visible.length} 个；共 ${built.totalSkills} 个 skill。用 --top 调整。`,
      ),
    );
  }

  lines.push('');
  lines.push(
    colorize(
      color,
      ANSI.bold,
      `共 ${built.totalSkills} 个 skill，合计 ${formatNumber(built.totalTokens)} token，占 ${formatWindow(built.window)} 窗口的 ${formatPercent(built.windowPercent)}`,
    ),
  );

  const savings = built.savings;
  if (savings && savings.count > 0) {
    lines.push('');
    lines.push(
      colorize(
        color,
        `${ANSI.bold}${ANSI.yellow}`,
        `省钱建议（关掉最贵的 ${savings.count} 个 skill）`,
      ),
    );

    for (const skill of savings.top3) {
      lines.push(
        `  ${pad(skill.name, Math.max(displayWidth(skill.name), 20))}  ${pad(formatNumber(skill.tokens), 10, 'right')} token`,
      );
    }

    lines.push('');
    lines.push(
      colorize(
        color,
        ANSI.green,
        `  每轮可省 ${formatNumber(savings.perRound)} token（窗口的 ${formatPercent(savings.windowPercent)}）`,
      ),
    );
    lines.push(
      colorize(
        color,
        ANSI.green,
        `  100 轮可省 ${formatNumber(savings.per100Rounds)} token`,
      ),
    );
    lines.push(
      colorize(
        color,
        ANSI.green,
        `  每天 100 轮、一个月可省 ${formatNumber(savings.perDay)} token`,
      ),
    );
  }

  return lines.join('\n');
}
