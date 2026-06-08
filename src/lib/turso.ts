// Turso (libSQL) 数据访问层 —— 仅由服务端 API Route 调用,绝不在客户端 import
import { createClient, type Client } from "@libsql/client";
import type {
  AlertStatus,
  AlertType,
  DispositionRecord,
  LearningMemory,
  RawAlert,
  SocSnapshot,
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
  `CREATE TABLE IF NOT EXISTS alerts (id TEXT PRIMARY KEY, name TEXT NOT NULL, alert_type TEXT NOT NULL, source_ip TEXT NOT NULL, dest_ip TEXT NOT NULL, severity TEXT NOT NULL, timestamp TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending')`,
  `CREATE TABLE IF NOT EXISTS learning_memory (alert_type TEXT PRIMARY KEY, adjustment INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS dispositions (id TEXT PRIMARY KEY, alert_id TEXT NOT NULL, alert_name TEXT NOT NULL, action TEXT NOT NULL, operator TEXT NOT NULL, timestamp TEXT NOT NULL)`,
];

let _ready: Promise<void> | null = null;
/** 幂等建表 + 首访为空时自动播种(每个 serverless 实例仅执行一次) */
function ensureReady(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      const c = client();
      for (const sql of SCHEMA) await c.execute(sql);
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
      sql: "INSERT OR REPLACE INTO alerts (id,name,alert_type,source_ip,dest_ip,severity,timestamp,status) VALUES (?,?,?,?,?,?,?,?)",
      args: [al.id, al.name, al.alertType, al.sourceIp, al.destIp, al.severity, al.timestamp, al.status] as const,
    })),
  ];
  await c.batch(stmts.map((s) => ({ sql: s.sql, args: [...s.args] })), "write");
}

export async function readSnapshot(): Promise<SocSnapshot> {
  await ensureReady();
  const c = client();
  const [assetsR, alertsR, lmR, dispR] = await Promise.all([
    c.execute("SELECT * FROM assets"),
    c.execute("SELECT * FROM alerts ORDER BY timestamp ASC"),
    c.execute("SELECT * FROM learning_memory"),
    c.execute("SELECT * FROM dispositions ORDER BY timestamp DESC"),
  ]);
  const row = (r: unknown) => r as Record<string, string | number>;
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
    };
  });
  return { assets, alerts, learningMemory, dispositions };
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
    sql: "INSERT INTO dispositions (id,alert_id,alert_name,action,operator,timestamp) VALUES (?,?,?,?,?,?)",
    args: [d.id, d.alertId, d.alertName, d.action, d.operator, d.timestamp],
  });
}

export async function resetAll() {
  await ensureReady();
  const c = client();
  await c.batch(
    ["DELETE FROM dispositions", "DELETE FROM learning_memory", "DELETE FROM alerts", "DELETE FROM assets"],
    "write",
  );
  await seed(c);
}
