// 预置 Mock 种子数据 —— 刻意构造 4 类场景,确保一次演示覆盖降噪/建议/学习
import type { Asset, RawAlert } from "@/types";

export const SEED_ASSETS: Asset[] = [
  { ip: "10.0.1.100", name: "核心数据库服务器", importance: 3, department: "技术部" },
  { ip: "10.0.1.102", name: "财务系统服务器", importance: 3, department: "财务部" },
  { ip: "10.0.1.101", name: "OA 系统服务器", importance: 2, department: "行政部" },
  { ip: "10.0.1.103", name: "官网 Web 服务器", importance: 2, department: "市场部" },
  { ip: "10.0.2.50", name: "测试环境服务器", importance: 1, department: "技术部" },
  { ip: "10.0.2.51", name: "内部 Wiki", importance: 1, department: "技术部" },
];

const T = (hhmm: string) => `2026-06-08T${hhmm}:00+08:00`;

export const SEED_ALERTS: RawAlert[] = [
  // 场景① 同源 192.168.100.5 对核心数据库 5 次暴力破解 -> 聚合为 1 个事件 + 时间线
  { id: "a01", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:12"), status: "pending" },
  { id: "a02", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:13"), status: "pending" },
  { id: "a03", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:15"), status: "pending" },
  { id: "a04", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:18"), status: "pending" },
  { id: "a05", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "critical", timestamp: T("09:21"), status: "pending" },

  // 场景② 同源 10.99.0.33 对官网 3 次端口扫描 -> 聚合(误报演示首选)
  { id: "a06", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "10.99.0.33", destIp: "10.0.1.103", severity: "medium", timestamp: T("09:30"), status: "pending" },
  { id: "a07", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "10.99.0.33", destIp: "10.0.1.103", severity: "medium", timestamp: T("09:31"), status: "pending" },
  { id: "a08", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "10.99.0.33", destIp: "10.0.1.103", severity: "low", timestamp: T("09:33"), status: "pending" },

  // 场景③ 两条独立 SQL 注入(不同源IP)-> 各自独立、不聚合,均触发 AI 建议
  { id: "a09", name: "SQL 注入攻击", alertType: "sql_injection", sourceIp: "203.0.113.7", destIp: "10.0.1.102", severity: "critical", timestamp: T("09:40"), status: "pending" },
  { id: "a10", name: "SQL 注入攻击", alertType: "sql_injection", sourceIp: "198.51.100.9", destIp: "10.0.1.103", severity: "high", timestamp: T("09:42"), status: "pending" },

  // 场景④ 单条恶意外联(最高置信度)-> 触发 AI 处置建议
  { id: "a11", name: "疑似 C2 心跳外联", alertType: "malware_callback", sourceIp: "10.0.2.50", destIp: "45.61.137.88", severity: "critical", timestamp: T("10:05"), status: "pending" },

  // 场景⑤ 完整入站攻击链:外部攻击者 162.158.22.10 对官网三阶段推进(侦察→初始访问→权限提升)
  { id: "a12", name: "敏感路径扫描", alertType: "web_scan", sourceIp: "162.158.22.10", destIp: "10.0.1.103", severity: "low", timestamp: T("08:50"), status: "pending" },
  { id: "a17", name: "SQL 注入获取入口", alertType: "sql_injection", sourceIp: "162.158.22.10", destIp: "10.0.1.103", severity: "critical", timestamp: T("09:05"), status: "pending" },
  { id: "a18", name: "注入后提权尝试", alertType: "priv_escalation", sourceIp: "162.158.22.10", destIp: "10.0.1.103", severity: "high", timestamp: T("09:35"), status: "pending" },

  // 填充:覆盖 P3~P0 全谱、点缀独立告警(各自单条,不成链)
  { id: "a13", name: "反射型 XSS 尝试", alertType: "xss", sourceIp: "203.0.113.50", destIp: "10.0.1.103", severity: "medium", timestamp: T("09:50"), status: "pending" },
  { id: "a14", name: "本地提权行为", alertType: "priv_escalation", sourceIp: "10.0.2.51", destIp: "10.0.1.100", severity: "high", timestamp: T("10:10"), status: "pending" },
  { id: "a15", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "185.220.101.5", destIp: "10.0.1.101", severity: "low", timestamp: T("10:15"), status: "pending" },
  { id: "a16", name: "RDP 暴力破解尝试", alertType: "brute_force", sourceIp: "209.141.33.2", destIp: "10.0.1.101", severity: "medium", timestamp: T("10:20"), status: "pending" },
];
