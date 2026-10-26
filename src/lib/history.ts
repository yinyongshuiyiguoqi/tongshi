const KEY = 'tongshi.recent';
const MAX = 5;

export interface RecentItem {
  text: string;
  title: string;
  at: number;
}

export function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 忽略
  }
}

export function pushRecent(text: string, title: string) {
  try {
    const list = loadRecent().filter((r) => r.text !== text);
    list.unshift({ text, title, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 存储不可用就算了，不影响主流程
  }
}
