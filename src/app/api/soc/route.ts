// 后端 API —— 唯一与 Turso 交互的入口。GET 读快照;POST 执行误报/采纳/重置等操作。
import { NextResponse } from "next/server";
import { LEARNING_CEIL, LEARNING_DELTA, LEARNING_FLOOR } from "@/lib/engine";
import {
  addDisposition,
  adjustLearning,
  readSnapshot,
  resetAll,
  setAlertStatus,
} from "@/lib/turso";

export const dynamic = "force-dynamic"; // 命中数据库,禁用静态缓存

/** 从 cookie 读取登录角色(演示级:登录时由客户端写入)。user1 为只读账号,禁止写操作。 */
function getRole(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)soc-role=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET() {
  try {
    const snap = await readSnapshot();
    return NextResponse.json(snap);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

interface PostBody {
  action?: "false_positive" | "true_positive" | "adopt" | "reset";
  alertId?: string;
  actionText?: string;
  operator?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as PostBody;
    const { action, alertId, actionText, operator } = body;

    if (getRole(req) === "user1") {
      return NextResponse.json({ error: "只读账号(user1)无权执行写操作" }, { status: 403 });
    }

    if (action === "reset") {
      await resetAll();
    } else if (action === "false_positive" && alertId) {
      const snap = await readSnapshot();
      const al = snap.alerts.find((a) => a.id === alertId);
      if (al) {
        await setAlertStatus(alertId, "false_positive");
        await adjustLearning(al.alertType, -LEARNING_DELTA, LEARNING_FLOOR, LEARNING_CEIL);
      }
    } else if (action === "true_positive" && alertId) {
      const snap = await readSnapshot();
      const al = snap.alerts.find((a) => a.id === alertId);
      if (al) {
        await setAlertStatus(alertId, "pending");
        await adjustLearning(al.alertType, LEARNING_DELTA, LEARNING_FLOOR, LEARNING_CEIL);
      }
    } else if (action === "adopt" && alertId) {
      const snap = await readSnapshot();
      const al = snap.alerts.find((a) => a.id === alertId);
      if (al) {
        await setAlertStatus(alertId, "adopted");
        await addDisposition({
          id: crypto.randomUUID(),
          alertId,
          alertName: al.name,
          action: actionText ?? "采纳 AI 处置建议",
          operator: operator ?? "security",
          timestamp: new Date().toISOString(),
        });
      }
    } else {
      return NextResponse.json({ error: "无效的 action" }, { status: 400 });
    }

    const snap = await readSnapshot();
    return NextResponse.json(snap);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
