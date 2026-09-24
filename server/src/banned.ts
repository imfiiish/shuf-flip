// 保留用户名：与系统身份 / 品牌 / 基础设施 / 路由功能 / 无意义词冲突
const BANNED = new Set([
  // 系统身份
  'admin', 'administrator', 'root', 'superuser', 'sysadmin', 'system',
  'operator', 'official', 'staff', 'team', 'owner', 'moderator', 'mod',
  'support', 'help', 'service', 'bot',
  // 品牌项目
  'shuf', 'shuflip', 'shuf-flip', 'flip', 'shufword', 'vocab', 'vocabs',
  // 基础设施
  'api', 'www', 'mail', 'email', 'smtp', 'ftp', 'ssh', 'db', 'database',
  'postgres', 'sql', 'server', 'host', 'cdn', 'static', 'assets', 'public',
  'private', 'internal', 'localhost', 'test', 'demo', 'dev', 'guest', 'anon',
  'anonymous', 'null', 'undefined', 'nan', 'true', 'false',
  // 路由功能
  'login', 'logout', 'signin', 'signup', 'register', 'auth', 'session',
  'settings', 'profile', 'account', 'user', 'users', 'me', 'home', 'study',
  'quiz', 'stats', 'events', 'export', 'dashboard', 'health', 'ping', 'status',
  'docs', 'about', 'terms', 'privacy',
  // 无意义
  'a', 'an', 'the',
])

export function isBanned(usernameLower: string): boolean {
  return BANNED.has(usernameLower)
}
