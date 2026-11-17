// Quy tắc của BreakdownChart (chủ dự án duyệt 2026-11-17, đề xuất B; DESIGN.md 5.1 "Biểu đồ"): chọn dạng biểu đồ theo dữ
// liệu và màu theo tông trạng thái của DESIGN.md 3.5. Tách khỏi component để dùng ở nơi gọi (fast refresh).

const MAX_PARTS = 12

// 'stack': các phần cộng đúng bằng tổng; 'bars': không cộng đủ (theo tầng, ca, nhân viên…); 'none': không vẽ
export function chartKind(total, breakdown) {
  const parts = (breakdown ?? []).filter((b) => typeof b.value === 'number')
  if (parts.length < 2 || parts.length > MAX_PARTS) return 'none'
  const sum = parts.reduce((s, b) => s + b.value, 0)
  if (sum <= 0) return 'none'
  return typeof total === 'number' && Math.abs(sum - total) < 1e-9 ? 'stack' : 'bars'
}

const NEUTRAL = ['var(--chart-2)', 'var(--info-foreground)', 'var(--muted-foreground)']

// Thứ tự kiểm quan trọng: trạng thái trung tính (Chưa đến hạn, Hoàn thành trễ…) và dấu giường "Chờ sẵn sàng" đứng trước
// các nhóm chứa cùng từ (DUE, COMPLETED, AWAITING)
const RULES = [
  [/NOT_YET_DUE|COMPLETED_LATE|NOT_PERFORMED|CANCELLED/, 'var(--muted-foreground)'],
  [/AWAITING_READY/, 'var(--bed-pending)'],
  [/UNDER_MAINTENANCE|MAINTENANCE/, 'var(--bed-maintenance)'],
  [/^HELD|_HELD|HELD_/, 'var(--bed-held)'],
  [/^OCCUPIED$/, 'var(--bed-occupied)'],
  [/^EMPTY$/, 'var(--input)'],
  [/OVERDUE|URGENT|EMERGENCY|CRITICAL|MISSED|MAX_ESCALATED/, 'var(--destructive)'],
  [/COMPLETED|DONE|IN_RESIDENCE|CLOSED|CONFIRMED|FINALIZED|PRESENT|^MET$|SATISFIED/, 'var(--success-foreground)'],
  [
    /^DUE$|MEDIUM|MODERATE|^NEW$|ESCALATED|TEMPORARILY_ABSENT|HOSPITAL|AWAITING|PENDING|NOT_MET|PROVISIONAL/,
    'var(--warning-foreground)',
  ],
]

export function toneOf(key, index) {
  const k = String(key).toUpperCase()
  const rule = RULES.find(([re]) => re.test(k))
  return rule ? rule[1] : NEUTRAL[index % NEUTRAL.length]
}
