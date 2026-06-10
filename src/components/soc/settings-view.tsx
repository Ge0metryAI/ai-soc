"use client";

import { useEffect, useState } from "react";
import { Bot, ListChecks, ShieldCheck } from "lucide-react";
import { useAiStatus } from "@/store/aiConfigStore";
import { useSocStore } from "@/store/socStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DispositionMode } from "@/types";

function segCls(active: boolean) {
  return `rounded px-3 py-1.5 text-sm transition-colors ${
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
  } disabled:cursor-not-allowed disabled:opacity-50`;
}

const inputCls =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring";

export function SettingsView() {
  const configured = useAiStatus((s) => s.configured);
  const model = useAiStatus((s) => s.model);
  const check = useAiStatus((s) => s.check);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const dispositionMode = useSocStore((s) => s.dispositionMode);
  const setDispositionMode = useSocStore((s) => s.setDispositionMode);
  const runAutoDisposition = useSocStore((s) => s.runAutoDisposition);
  const whitelist = useSocStore((s) => s.whitelist);
  const addWhitelist = useSocStore((s) => s.addWhitelist);
  const removeWhitelist = useSocStore((s) => s.removeWhitelist);
  const role = useSocStore((s) => s.role);
  const canOperate = role !== "user1";

  const [wlValue, setWlValue] = useState("");
  const [wlKind, setWlKind] = useState<"ip" | "cidr">("ip");
  const [wlNote, setWlNote] = useState("");

  useEffect(() => {
    void check();
  }, [check]);

  async function switchMode(m: DispositionMode) {
    if (m === dispositionMode || !canOperate) return;
    if (
      m === "auto" &&
      !window.confirm(
        "确认切换到【自动处置模式】?AI 将立即对高置信度 P0/P1 告警自动处置(隔离主机/冻结账号等危险动作除外),核心资产与白名单不受影响。建议仅在攻防演练 / 非生产环境使用。",
      )
    ) {
      return;
    }
    await setDispositionMode(m);
    if (m === "auto") await runAutoDisposition();
  }

  function addWl() {
    const v = wlValue.trim();
    if (!v) return;
    void addWhitelist(v, wlKind, wlNote);
    setWlValue("");
    setWlNote("");
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setResult(res.ok ? `✅ 连接成功:${data.suggestion || "(空响应)"}` : `❌ ${data.error}`);
    } catch (e) {
      setResult(`❌ ${String(e)}`);
    }
    setTesting(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* 处置模式 —— 默认建议模式,人在回路 */}
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 text-emerald-400" />
          处置模式
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          默认<strong className="text-emerald-300">建议模式</strong>:AI 仅研判并给出建议,所有处置动作均需人工在告警中心确认。
          <strong className="text-red-300">自动处置模式</strong>仅建议在攻防演练 / 非生产环境开启 —— AI 会对高置信度(≥90)的 P0/P1
          告警自动处置,但<strong>隔离主机、冻结账号等危险动作永远只给建议</strong>;核心资产与白名单 IP 绝不自动处置。
        </p>
        <div className="inline-flex rounded-md border p-0.5">
          <button onClick={() => void switchMode("advisory")} className={segCls(dispositionMode === "advisory")} disabled={!canOperate}>
            建议模式(推荐)
          </button>
          <button onClick={() => void switchMode("auto")} className={segCls(dispositionMode === "auto")} disabled={!canOperate}>
            自动处置模式
          </button>
        </div>
        {dispositionMode === "auto" && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            ⚠ 当前为自动处置模式。如发现误处置,可在「处置历史」一键恢复全部自动处置。
          </div>
        )}
        {!canOperate && <p className="text-xs text-muted-foreground">只读账号(user1)无权修改处置模式。</p>}
      </Card>

      {/* 白名单 —— 防 AI 误伤的安全阀 */}
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="size-4 text-teal-400" />
          自动处置白名单
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          命中白名单的告警在自动模式下绝不会被 AI 处置。
          <strong>核心资产(重要性=核心)已自动纳入保护,无需手动添加。</strong>
          此处维护额外的 IP / CIDR 网段白名单(对告警的源、目的地址均生效)。
        </p>
        {canOperate && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={wlValue}
              onChange={(e) => setWlValue(e.target.value)}
              placeholder="10.0.1.0/24 或 203.0.113.7"
              className={`${inputCls} w-48 font-mono`}
            />
            <select value={wlKind} onChange={(e) => setWlKind(e.target.value as "ip" | "cidr")} className={inputCls}>
              <option value="ip">精确 IP</option>
              <option value="cidr">CIDR 网段</option>
            </select>
            <input
              value={wlNote}
              onChange={(e) => setWlNote(e.target.value)}
              placeholder="备注(可选)"
              className={`${inputCls} w-40`}
            />
            <Button size="sm" onClick={addWl} disabled={!wlValue.trim()}>
              添加
            </Button>
          </div>
        )}
        <div className="space-y-1">
          {whitelist.length === 0 && <p className="text-xs text-muted-foreground">暂无手动白名单条目。</p>}
          {whitelist.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-teal-300">{w.kind === "cidr" ? "网段" : "IP"}</span>
                <span className="font-mono">{w.value}</span>
                {w.note && <span className="text-muted-foreground">· {w.note}</span>}
              </div>
              {canOperate && (
                <button onClick={() => void removeWhitelist(w.id)} className="text-muted-foreground hover:text-red-400">
                  移除
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* AI 增强(动态建议生成)*/}
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-sky-400" />
          AI 增强设置
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span>当前状态</span>
            {configured ? (
              <span className="text-emerald-400">● 已配置{model ? `(模型 ${model})` : ""}</span>
            ) : (
              <span className="text-muted-foreground">○ 未配置(使用内置规则模板)</span>
            )}
          </div>
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          <p className="text-amber-400/90">
            🔐 出于安全,API Key 仅存于<strong>服务端环境变量</strong>,不在前端存储 / 显示 / 传输(请求体不携带 key)。
          </p>
          <p>
            在 Vercel 项目 <strong>Settings → Environment Variables</strong>(或本地 <code>.env.local</code>)配置:
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-[11px] leading-5">{`AI_API_KEY=sk-...                      # 模型密钥(必填,服务端)
AI_BASE_URL=https://api.openai.com/v1  # 可选,兼容 DeepSeek/Moonshot/Ollama
AI_MODEL=gpt-4o-mini                   # 可选`}</pre>
          <p>
            配置后 <strong>Redeploy</strong> 生效。随后在告警详情可用「🤖 AI 生成」动态生成建议;调用失败或未配置时,自动回退到可解释规则模板。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void test()} disabled={testing}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
          <Button variant="ghost" onClick={() => void check()}>
            刷新状态
          </Button>
        </div>
        {result && <div className="rounded-md border p-2 text-xs">{result}</div>}
      </Card>
    </div>
  );
}
