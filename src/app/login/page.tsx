"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ACCOUNTS: Record<string, string> = { admin: "123456", security: "123456", user1: "123456" };

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("security");
  const [password, setPassword] = useState("123456");
  const [err, setErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (ACCOUNTS[username] && ACCOUNTS[username] === password) {
      localStorage.setItem("soc-auth", username);
      document.cookie = `soc-role=${encodeURIComponent(username)}; path=/; max-age=86400; samesite=lax`;
      router.replace("/");
    } else {
      setErr("用户名或密码错误(演示账号:security / 123456)");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-4 flex items-center gap-2">
          <Radar className="size-6 text-sky-400" />
          <div className="text-lg font-semibold">AI SOC 安全运营看板</div>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          演示登录(非真实鉴权)。账号:admin / security / user1,密码均为 123456。
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
          />
          {err && <div className="text-xs text-red-400">{err}</div>}
          <Button type="submit" className="w-full">
            登录
          </Button>
        </form>
      </Card>
    </div>
  );
}
