import { BedDouble, CalendarClock, CalendarDays, HeartPulse, Home, Layers } from 'lucide-react'

// Biểu tượng và màu của từng loại thay đổi, dùng ở form lập yêu cầu và bảng yêu cầu điều chỉnh hợp đồng
export const CHANGE_TYPE_ICONS = {
  RESIDENCE_TYPE: Home,
  CARE_LEVEL: HeartPulse,
  SERVICE: Layers,
  DURATION: CalendarDays,
  BED: BedDouble,
  ARRIVAL_SCHEDULE: CalendarClock,
}

// Màu chữ, icon đậm: tối hơn màu tông 30% ở chế độ sáng; chế độ tối dùng màu tông gốc (đã sáng)
export const DEEP = {
  primary: 'text-primary',
  success: 'text-[color-mix(in_oklab,var(--success-foreground),black_45%)] dark:text-success-foreground',
  info: 'text-[color-mix(in_oklab,var(--info-foreground),black_45%)] dark:text-info-foreground',
  warning: 'text-[color-mix(in_oklab,var(--warning-foreground),black_45%)] dark:text-warning-foreground',
  accent: 'text-[color-mix(in_oklab,var(--accent-foreground),black_45%)] dark:text-accent-foreground',
  danger: 'text-[color-mix(in_oklab,var(--destructive),black_40%)] dark:text-destructive',
  slate: 'text-[color-mix(in_oklab,var(--muted-foreground),black_50%)] dark:text-muted-foreground',
}

export const CHANGE_TYPE_TONES = {
  RESIDENCE_TYPE: DEEP.primary,
  CARE_LEVEL: DEEP.danger,
  SERVICE: DEEP.accent,
  DURATION: DEEP.success,
  BED: DEEP.primary,
  ARRIVAL_SCHEDULE: DEEP.warning,
}
