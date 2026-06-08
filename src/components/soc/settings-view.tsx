"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useAiStatus } from "@/store/aiConfigStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function SettingsView() {
  const configured = useAiStatus((s) => s.configured);
  const model = useAiStatus((s) => s.model);
  const check = useAiStatus((s) => s.check);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void check();
  }, [check]);

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
