// 可选 AI 增强 —— 转发到用户配置的 OpenAI 兼容接口生成处置建议(规避 CORS,Key 不落库)
import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import net from "node:net";

export const dynamic = "force-dynamic";

// SSRF 防护:禁止请求打到内网/环回/云元数据地址(生产强制;本地开发放行 localhost 便于本地 Ollama)
function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127 ||
    (a === 169 && b === 254) || // 链路本地 + 云元数据
    a === 0
  );
}

async function assertSafeUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Base URL 格式不正确");
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
    // 处理 IPv4-mapped IPv6(如 ::ffff:127.0.0.1 / ::ffff:169.254.169.254)避免绕过
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

interface Body {
  alert?: {
    name: string;
    alertType: string;
    sourceIp: string;
    destIp: string;
    severity: string;
    confidence: number;
    priority: string;
  };
  config?: { baseUrl: string; apiKey: string; model: string };
}

export async function POST(req: Request) {
  try {
    const { alert, config } = (await req.json().catch(() => ({}))) as Body;
    if (!config?.apiKey || !config?.baseUrl || !config?.model) {
      return NextResponse.json(
        { error: "AI 未配置:请在「设置」中填写 Base URL / API Key / 模型" },
        { status: 400 },
      );
    }

    const sys =
      "你是资深安全运营中心(SOC)分析师。根据给定告警信息,用简体中文输出一条具体、可执行的处置建议(50 字以内,包含动作与目标对象)。只输出建议本身,不要任何解释或前缀。";
    const usr = alert
      ? `告警名称: ${alert.name}\n类型: ${alert.alertType}\n源IP: ${alert.sourceIp} → 目的IP: ${alert.destIp}\n严重等级: ${alert.severity}\n置信度: ${alert.confidence}\n优先级: ${alert.priority}`
      : "测试连接:请用简体中文回复『连接正常』四个字。";

    const base = config.baseUrl.replace(/\/+$/, "");
    try {
      await assertSafeUrl(base);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
    const url = `${base}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: usr },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      return NextResponse.json(
        { error: `模型接口返回 ${res.status}: ${t.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    const suggestion = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ suggestion });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
