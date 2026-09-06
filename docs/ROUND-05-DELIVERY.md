# Round 05 当前交付

游戏已完成机器验证和归档；Studio 0.4.0 干净检出候选及正式验收套件已通过机器门禁。
**R5 已由产品负责人确认验收并结项（2026-09-06）。P33 独立验收延期，仍为 NOT_RUN，不冒充通过。**

验收决定：[结项记录](rounds/ROUND-05-ACCEPTANCE.json)。该决定调整原有结项范围，
下方原候选及其独立验收资料保留为历史记录，不再阻塞本轮结项。

本次验收采用最新修复交付：

- [Studio 修复版](../artifacts/studio-windows/AI-Game-Studio-0.4.0-preview.1-activity-feedback-win-x64.zip)，SHA256 `0520a5c0…`。
- [Tank Release 修复版](../artifacts/tank-facing-delivery-BBjbRp/project/out/windows-release/Tank-0.1.0-release-win-x64.zip)，SHA256 `ffffa361…`。
- 原项目已修正至 `27bc3a91…`；工具反馈、角度单位及监督侧三文件 ChangeSet 修复见[证据](testing/R5-ACTIVITY-AND-TANK-FACING.md)。

## 历史候选交付（以下链接不是最新修复版）

统一交付目录：[使用说明](../artifacts/r5-delivery-0.4.0-preview.1-6Pcp3b/README.md)，
其中包含 `Studio`、`Tank`、`Acceptance`、`Evidence`、`Source` 和完整哈希清单。

## 现在就能使用

- 玩游戏：解压 [Tank Release](../artifacts/r5-completed-project-export-nmj4eW/Tank-0.1.0-release-win-x64.zip)，运行其中的 `Tank.exe`。
- 继续制作：解压 [完整 Tank 项目](../artifacts/r5-completed-project-export-nmj4eW/Tank-Completed-Project-d7ea102d.zip)，在 Studio 中打开项目文件夹。
- 开发诊断包：[Tank Development](../artifacts/r5-completed-project-export-nmj4eW/Tank-0.1.0-development-win-x64.zip)。
- 校验：[SHA256SUMS](../artifacts/r5-completed-project-export-nmj4eW/SHA256SUMS.txt)。
- Studio 候选：[0.4.0 Preview](../artifacts/r5-release-source-GzKI1R/checkout/artifacts/studio-windows/AI-Game-Studio-0.4.0-preview.1-win-x64.zip)。解压运行 `AI Game Studio.exe`，现有安装未被覆盖。

游戏源文件仍由原 Studio 内置 Copilot 完成。监督侧只做审核、测试、
只读核对和归档，没有代写游戏或重新生成素材。完整项目保留了 163 个源文件、
19 份素材、项目规则和 Skills；账号、凭据和原项目本地对话历史不随源码移植。
原始项目仍保留完整审核与执行记录。

## 已有证据

| 范围           | 结果与入口                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 最终玩法与音频 | 22 项测试 / 276 断言；[最终音频接线](testing/P31-FINAL-AUDIO-WIRING-EVIDENCE.md)                                                                 |
| 实际运行       | 胜利、静音战败、重开，以及菜单、帮助、设置、暂停、恢复、返回；双分辨率帧、状态和完整音频一致；[实录与包验证](testing/P31-FINAL-PLAY-EVIDENCE.md) |
| 源码与交付物   | 163 个文件逐项核对，19 项素材和来源信息保留，独立包原样复制；[项目归档](testing/P31-COMPLETED-PROJECT-HANDOFF.md)                                |
| Studio 原安装  | 隔离完整回归通过；当前安装不被候选构建覆盖                                                                                                       |
| 0.4.0 来源     | 1,319 个文件固定为独立干净检出，源分支和未提交改动保留；[发布来源流程](testing/P33-RELEASE-SOURCE-PROCESS.md)                                    |

项目 ZIP：`0868333e93d6d2177306f2f0ecc5be21d8f417fadc8af853438d703f89dc8a3d`。
Development：`112c2b31707d4d79f90a710557ffdccde831747f35d02bc7585bcb2a4f9b5d97`。
Release：`95aac9da3c83ed6f4bc0ad94b44c8c606d981a1335f3ffd206c3aa147fa1b448`。

## 仍需完成

1. 指定未参与开发的独立验收者，并配置该验收的测试预算。
2. 验收者使用干净配置完成 A–E，记录真实结果、断网运行和签名；不能把自动化或监督演示当作真人证据。

Studio ZIP：`2ede62d7145a1dde80d4e868c79baeca7cefb0a4d536c21f1ea628597e87a8c0`。
完整回归、适用的 R5 专项和 289 文件安装包检查通过，详见 [候选证据](testing/P33-CLEAN-CANDIDATE-EVIDENCE.md)。
已备好的套件位于 `artifacts/r5-release-source-GzKI1R/checkout/artifacts/round05-human-acceptance/0.4.0-preview.1-2ede62d7145a`。
参与者只领取 `participant`，不要把包含最终游戏和开发者资料的整个目录交给参与者。

素材技术检查、凭据模式扫描和来源元数据各有边界；它们不等于所有隐蔽信息均被排除、
商业授权已经核准或实际断网验收通过。见 [0.4.0 限制](RELEASE_LIMITATIONS-0.4.0-preview.1.md)。
本地观察面板继续使用现有样式；旧线上站点的访问故障未被报告为发布成功。
