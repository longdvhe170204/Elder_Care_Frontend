import { hhmm } from './doseRoundView'

// Nhãn của một liều: nguồn thuốc, thuốc kiểm soát đặc biệt (phải trực tuyến, FR-029), liều chung của tầng (FR-026a),
// mức Quan trọng về thời gian, dấu Hoãn có chủ đích, người đang nhận liều (BR-M07-26, 27). Không dùng đỏ: đây là thông
// tin, không phải việc gấp.
const tag = 'inline-flex h-6 items-center rounded-full px-2.5 type-caption'

export function DoseTags({ dose }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={`${tag} bg-muted text-muted-foreground`}>{dose.source === 'Viện' ? 'Thuốc viện' : 'Gia đình gửi'}</span>
      {dose.critical && <span className={`${tag} bg-warning text-warning-foreground`}>Quan trọng về thời gian</span>}
      {dose.postponed && <span className={`${tag} bg-info text-info-foreground`}>Đã hoãn có chủ đích</span>}
      {dose.claimedBy && dose.claimExpiresAt && (
        <span className={`${tag} bg-info text-info-foreground`}>Đã có người nhận liều đến {hhmm(dose.claimExpiresAt)}</span>
      )}
      {dose.controlled && <span className={`${tag} bg-accent text-accent-foreground`}>Kiểm soát đặc biệt, phải trực tuyến</span>}
      {dose.sharedFloor && <span className={`${tag} bg-info text-info-foreground`}>Liều chung của tầng</span>}
    </span>
  )
}
