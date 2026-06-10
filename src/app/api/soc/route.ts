// 后端 API —— 唯一与 Turso 交互的入口。GET 读快照;POST 执行误报/采纳/模式/白名单/撤销/自动处置等操作。
import { NextResponse } from "next/server";
import {
  LEARNING_CEIL,
  LEARNING_DELTA,
  LEARNING_FLOOR,
  checkExemption,
  deriveAlerts,
  generateSuggestion,
  isAutoEligible,
} from "@/lib/engine";
import {
  addDisposition,
  addWhitelistEntry,
  adjustLearning,
  getDispositionMode,
  readSnapshot,
  removeWhitelistEntry,
  resetAll,
  restoreAllAuto,
  revokeDisposition,
  setAlertStatus,
  setDispositionMode,
} from "@/lib/turso";
import type { DispositionMode } from "@/types";

export const dynamic = "force-dynamic"; // 命中数据库,禁用静态缓存

/** 从 cookie 读取登录角色(演示级:登录时由客户端写入)。user1 为只读账号,禁止写操作。 */
function getRole(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)soc-role=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET() {
  try {
    // 默认 human-in-the-loop:AI 只研判给建议,不自动处置;自动处置仅在"自动模式"下经 POST auto_dispose 显式发起
    const snap = await readSnapshot();
    return NextResponse.json(snap);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

interface PostBody {
  action?:
    | "false_positive"
    | "true_positive"
    | "adopt"
    | "reset"
    | "set_mode"
    | "wl_add"
    | "wl_remove"
    | "revoke"
    | "restore_all"
    | "auto_dispose";
  alertId?: string;
  actionText?: string;
  operator?: string;
  mode?: DispositionMode;
  dispositionId?: string;
  whitelist?: { value?: string; kind?: "ip" | "cidr"; note?: string };
  whitelistId?: string;
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
          mode: snap.dispositionMode,
          auto: false, // 人工采纳
          revoked: false,
        });
      }
    } else if (action === "set_mode" && (body.mode === "advisory" || body.mode === "auto")) {
      await setDispositionMode(body.mode);
    } else if (action === "wl_add" && body.whitelist?.value && (body.whitelist.kind === "ip" || body.whitelist.kind === "cidr")) {
      await addWhitelistEntry({
        id: crypto.randomUUID(),
        value: body.whitelist.value.trim(),
        kind: body.whitelist.kind,
        note: body.whitelist.note?.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
    } else if (action === "wl_remove" && body.whitelistId) {
      await removeWhitelistEntry(body.whitelistId);
    } else if (action === "revoke" && body.dispositionId) {
      await revokeDisposition(body.dispositionId);
    } else if (action === "restore_all") {
      await restoreAllAuto();
    } else if (action === "auto_dispose") {
      // 服务端二次校验(纵深防御):仅在自动模式下,对合格且非白名单的告警自动处置
      const mode = await getDispositionMode();
      if (mode !== "auto") {
        return NextResponse.json({ error: "当前非自动处置模式,已拒绝自动处置" }, { status: 409 });
      }
      const snap = await readSnapshot();
      const assetMap = Object.fromEntries(snap.assets.map((a) => [a.ip, a]));
      const derived = deriveAlerts(snap.alerts, snap.learningMemory, snap.assets);
      const ts = new Date().toISOString();
      for (const a of derived) {
        if (!isAutoEligible(a)) continue; // P0/P1 + 置信度≥90 + 非危险动作 + 待处置
        if (checkExemption(a, snap.whitelist, assetMap).exempt) continue; // 核心资产/白名单豁免
        const actionTxt = generateSuggestion(a, a.confidence, a.priority) ?? "AI 自动处置";
        await setAlertStatus(a.id, "adopted");
        await addDisposition({
          id: crypto.randomUUID(),
          alertId: a.id,
          alertName: a.name,
          action: actionTxt,
          operator: "AI-自动",
          timestamp: ts,
          mode: "auto",
          auto: true,
          revoked: false,
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
