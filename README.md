# 🛡️ AI SOC 安全运营看板(智能研判版)

> 国舜技术部 Vibe Coding 实战竞赛 · 题目 D
> 可解释规则驱动的 AI SOC 看板:**告警降噪 / 置信度研判 / 智能优先级 / AI 处置建议 / 误报学习 / 攻击时间线**

## 🔗 在线演示
- 部署地址:**https://aisoc.888927.xyz**
- 源代码:https://github.com/Ge0metryAI/ai-soc
- 测试账号(密码均为 `123456`):

| 角色 | 用户名 | 权限 |
|---|---|---|
| 系统管理员 | `admin` | 可操作(误报/采纳/重置) |
| 安全管理员 | `security` | 可操作 |
| 普通用户 | `user1` | **只读**(隐藏操作按钮,服务端 403 拦截写操作) |

## 📌 项目背景
真实安全运营中心面临"告警风暴",分析师难以逐一处理。本项目构建一个**简化但具备 AI SOC 关键要素**的看板,用**确定性规则引擎(可解释)**模拟 AI 研判逻辑,并提供**可选的真实 LLM 增强**,突出"智能辅助"能力。

## ✨ AI SOC 核心能力(6/6,题目要求 ≥4)
1. **告警降噪 / 智能聚合** —— 按「同源 IP + 告警类型」自动合并为事件
2. **置信度评分(0-100)** —— 类型基线 + 资产权重 + 严重度 + 误报学习调整
3. **智能优先级(P0-P3)** —— 资产重要性 × 置信度矩阵
4. **AI 处置建议** —— 仅对置信度>80 且 P0/P1 自动生成,可一键采纳
5. **误报反馈学习(模拟)** —— 标记误报 → 同类告警初始置信度下降,持久化
6. **攻击链分析(MITRE ATT&CK)** —— 按攻击者源 IP 跨类型聚合,沿杀伤链阶段还原攻击进程(侦察→初始访问→提权…)

## 🧩 功能模块
- **仪表板**:AI 降噪 hero(原始→聚合→降噪率)、KPI(告警总数/待处置高危/平均置信度/误报率/处置率)、优先级饼图、置信度分布柱状图、高危 Top5、最近处置
- **告警中心**:增强表格(置信度色条/优先级标签/MITRE ATT&CK/AI 建议)、**7 列点击排序**、原始↔聚合切换(聚合=归并事件视图)、详情抽屉(研判依据可解释)、误报/采纳
- **聚合事件**:归并事件卡片(合并组 + 独立,降噪率) + **多阶段攻击链置顶高亮** + 杀伤链/事件双抽屉
- **处置历史**:采纳记录
- **设置**:可选 AI 增强(OpenAI 兼容接口)配置
- **登录壳** + 轻量角色权限

## 🛠️ 技术栈
| 类别 | 选型 |
|---|---|
| 框架 | Next.js 16(App Router)+ TypeScript |
| 样式/组件 | Tailwind CSS v4 + shadcn/ui(base-ui) |
| 图表 | Recharts |
| 状态 | Zustand(+ persist 降级镜像) |
| 持久化 | **Turso(libSQL)** 主存 + localStorage 降级 |
| 后端 | Next.js API Routes(`/api/soc`、`/api/ai-suggest`) |
| 部署 | Vercel |

## 🚀 本地运行
```bash
npm install
# 配置 Turso(根目录 .env.local):
#   TURSO_DATABASE_URL=libsql://<your-db>.turso.io
#   TURSO_AUTH_TOKEN=<your-token>
npm run dev   # http://localhost:3000 ,登录 security / 123456
```
> 首次访问会自动建表 + 灌入 18 条预置告警种子(含一条三阶段入站攻击链,无需手动初始化)。

## ☁️ 部署到 Vercel
1. 推送到 GitHub → Vercel Import(**Framework Preset 必须为 Next.js**,否则平台不识别产物会全站 404)
2. 配置环境变量:
   - 必填:`TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`
   - 可选(启用真 AI 增强):`AI_API_KEY`(+ `AI_BASE_URL` / `AI_MODEL`)
3. Deploy。AI 模型 Key **仅存服务端环境变量,前端不存储 / 不显示 / 不传输**;未配置则使用规则模板。

