"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bot,
  ClipboardCheck,
  GitMerge,
  LayoutDashboard,
  LogOut,
  Radar,
  RefreshCw,
  Settings,
  ShieldAlert,
} from "lucide-react";
import { useSocStore } from "@/store/socStore";
import { useAiStatus } from "@/store/aiConfigStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/", label: "仪表板", icon: LayoutDashboard },
  { href: "/alerts", label: "告警中心", icon: ShieldAlert },
  { href: "/events", label: "聚合事件", icon: GitMerge },
  { href: "/dispositions", label: "处置历史", icon: ClipboardCheck },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrate = useSocStore((s) => s.hydrate);
  const reset = useSocStore((s) => s.reset);
  const connectionMode = useSocStore((s) => s.connectionMode);
  const status = useSocStore((s) => s.status);
  const role = useSocStore((s) => s.role);
  const setRole = useSocStore((s) => s.setRole);
  const aiConfigured = useAiStatus((s) => s.configured);
  const checkAi = useAiStatus((s) => s.check);
  const canOperate = role !== "user1";
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const auth = typeof window !== "undefined" ? localStorage.getItem("soc-auth") : null;
    if (!auth) {
      router.replace("/login");
      return;
    }
    void useSocStore.persist.rehydrate();
    setRole(auth);
    document.cookie = `soc-role=${encodeURIComponent(auth)}; path=/; max-age=86400; samesite=lax`;
    setAuthed(true);
    void hydrate();
    void checkAi();
  }, [hydrate, router, setRole, checkAi]);

  function logout() {
    localStorage.removeItem("soc-auth");
    document.cookie = "soc-role=; path=/; max-age=0";
    router.replace("/login");
  }

  const current = NAV.find((n) => n.href === pathname);

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-4 py-4">
          <Radar className="size-6 text-sky-400" />
          <div className="text-sm font-semibold leading-tight">
            AI SOC
            <span className="block text-xs font-normal text-muted-foreground">安全运营看板</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((n) => {
            const active = pathname === n.href;
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Activity className="size-3" />
            角色:<span className="text-foreground">{role ?? "-"}</span>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={logout}>
            <LogOut className="size-4" />
            退出
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <div className="text-sm font-medium">{current?.label ?? "AI SOC"}</div>
          <div className="flex items-center gap-3">
            {!canOperate && (
              <span className="rounded-md bg-zinc-500/15 px-2 py-1 text-xs text-zinc-400 ring-1 ring-zinc-500/30">
                只读模式(user1)
              </span>
            )}
            {aiConfigured && (
              <span className="flex items-center gap-1 rounded-md bg-sky-500/15 px-2 py-1 text-xs text-sky-400 ring-1 ring-sky-500/30">
                <Bot className="size-3" />
                AI 增强
              </span>
            )}
            {connectionMode === "fallback" ? (
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs text-amber-400 ring-1 ring-amber-500/30">
                本地降级模式(Turso 不可达)
              </span>
            ) : (
              status === "ready" && (
                <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs text-emerald-400 ring-1 ring-emerald-500/30">
                  Turso 已连接
                </span>
              )
            )}
            {canOperate && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => void reset()}>
                <RefreshCw className="size-4" />
                重置演示数据
              </Button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
