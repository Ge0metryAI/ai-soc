// AI 全程增强分析入口 —— 规则引擎算「结构」,本路由让 LLM 在结构之上做「叙事/研判」。
// 任何失败 / 未配置 AI_API_KEY 都回退到规则模板(source:"rule"),响应永远有内容。
// 安全模式与 /api/ai-suggest 一致:密钥仅服务端、SSRF 防护、不下发前端。
import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";

export const dynamic = "force-dynamic";

function aiConfig() {
  return {
    apiKey: process.env.AI_API_KEY || "",
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: process.env.AI_MODEL || "gpt-4o-mini",
  };
}

// ---- SSRF 防护(与 ai-suggest 同源逻辑)----
function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    a === 0
  );
}

async function assertSafeUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("AI_BASE_URL 格式不正确");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("仅支持 http/https");
  const allowLoopbackInDev = process.env.NODE_ENV !== "production";
  let addrs: string[];
  if (net.isIP(u.hostname)) {
    addrs = [u.hostname];
  } else {
    try {
      const looked = await dns.lookup(u.hostname, { all: true });
      addrs = looked.map((a) => a.address);
    } catch {
      throw new Error("无法解析目标主机");
    }
  }
  for (const ip of addrs) {
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
    const v4 = mapped ? mapped[1] : net.isIPv4(ip) ? ip : null;
    const loopback = ip === "::1" || (v4?.startsWith("127.") ?? false);
    const v4Private = v4 ? isPrivateV4(v4) : false;
    const v6Private =
      net.isIPv6(ip) && !mapped && (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80"));
    if (loopback && allowLoopbackInDev) continue;
    if (loopback || v4Private || v6Private) {
      throw new Error("出于 SSRF 防护,禁止访问内网/环回/云元数据地址");
    }
  }
}

/** 调用 OpenAI 兼容 /chat/completions,要求严格 JSON 输出,返回解析后的对象;任何环节失败抛错由上层回退 */
async function chatJson(sys: string, usr: string): Promise<Record<string, unknown>> {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) throw new Error("AI 未配置");
  await assertSafeUrl(baseUrl);
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      temperature: 0.3,
      max_tokens: 1200,
    }),
  });
  if (!res.ok) throw new Error(`模型接口 ${res.status}`);
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
  // 容错:剥离可能的 ```json 代码块,截取首个 { 到末个 }
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) throw new Error("模型未返回 JSON");
  return JSON.parse(cleaned.slice(s, e + 1)) as Record<string, unknown>;
}

// ---------------- 输入类型(宽松,前端传结构化摘要)----------------
interface ChainPayload {
  sourceIp: string;
  isExternal: boolean;
  stageCount: number;
  count: number;
  priority: string;
  firstSeen: string;
  lastSeen: string;
  steps: { tactic: string; alertName: string; alertType: string; time: string }[];
}
interface EventPayload {
  sourceIp: string;
  alertType: string;
  alertTypeLabel: string;
  count: number;
  merged: boolean;
  priority: string;
  maxConfidence: number;
  firstSeen: string;
  lastSeen: string;
}
interface PosturePayload {
  totalAlerts: number;
  eventCount: number;
  pendingHighRisk: number;
  denoiseRate: number;
  topChains: { sourceIp: string; stageCount: number; priority: string }[];
  topEvents: { sourceIp: string; alertTypeLabel: string; count: number; priority: string }[];
}

// ---------------- 规则兜底(无 key / LLM 失败时,从同一份结构化输入生成可解释文本)----------------
function ruleChain(p: ChainPayload) {
  const flow = [...new Set(p.steps.map((s) => s.tactic))].join(" → ");
  const lastTactic = p.steps[p.steps.length - 1]?.tactic ?? "后续渗透";
  return {
    source: "rule" as const,
    narrative: `攻击者 ${p.sourceIp}(${p.isExternal ? "外部公网" : "内网"})沿杀伤链推进:${flow},共跨越 ${p.stageCount} 个战术阶段、${p.count} 条告警。`,
    intent: p.stageCount >= 3 ? "已深入内网,疑似定向入侵 / 横向移动" : "处于攻击早中期,试探与立足阶段",
    nextActions: [
      `延续「${lastTactic}」后的下一阶段动作(如横向移动 / 数据外发)`,
      `复用同一入口对 ${p.sourceIp} 关联资产二次尝试`,
    ],
    priorityAdvice: `优先级 ${p.priority}:建议立即封禁 ${p.sourceIp} 并排查链路涉及主机。`,
  };
}
function ruleEvent(p: EventPayload) {
  return {
    source: "rule" as const,
    rationale: p.merged
      ? `同源 ${p.sourceIp} 在 ${p.firstSeen.slice(11, 16)}~${p.lastSeen.slice(11, 16)} 触发 ${p.count} 次「${p.alertTypeLabel}」,按「同源 IP + 同类型」归并为 1 个事件以降噪。`
      : `独立告警:源 ${p.sourceIp} 单次「${p.alertTypeLabel}」,无同源同类型重复,未参与归并。`,
    risk: `最高置信度 ${p.maxConfidence}、优先级 ${p.priority};${p.priority === "P0" || p.priority === "P1" ? "高风险,需尽快处置" : "中低风险,纳入观察"}。`,
    needsHuman: p.priority === "P0" || p.priority === "P1",
  };
}
function rulePosture(p: PosturePayload) {
  const top = p.topChains[0] ?? p.topEvents[0];
  const topThreat = p.topChains[0]
    ? `${p.topChains[0].sourceIp}(${p.topChains[0].stageCount} 阶段攻击链 · ${p.topChains[0].priority})`
    : p.topEvents[0]
      ? `${p.topEvents[0].sourceIp}(${p.topEvents[0].alertTypeLabel} ×${p.topEvents[0].count} · ${p.topEvents[0].priority})`
      : "暂无显著威胁";
  return {
    source: "rule" as const,
    summary: `今日 ${p.totalAlerts} 条告警经聚合降噪为 ${p.eventCount} 个事件(降噪率 ${Math.round(p.denoiseRate * 100)}%),其中待处置高危 ${p.pendingHighRisk} 个。`,
    topThreat,
    recommendations: [
      top ? `优先处置最高威胁:${topThreat}` : "保持监控,暂无需紧急处置",
      p.pendingHighRisk > 0 ? `清理 ${p.pendingHighRisk} 个待处置高危(P0/P1)告警` : "持续关注新增告警",
    ],
  };
}

