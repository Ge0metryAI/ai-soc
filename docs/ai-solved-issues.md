# AI 协助解决的技术问题记录

> 记录开发中遇到的真实技术问题,以及如何借助 AI 分析定位、解决并验证(题目要求 ≥3,实际 6+)。

## 1. SQLite 在 Vercel 上持久化失效
- **问题**:题目推荐 Next.js + SQLite,但 Vercel 是 Serverless——文件系统只读、`/tmp` 临时且不跨实例共享,本地 `.db` 在本机能跑、线上数据会丢。
- **定位**:在选型阶段即识别(部署目标决定持久化方案),而非上线后才发现。
- **解决**:改用 **Turso(libSQL)**——serverless SQLite,HTTP 连接、免费额度大、Vercel 原生兼容;并加 **localStorage 降级**保证演示不空屏。
- **验证**:`curl /api/soc` 实测首访自动建表+播种、3 条写入路径持久化成功。

## 2. Next.js 16 破坏性变更:`next.config` 不再支持 `eslint` 键
- **问题**:`next build` 类型报错 `'eslint' does not exist in type 'NextConfig'`。
- **定位**:create-next-app 实际安装的是 **Next.js 16**(非记忆中的 15);Next 16 build 默认不跑 ESLint,该配置项被移除。
- **解决**:删除 `eslint: { ignoreDuringBuilds }` 键(本就多余)。
- **教训**:对"破坏性变更"框架,**先读随包文档再写代码**(项目 AGENTS.md 明确要求)。

## 3. base-ui(非 Radix)组件 API 差异
- **问题**:本项目 shadcn 底层是 `@base-ui/react`,Dialog/Sheet/Select API 与 Radix 版不同,凭记忆写易错。
- **解决**:先读 `components/ui/{chart,select,sheet,dialog}.tsx` 源码确认导出与 props,Dialog/Sheet 一律用**受控 `open`/`onOpenChange`**;Select 风险高的部分改用原生 `<select>`。
- **结果**:UI 一次构建通过,无运行时组件错误。

## 4. zustand persist `rehydrate()` 类型错误
- **问题**:`useAiConfig.persist.rehydrate().then(...)` 报 `Property 'then' does not exist on type 'void | Promise<void>'`。
- **解决**:`Promise.resolve(useAiConfig.persist.rehydrate()).then(...)` 包一层归一化为 Promise。

## 5. 引入 AI 功能带来的 SSRF 漏洞
- **问题**:`/api/ai-suggest` 向用户配置的 `baseUrl` 发请求,可被指向内网/云元数据(`169.254.169.254`)做 SSRF。
- **解决**:`assertSafeUrl()` 三层防护——协议校验 + DNS 解析后查私网/环回/链路本地 + 处理 **IPv4-mapped IPv6**(`::ffff:127.0.0.1`)绕过;生产强制、本地开发放行 localhost(便于本地 Ollama)。
- **验证**:实测 `http://169.254.169.254` 与 `http://10.0.0.5` 均返回 **HTTP 400 拦截**。

## 6. 角色权限仅前端可绕过
- **问题**:user1 只读仅靠隐藏按钮,直接调 `/api/soc` 可绕过。
- **解决**:服务端 `getRole()` 读 cookie,user1 写操作返回 **403**(登录写 cookie、登出清除)。诚实声明:cookie 客户端写仍可篡改,真鉴权需服务端 session;已从"任意 user1 会话可改"提升到"需刻意篡改"。
- **验证**:实测 user1 写 → 403,security 写 → 200,GET 读 → 200。

## 7. 端口占用 EADDRINUSE
- **问题**:停止后台 `npm start` 后,`next-server` 子进程仍占用 3000,重启报 `EADDRINUSE`。
- **解决**:`netstat -ano | grep :3000` 取 PID → `taskkill //F //PID`。

## 8. "AI 降噪做了但用户看不到"
- **问题**:聚合/降噪功能实现了,但藏在二级页与数字里,体验时"没看到 AI"。
- **解决**:仪表板顶部加醒目「AI 智能降噪」hero:`原始 N → 聚合 M`+ 降噪率进度条。能力要被看见才算数。
