# context-budget

> 算出你的 AI agent 每轮对话被 skill 收了多少"税"，告诉你关掉哪几个最省。

[![tests](https://github.com/xingaorpw/context-budget/actions/workflows/ci.yml/badge.svg)](https://github.com/xingaorpw/context-budget/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

---

## 它解决什么问题

装 skill 的时候没人提醒你：**每一个 skill 都会占上下文**。

skill 的 `description` 要进系统提示，正文在触发时要整个读进去。装 128 个 skill，光描述就可能吃掉上万 token——而这些 token 在**每一轮对话里都要付一次**。

你为用不上的技能，每轮都在付费。

`context-budget` 扫你本地已经装了哪些 skill，算出每个占多少 token，并告诉你：关掉最贵的三个，每轮能省多少。

### 真实输出

```
$ node src/cli.js scan
context-budget · skill token 占用

skill        文件数     字符   token  占窗口 %
-----------  ------  -------  ------  --------
.system          29  192,991  45,806    22.90%
beta-skill        1      851     743     0.37%
alpha-skill       1    1,412     330     0.17%
gamma-skill       1       23       6     0.00%

共 4 个 skill，合计 46,885 token，占 200k 窗口的 23.44%

省钱建议（关掉最贵的 3 个 skill）
  .system                   45,806 token
  beta-skill                   743 token
  alpha-skill                  330 token

  每轮可省 46,879 token（窗口的 23.44%）
  100 轮可省 4,687,900 token
  每天 100 轮、一个月可省 140,637,000 token
```

第一行就是真实的——`.system` 目录下 29 个文件，**45,806 token，占了 200k 窗口的 22.9%**。

---

## 快速开始

零依赖：

```bash
node src/cli.js                    # 扫默认目录
node src/cli.js --root ~/my-skills # 额外加一个目录
node src/cli.js --json             # 机器可读
```

### 参数

| 参数 | 作用 |
|---|---|
| `--root <dir>` | 追加扫描目录（可重复） |
| `--window 200000` | 上下文窗口大小，影响百分比 |
| `--top 10` | 表格里显示前几个 |
| `--json` | 输出结构化结果 |
| `--no-color` | 关闭颜色 |

### 扫描哪些目录

```
~/.claude/skills
~/.codex/skills
~/.cursor/skills
~/.config/opencode/skills
~/AppData/Roaming/Claude/skills    (Windows)
```

每个子目录算一个 skill，递归统计里面的 `.md` / `.txt` / `.json` / `.yaml` / `.yml`。

---

## 它是怎么算的

### token 估算

不引 tiktoken（那会引入几 MB 依赖），用一套有据可查的启发式：

| 内容 | 估算 |
|---|---|
| CJK 字符（中/日/韩） | 每个 1 token |
| 拉丁字母/数字 | 每 4 字符 1 token |
| 标点/空白 | 每 6 字符 1 token |
| 代码块内 | 每 3.5 字符 1 token |

**误差约 ±15%**。它用来做"哪个更贵"的排序是够的，用来精确计费不够。

### 为什么用文件大小而不是真实 prompt

因为你没法在不跑一次模型的情况下知道真实拼装结果。文件大小是**上界**——真实占用只会更少（有些 skill 的描述不会被加载）。所以这个数字偏保守，适合用来做"该不该留"的判断。

---

## 输出解读

| 列 | 含义 |
|---|---|
| `skill` | 目录名 |
| `文件数` | 该 skill 下被统计的文件数 |
| `字符` | 总字符数 |
| `token` | 估算 token |
| `占窗口 %` | 占你设定窗口的比例 |

最后的"省钱建议"按 token 降序取前三，换算成每轮 / 100 轮 / 每天 100 轮一个月的量。

---

## 已知限制

- **估算是近似值**，±15%。不同模型的 tokenizer 差别更大。
- **只统计文件大小**，不解析真实的 prompt 拼装顺序，也不考虑 skill 是否会被同时触发。
- **不含 MCP 工具 schema**——那部分通常比 skill 更占地方，但需要连到 MCP server 才能读。
- **不做去重**：两个目录里同名的 skill 会各算一次。
- 不判断 skill 有没有用，只算它有多贵。

## License

[MIT](LICENSE) © 2026 xingaorpw