// ---------------- 内存缓存:key = mode:稳定标识(数据变化即失效)----------------
const cache = new Map<string, unknown>();

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: "chain" | "event" | "posture";
      payload?: unknown;
      cacheKey?: string;
      force?: boolean;
    };
    const { mode, payload, cacheKey, force } = body;
    if (!mode || !payload) {
      return NextResponse.json({ error: "缺少 mode 或 payload" }, { status: 400 });
    }
    const key = `${mode}:${cacheKey ?? ""}`;
    if (!force && cache.has(key)) {
      return NextResponse.json(cache.get(key));
    }

    let result: Record<string, unknown>;
    if (mode === "chain") {
      const p = payload as ChainPayload;
      const sys =
        '你是资深 SOC 攻击链分析师。根据给定的多阶段攻击链(已按 MITRE 杀伤链阶段排序),只输出 JSON:{"narrative":"一段话还原攻击者如何逐阶段推进,80字内","intent":"攻击者最终意图,30字内","nextActions":["接下来最可能的2-3个动作"],"priorityAdvice":"一句话优先处置建议"}。只输出 JSON,不要任何解释或代码块标记。';
      try {
        const ai = await chatJson(sys, JSON.stringify(p));
        result = {
          source: "ai",
          narrative: String(ai.narrative ?? ""),
          intent: String(ai.intent ?? ""),
          nextActions: Array.isArray(ai.nextActions) ? ai.nextActions.map(String) : [],
          priorityAdvice: String(ai.priorityAdvice ?? ""),
        };
      } catch {
        result = ruleChain(p);
      }
    } else if (mode === "event") {
      const p = payload as EventPayload;
      const sys =
        '你是资深 SOC 分析师。根据给定聚合事件(同源IP+同类型告警的归并),只输出 JSON:{"rationale":"为何这些告警应被归并为一个事件,50字内","risk":"该事件整体风险研判,50字内","needsHuman":true或false}。只输出 JSON,不要解释或代码块标记。';
      try {
        const ai = await chatJson(sys, JSON.stringify(p));
        result = {
          source: "ai",
          rationale: String(ai.rationale ?? ""),
          risk: String(ai.risk ?? ""),
          needsHuman: Boolean(ai.needsHuman),
        };
      } catch {
        result = ruleEvent(p);
      }
    } else if (mode === "posture") {
      const p = payload as PosturePayload;
      const sys =
        '你是 SOC 值班长。根据给定的全局指标与 Top 威胁,只输出 JSON:{"summary":"当前安全态势一段话总结,80字内","topThreat":"当前最大威胁,30字内","recommendations":["按优先级排列的2-3条处置建议"]}。只输出 JSON,不要解释或代码块标记。';
      try {
        const ai = await chatJson(sys, JSON.stringify(p));
        result = {
          source: "ai",
          summary: String(ai.summary ?? ""),
          topThreat: String(ai.topThreat ?? ""),
          recommendations: Array.isArray(ai.recommendations) ? ai.recommendations.map(String) : [],
        };
      } catch {
        result = rulePosture(p);
      }
    } else {
      return NextResponse.json({ error: "无效的 mode" }, { status: 400 });
    }

    // 仅缓存真·AI 结果:规则兜底是失败降级,不缓存——上游(模型)恢复后自动重试出 AI,避免坏结果被钉死
    if ((result as { source?: string }).source === "ai") cache.set(key, result);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
