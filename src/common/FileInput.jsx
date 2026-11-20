import { cn } from '@/lib/utils'

// Ô chọn tệp dùng chung (chủ dự án yêu cầu 2026-11-17; DESIGN.md 7.2 `file-input`): khung viền nét đứt nền nhạt, nút
// "chọn tệp" bo tròn viền rõ bên trong, để ô không lẫn với chữ mô tả (`FieldDescription`) ngay dưới. Vẫn là
// input type="file" thật: nhãn qua `htmlFor`, dùng được bằng bàn phím, focus theo `--ring` như ô nhập khác.
export function FileInput({ className, ...props }) {
  return (
    <input
      type="file"
      data-slot="file-input"
      className={cn(
        'type-body-sm min-h-11 w-full cursor-pointer rounded-[10px] border border-dashed border-input bg-muted/40 px-3 py-2 text-foreground',
        'file:mr-3 file:h-9 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-background file:px-4 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        'aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
