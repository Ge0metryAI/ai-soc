"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useAiConfig } from "@/store/aiConfigStore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsView() {
  const setConfig = useAiConfig((s) => s.setConfig);
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.resolve(useAiConfig.persist.rehydrate()).then(() => {
      const c = useAiConfig.getState();
      setBaseUrl(c.baseUrl);
      setApiKey(c.apiKey);
      setModel(c.model);
      setEnabled(c.enabled);
    });
  }, []);

  function save() {
    setConfig({ baseUrl, apiKey, model, enabled });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: { baseUrl, apiKey, model } }),
      });
      const data = await res.json();
      setTestResult(res.ok ? `✅ 连接成功:${data.suggestion || "(空响应)"}` : `❌ ${data.error}`);
    } catch (e) {
      setTestResult(`❌ ${String(e)}`);
    }
    setTesting(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Bot className="size-4 text-sky-400" />
          AI 增强设置(可选)
        </div>
        <p className="text-xs text-muted-foreground">
          配置任意兼容 OpenAI 接口的模型(OpenAI / DeepSeek / Moonshot / OpenRouter / 本地 Ollama 均可)。
          启用后,在告警详情可用「🤖 AI 生成」动态生成处置建议;未配置或调用失败时,自动回退到内置可解释规则模板。
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
          启用 AI 增强
        </label>

        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">Base URL</div>
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">API Key</div>
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">模型</div>
          <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini / deepseek-chat / ..." />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={save}>保存</Button>
          <Button variant="outline" onClick={() => void test()} disabled={testing}>
            {testing ? "测试中..." : "测试连接"}
          </Button>
          {saved && <span className="text-xs text-emerald-400">已保存</span>}
        </div>
        {testResult && <div className="rounded-md border p-2 text-xs">{testResult}</div>}

        <p className="text-xs text-amber-400/80">
          ⚠️ API Key 仅保存在你浏览器的 localStorage,请求经本应用服务端转发至你配置的接口。公开演示时注意不要暴露付费 Key。
        </p>
      </Card>
    </div>
  );
}
