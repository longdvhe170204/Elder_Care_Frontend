import { useEffect, useState } from 'react'
import { getIncidentsByIdEmergencyCard } from '@/api'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/common/dateTime'

// Thẻ thông tin khẩn cấp của sự cố Khẩn cấp đang mở (007 FR-047a, FR-048): nhận dạng, dị ứng, thuốc đang dùng, bệnh nền,
// người liên hệ chính. Người không có quyền xem sức khỏe chỉ nhận phần nhận dạng; không tải được thì ẩn khối này.

function itemText(item) {
  const named = item.name ?? item.substanceName ?? item.medicationName ?? item.title ?? item.description
  if (named) return String(named)
  return Object.values(item)
    .filter((v) => typeof v === 'string' && v)
    .join(', ')
}

function List({ label, items }) {
  if (!items) return null
  return (
    <div className="flex flex-col">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-body-sm">{items.length === 0 ? 'Chưa ghi nhận' : items.map(itemText).join('; ')}</dd>
    </div>
  )
}

export function EmergencyCardPanel({ incidentId }) {
  const [card, setCard] = useState(undefined)
  useEffect(() => {
    let live = true
    getIncidentsByIdEmergencyCard({ path: { id: incidentId } }).then(
      ({ data }) => live && setCard(data),
      () => live && setCard(null),
    )
    return () => {
      live = false
    }
  }, [incidentId])

  if (card === undefined) return <Skeleton className="h-24 w-full" />
  if (card === null) return null
  const who = card.identification
  return (
    <section
      aria-label="Thẻ thông tin khẩn cấp"
      className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3"
    >
      <h3 className="type-card-title text-destructive">Thông tin khẩn cấp</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        {who && (
          <div className="flex flex-col">
            <dt className="type-caption text-muted-foreground">Người cao tuổi</dt>
            <dd className="type-body-sm">
              {[
                who.fullName,
                who.dateOfBirth && formatDate(who.dateOfBirth),
                who.roomBed && `phòng/giường ${who.roomBed}`,
              ]
                .filter(Boolean)
                .join(', ')}
            </dd>
          </div>
        )}
        <List label="Dị ứng" items={card.allergies} />
        <List label="Thuốc đang dùng" items={card.currentMedications} />
        <List label="Bệnh nền" items={card.chronicConditions} />
        {card.careNotes && (
          <div className="flex flex-col">
            <dt className="type-caption text-muted-foreground">Lưu ý chăm sóc</dt>
            <dd className="type-body-sm">{card.careNotes}</dd>
          </div>
        )}
        {card.primaryContact && (
          <div className="flex flex-col">
            <dt className="type-caption text-muted-foreground">Người liên hệ chính</dt>
            <dd className="type-body-sm">
              {[card.primaryContact.fullName, card.primaryContact.phoneNumber].filter(Boolean).join(', ')}
            </dd>
          </div>
        )}
      </dl>
      {card.unavailable?.length > 0 && (
        <p className="type-caption text-muted-foreground">Chưa có dữ liệu: {card.unavailable.join(', ')}</p>
      )}
    </section>
  )
}