## 🧠 关键技术决策
- **为什么用 Turso 而非本地 SQLite?** Vercel 是 Serverless,文件系统只读、`/tmp` 不跨实例持久,本地 `.db` 写入在线上会失效。Turso 是 serverless libSQL(SQLite 协议),HTTP 连接、免费额度大、Vercel 原生兼容。
- **localStorage 降级**:Turso 不可达时客户端读本地镜像,演示永不空屏(顶部显示"降级模式")。
- **"AI"是可解释规则引擎**:置信度/优先级/聚合/建议均为确定性纯函数(`src/lib/engine.ts`),UI 透明展示"研判依据"。符合题目"模拟 AI 逻辑(基于规则)而非真实大模型"的要求。
- **可选真 LLM 增强**:通过**服务端环境变量** `AI_API_KEY`(兼容 OpenAI / DeepSeek / Moonshot / 本地 Ollama)启用;告警详情可「🤖 AI 生成」动态建议,失败自动回退规则模板;服务端 `/api/ai-suggest` 带 SSRF 防护,**密钥不下发前端**。

## 📊 评分点对照
**功能检查清单(7/7 + 可选第 8)**

| # | 检查项 | 实现位置 |
|---|---|---|
| 1 | 置信度+优先级标签,可排序 | 告警中心 |
| 2 | 智能聚合(源IP+类型)+ 事件视图 | `engine.aggregateEvents`(归并 12 事件)/ 聚合事件页 |
| 3 | 高置信高优先级自动 AI 建议 | `engine.generateSuggestion` |
| 4 | 误报影响同类初始置信度(学习) | `markFalsePositive` + Turso |
| 5 | 仪表板:聚合事件数/平均置信度等 | 仪表板 KPI + hero |
| 6 | ≥1 图表 | 优先级饼图 + 置信度柱状图 |
| 7 | 操作持久化到数据库 | Turso(libSQL) |
| 8 | (可选)攻击时间线 / 攻击链 | 攻击链分析(MITRE 杀伤链)+ 事件抽屉 |

**Vibe Coding 实践(30)**

| 子项 | 分 | 交付证据 |
|---|---|---|
| AI 对话 ≥10 次 | 10 | `docs/ai-conversations.md`(28 轮:选题/约束/方案/算法/Bug/安全/部署) |
| 结构化提示词 ≥5 | 8 | `docs/prompts.md`(7 个) |
| AI 生成证据 | 5 | commit 历史 + 验证截图(`soc-*.png`) |
| AI 解决问题 ≥3 | 5 | `docs/ai-solved-issues.md`(14 个真实问题) |
| README 心得 | 2 | 本文 + `docs/vibe-coding-reflection.md` |

**交付物(15) / 代码质量(5)**

| 项 | 分值 | 说明 |
|---|---|---|
| 可运行源码 + 在线演示 | — | `npm run dev` / Vercel:aisoc.888927.xyz |
| 文档完整度 | 15 | README + 4 份 Vibe 文档 + 技术方案 |
| 类型安全 | 5 | 全量 TypeScript,`tsc --noEmit` 0 错,无 `any` 滥用 |
| 工程整洁 | — | 纯函数引擎(可测)+ Type-First 契约 + 无 dead code |

## 📁 目录结构
```
src/
├─ app/
│  ├─ page.tsx / alerts / events / dispositions / settings / login
│  └─ api/soc/route.ts        # 读写 Turso(角色校验)
│     api/ai-suggest/route.ts # 可选 LLM 转发(SSRF 防护)
├─ components/soc/            # app-shell / dashboard / alerts / events / dispositions / settings / meta
├─ lib/  engine.ts(可解释规则引擎) / turso.ts / seed.ts
├─ store/ socStore.ts / aiConfigStore.ts
└─ types/index.ts
```

## 🔐 安全说明
- 角色 cookie 为客户端写入(演示级),真鉴权需服务端 session;本项目为题目 D 演示,非生产环境。

## 💡 Vibe Coding 心得
详见 [`docs/vibe-coding-reflection.md`](docs/vibe-coding-reflection.md);AI 对话记录见 [`docs/ai-conversations.md`](docs/ai-conversations.md),结构化提示词见 [`docs/prompts.md`](docs/prompts.md),AI 解决的技术问题见 [`docs/ai-solved-issues.md`](docs/ai-solved-issues.md)。

一句话:**人负责方向与判断(选题、Vercel 约束、Turso 决策、可解释定位、漏洞必修),AI 负责构建与调试(脚手架、规则引擎、UI、修 bug)。**
