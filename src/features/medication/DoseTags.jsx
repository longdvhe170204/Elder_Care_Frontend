// Nhãn của một liều: nguồn thuốc, thuốc kiểm soát đặc biệt (phải trực tuyến, FR-029),
// mức Quan trọng về thời gian, dấu Hoãn có chủ đích (BR-M07-26, 27). Không dùng đỏ: đây là thông
// tin, không phải việc gấp.
const tag = 'inline-flex h-6 items-center rounded-full px-2.5 type-caption'

export function DoseTags({ dose }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={`${tag} bg-muted text-muted-foreground`}>{dose.source === 'Viện' ? 'Thuốc viện' : 'Gia đình gửi'}</span>
      {dose.source !== 'Viện' && (!dose.lots || dose.lots.length === 0) && (
        <span className={`${tag} bg-amber-100 text-amber-800`}>Chưa có lô Được sử dụng</span>
      )}
      {dose.critical && <span className={`${tag} bg-warning text-warning-foreground`}>Quan trọng về thời gian</span>}
      {dose.postponed && <span className={`${tag} bg-info text-info-foreground`}>Đã hoãn có chủ đích</span>}
      {dose.controlled && <span className={`${tag} bg-accent text-accent-foreground`}>Kiểm soát đặc biệt, phải trực tuyến</span>}
    </span>
  )
}
