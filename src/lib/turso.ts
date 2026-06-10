// Turso (libSQL) 数据访问层 —— 仅由服务端 API Route 调用,绝不在客户端 import
import { createClient, type Client } from "@libsql/client";
import type {
  AlertStatus,
  AlertType,
  DispositionMode,
  DispositionRecord,
  LearningMemory,
  RawAlert,
  SocSnapshot,
  WhitelistEntry,
} from "@/types";
import { SEED_ALERTS, SEED_ASSETS } from "@/lib/seed";

let _client: Client | null = null;
function client(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error("TURSO_DATABASE_URL 未配置");
    _client = createClient({ url, authToken });
  }
  return _client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS assets (ip TEXT PRIMARY KEY, name TEXT NOT NULL, importance INTEGER NOT NULL, department TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, name TEXT NOT NULL, alert_type TEXT NOT NULL, source_ip TEXT NOT NULL, dest_ip TEXT NOT NULL, severity TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', evidence TEXT)`,
  `CREATE TABLE IF NOT EXISTS learning_memory (alert_type TEXT PRIMARY KEY, adjustment INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS dispositions (id TEXT PRIMARY KEY, alert_id TEXT NOT NULL, alert_name TEXT NOT NULL, action TEXT NOT NULL, operator TEXT NOT NULL, timestamp TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'advisory', auto INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS whitelist (id TEXT PRIMARY KEY, value TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

// 幂等列迁移 —— 兼容早于本次改造创建的旧库(列已存在则忽略)
const MIGRATIONS = [
  "ALTER TABLE alerts ADD COLUMN evidence TEXT",
  "ALTER TABLE dispositions ADD COLUMN mode TEXT NOT NULL DEFAULT 'advisory'",
  "ALTER TABLE dispositions ADD COLUMN auto INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE dispositions ADD COLUMN revoked INTEGER NOT NULL DEFAULT 0",
];

let _ready: Promise<void> | null = null;
/** 幂等建表 + 列迁移 + 首访为空时自动播种(每个 serverless 实例仅执行一次) */
function ensureReady(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      const c = client();
      for (const sql of SCHEMA) await c.execute(sql);
      for (const sql of MIGRATIONS) {
        try {
          await c.execute(sql);
        } catch {
          /* 列已存在,忽略 */
        }
      }
      const r = await c.execute("SELECT COUNT(*) AS n FROM alerts");
      const n = Number((r.rows[0] as Record<string, unknown>).n ?? 0);
      if (n === 0) await seed(c);
    })().catch((e) => {
      _ready = null; // 失败后允许重试
      throw e;
    });
  }
  return _ready;
}

async function seed(c: Client) {
  const stmts = [
    ...SEED_ASSETS.map((a) => ({
      sql: "INSERT OR REPLACE INTO assets (ip,name,importance,department) VALUES (?,?,?,?)",
      args: [a.ip, a.name, a.importance, a.department] as const,
    })),
    ...SEED_ALERTS.map((al) => ({
      sql: "INSERT OR REPLACE INTO alerts (id,name,alert_type,source_ip,dest_ip,severity,timestamp,status,evidence) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [al.id, al.name, al.alertType, al.sourceIp, al.destIp, al.severity, al.timestamp, al.status, al.evidence ?? null] as const,
    })),
  ];
  await c.batch(stmts.map((s) => ({ sql: s.sql, args: [...s.args] })), "write");
}

export async function readSnapshot(): Promise<SocSnapshot> {
  await ensureReady();
  const c = client();
  const [assetsR, alertsR, lmR, dispR, wlR, setR] = await Promise.all([
    c.execute("SELECT * FROM assets"),
    c.execute("SELECT * FROM alerts ORDER BY timestamp ASC"),
    c.execute("SELECT * FROM learning_memory"),
    c.execute("SELECT * FROM dispositions ORDER BY timestamp DESC"),
    c.execute("SELECT * FROM whitelist ORDER BY created_at DESC"),
    c.execute("SELECT value FROM settings WHERE key='disposition_mode'"),
  ]);
  const row = (r: unknown) => r as Record<string, string | number | null>;
  const assets = assetsR.rows.map((r) => {
    const x = row(r);
    return {
      ip: String(x.ip),
      name: String(x.name),
      importance: Number(x.importance) as 1 | 2 | 3,
      department: String(x.department),
    };
  });
  const alerts: RawAlert[] = alertsR.rows.map((r) => {
    const x = row(r);
    return {
      id: String(x.id),
      name: String(x.name),
      alertType: String(x.alert_type) as AlertType,
      sourceIp: String(x.source_ip),
      destIp: String(x.dest_ip),
      severity: String(x.severity) as RawAlert["severity"],
      timestamp: String(x.timestamp),
      status: String(x.status) as AlertStatus,
      evidence: x.evidence != null ? String(x.evidence) : undefined,
    };
  });
  const learningMemory: LearningMemory = {};
  for (const r of lmR.rows) {
    const x = row(r);
    learningMemory[String(x.alert_type) as AlertType] = Number(x.adjustment);
  }
  const dispositions: DispositionRecord[] = dispR.rows.map((r) => {
    const x = row(r);
    return {
      id: String(x.id),
      alertId: String(x.alert_id),
      alertName: String(x.alert_name),
      action: String(x.action),
      operator: String(x.operator),
      timestamp: String(x.timestamp),
      mode: (String(x.mode ?? "advisory") === "auto" ? "auto" : "advisory") as DispositionMode,
      auto: Number(x.auto ?? 0) === 1,
      revoked: Number(x.revoked ?? 0) === 1,
    };
  });
  const whitelist: WhitelistEntry[] = wlR.rows.map((r) => {
    const x = row(r);
    return {
      id: String(x.id),
      value: String(x.value),
      kind: (String(x.kind) === "cidr" ? "cidr" : "ip") as WhitelistEntry["kind"],
      note: x.note != null ? String(x.note) : undefined,
      createdAt: String(x.created_at),
    };
  });
  const modeVal = setR.rows.length ? String((setR.rows[0] as Record<string, unknown>).value) : "advisory";
  const dispositionMode: DispositionMode = modeVal === "auto" ? "auto" : "advisory";
  return { assets, alerts, learningMemory, dispositions, dispositionMode, whitelist };
}

export async function setAlertStatus(alertId: string, status: AlertStatus) {
  await ensureReady();
  await client().execute({ sql: "UPDATE alerts SET status=? WHERE id=?", args: [status, alertId] });
}

export async function adjustLearning(type: AlertType, delta: number, floor: number, ceil: number) {
  await ensureReady();
  const c = client();
  const cur = await c.execute({
    sql: "SELECT adjustment FROM learning_memory WHERE alert_type=?",
    args: [type],
  });
  const prev = cur.rows.length ? Number((cur.rows[0] as Record<string, unknown>).adjustment) : 0;
  const next = Math.max(floor, Math.min(ceil, prev + delta));
  await c.execute({
    sql: "INSERT INTO learning_memory (alert_type,adjustment) VALUES (?,?) ON CONFLICT(alert_type) DO UPDATE SET adjustment=excluded.adjustment",
    args: [type, next],
  });
}

export async function addDisposition(d: DispositionRecord) {
  await ensureReady();
  await client().execute({
    sql: "INSERT INTO dispositions (id,alert_id,alert_name,action,operator,timestamp,mode,auto,revoked) VALUES (?,?,?,?,?,?,?,?,?)",
    args: [d.id, d.alertId, d.alertName, d.action, d.operator, d.timestamp, d.mode, d.auto ? 1 : 0, d.revoked ? 1 : 0],
  });
}

/** 撤销单条处置:标记 revoked=1 + 关联告警回到待处置(记录保留用于审计),并模拟解除封禁 */
export async function revokeDisposition(dispositionId: string) {
  await ensureReady();
  const c = client();
  const r = await c.execute({
    sql: "SELECT alert_id FROM dispositions WHERE id=? AND revoked=0",
    args: [dispositionId],
  });
  if (!r.rows.length) return;
  const alertId = String((r.rows[0] as Record<string, unknown>).alert_id);
  await c.batch(
    [
      { sql: "UPDATE dispositions SET revoked=1 WHERE id=?", args: [dispositionId] },
      { sql: "UPDATE alerts SET status='pending' WHERE id=?", args: [alertId] },
    ],
    "write",
  );
}

/** 一键恢复全部"自动处置":未撤销的 auto=1 记录全部撤销,关联告警回到待处置(应对 AI 误操作) */
export async function restoreAllAuto(): Promise<number> {
  await ensureReady();
  const c = client();
  const r = await c.execute("SELECT id, alert_id FROM dispositions WHERE auto=1 AND revoked=0");
  if (!r.rows.length) return 0;
  const stmts = r.rows.flatMap((row) => {
    const x = row as Record<string, unknown>;
    return [
      { sql: "UPDATE dispositions SET revoked=1 WHERE id=?", args: [String(x.id)] as const },
      { sql: "UPDATE alerts SET status='pending' WHERE id=?", args: [String(x.alert_id)] as const },
    ];
  });
  await c.batch(stmts.map((s) => ({ sql: s.sql, args: [...s.args] })), "write");
  return r.rows.length;
}

export async function addWhitelistEntry(e: WhitelistEntry) {
  await ensureReady();
  await client().execute({
    sql: "INSERT OR REPLACE INTO whitelist (id,value,kind,note,created_at) VALUES (?,?,?,?,?)",
    args: [e.id, e.value, e.kind, e.note ?? null, e.createdAt],
  });
}

export async function removeWhitelistEntry(id: string) {
  await ensureReady();
  await client().execute({ sql: "DELETE FROM whitelist WHERE id=?", args: [id] });
}

export async function getDispositionMode(): Promise<DispositionMode> {
  await ensureReady();
  const r = await client().execute("SELECT value FROM settings WHERE key='disposition_mode'");
  const v = r.rows.length ? String((r.rows[0] as Record<string, unknown>).value) : "advisory";
  return v === "auto" ? "auto" : "advisory";
}

export async function setDispositionMode(mode: DispositionMode) {
  await ensureReady();
  await client().execute({
    sql: "INSERT INTO settings (key,value) VALUES ('disposition_mode',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    args: [mode],
  });
}

export async function resetAll() {
  await ensureReady();
  const c = client();
  await c.batch(
    [
      "DELETE FROM dispositions",
      "DELETE FROM learning_memory",
      "DELETE FROM alerts",
      "DELETE FROM assets",
      "DELETE FROM whitelist",
      "DELETE FROM settings",
    ],
    "write",
  );
  await seed(c);
}
