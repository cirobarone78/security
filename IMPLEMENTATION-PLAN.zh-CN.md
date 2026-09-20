# 主要问题修复方案与实施记录

## 范围和基线

- 项目：[cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill)。
- 基线提交：`c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`。
- 日期：2026-09-20。
- 范围：覆盖率证据的可核验性、校验器回归测试的平台一致性、持续集成。本文是工程修复方案，不是完整安全审计报告，也不代表对被审计目标的安全保证。

## 问题、影响和处理

| 优先级 | 已确认问题 | 影响 | 本次处理 |
| --- | --- | --- | --- |
| P1 | 覆盖率校验器仅检查本地证据路径格式和所属 agent，不核对文件 | `covered`、`blocked`、`candidate` 可引用不存在的证据，历史 `attempts` 也有相同缺口 | CLI 默认核对当前和历史证据文件；新增可指定输出根目录的 API 和 CLI 参数 |
| P2 | findings 的部分 CLI 测试未检查 OS 文件打开能力 | Windows 基线出现 7 项失败，均提前收到“不支持安全文件打开”错误，未执行测试声称覆盖的解析路径 | 只在具有所需 OS 能力的平台运行相关测试；新增明确验证拒绝行为的用例，并保留跨平台内存验证 |
| P2 | 仓库没有自动运行现有测试的 CI | 校验器行为回归和平台问题容易进入后续修改 | 新增 Linux、macOS、Windows × Node.js 22、24 的 GitHub Actions 测试矩阵 |

证据文件问题与上游 [Issue #21](https://github.com/cloudflare/security-audit-skill/issues/21) 对应。本次在本地构造缺失证据、目录、硬链接、目录联接及缺失历史证据的回归用例；修复前 6 个负向测试失败，说明非法输入确实被接受；修复后这些用例通过。

## 实施方案

### 1. 将留存证据核对接入正常校验路径

先执行原有结构、状态、归属及资源上限检查。仅在结构完全合法后访问文件系统，以保证检查的路径已通过相对路径和 agent 归属规则。

CLI 默认把账本文件所在目录作为审计输出根目录，原有正常调用不需要改变：

```sh
node skills/security-audit/validate-coverage-ledger.cjs /path/to/run/coverage-ledger.json
```

如果账本被导出到其他位置，显式指定实际保留证据的目录：

```sh
node skills/security-audit/validate-coverage-ledger.cjs /path/to/exported-ledger.json --output-dir /path/to/run
```

对 `local_checks` 和每个 `attempts[].local_checks` 中的 `method: "local"` 条目：

1. 检查输出根目录存在、为目录且不是符号链接。
2. 用 `lstat` 逐段检查根目录下的路径，拒绝符号链接、Windows junction 和非目录父节点。
3. 要求末端存在、为普通文件且硬链接数为 1。
4. 报错定位至对应 JSON 字段，不输出来自文件系统异常的路径或终端控制字符。
5. 错误数量仍受原有 100 条上限约束；不读取、复制或执行证据内容。

保持库接口兼容：`validateDocument(ledger)` 继续只进行结构检查；`validateDocument(ledger, { outputDir })` 追加证据文件检查。README 和工作流说明明确这一区别。

### 2. 保持文件读取保护并修正测试边界

现有文件读取器要求 OS 提供 `O_NOFOLLOW` 和 `O_NONBLOCK`。原生 Windows 下没有这些能力，因此 CLI 按既有设计拒绝读取。此次不放宽保护，也不声称实现了 Windows 原生 CLI 支持。

将依赖这些能力的测试与真正跨平台的内存验证分开；新增两个“不支持时必须拒绝”的 CLI 测试。完整审计在 Windows 主机上应使用 Linux/WSL 内的 Node.js。修正的 7 个测试仍会在 Linux/macOS 上执行，不是从测试集中删除。

### 3. 增加 CI 并同步说明

新增 `.github/workflows/validators.yml`，在 push、pull request 和手动触发时执行两组测试。CI 只授予 `contents: read`，不持久保存检出凭据，使用已核对的官方 Actions 固定提交，任务超时为 5 分钟。

修改 README、`RECONNAISSANCE.md` 和 `VALIDATION-AND-REPORTING.md`，说明证据校验范围、根目录解析规则、平台要求和成功结果的含义。没有新增运行时依赖，也没有改变报告 schema。

## 验证和验收

从仓库根目录运行：

```sh
node --test skills/security-audit/validate-findings.test.cjs skills/security-audit/validate-coverage-ledger.test.cjs
```

当前验证记录：

| 检查 | 结果 |
| --- | --- |
| Windows / Node.js v24.19.0 基线 | 65 项：46 通过、7 失败、12 跳过 |
| Windows / Node.js v24.19.0 修复后 | 82 项：59 通过、0 失败、23 项按平台能力跳过 |
| Skill 官方 `quick_validate.py` | `Skill is valid!` |
| Linux / 官方 Node.js 24 Alpine 容器 | 82 项：80 通过、0 失败、2 项仅适用于缺少 OS 能力的平台而跳过 |
| CI YAML、矩阵与固定 Actions 提交 | 解析通过，确认 6 个平台/版本组合 |
| macOS、Node.js 22、远程 GitHub Actions | 已配置，尚未在当前任务运行 |

Linux 测试使用官方镜像 `node@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`，容器禁用网络，源码只读挂载，临时目录使用 tmpfs，并限制 CPU、内存和进程数。Windows 与 Linux 的结果合并后，全部 82 个测试都至少在一个适用环境中通过；没有将平台跳过项计为已通过。

新增测试覆盖：三种证据状态、独立验证者、嵌套 Unicode 文件名、历史证据、合法普通文件、缺失文件、目录、硬链接、父目录链接、根目录链接、悬空链接、FIFO、错误条数上限、CLI 参数错误、默认根目录和显式根目录。

验收标准：合法留存文件通过；缺失或非法证据在对应字段报错；当前和归档条目均受检查；来源审阅不被强制要求本地文件；已有语义测试保持通过；不支持的平台明确拒绝 CLI 输入。

## 边界、兼容性与回退

- 文件检查依赖父协调者控制的稳定输出树；输出根目录及祖先必须可信。它不提供针对并发恶意目录替换的原子安全保证，不能代替原有沙箱和使用目录描述符的证据提升流程。
- 文件存在不等于内容真实、测试通过或漏洞成立；独立验证步骤仍然必需。
- 以前只凭路径就通过的账本，如果证据缺失，现在会失败。这是有意收紧。应恢复真实留存证据，或依据实际执行情况修正账本，不能创建空文件冒充证据。
- 导出的账本需要 `--output-dir`；库调用方需要显式传入 `outputDir` 才检查文件。
- 若确需回退，应对本次修复提交使用 `git revert <commit>`，而不是关闭文件读取保护。回退会重新引入证据缺失可通过的缺口。

## 提交范围

修复分支为 `fix/retained-artifact-validation`，包含实现、回归测试、CI 和本方案。拉取请求的目标为 `cloudflare/security-audit-skill` 的 `main` 分支，关联 Issue #21。本文记录本地实施和验证结果；上游审阅结果、远程 CI 状态和合并状态以 GitHub 拉取请求页面为准。
