import { useEffect, useState } from 'react'
import { getIncidentsByIdEmergencyCard } from '@/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { CHOICE_LABELS, SIGNER_LABELS } from '@/features/wishes/wishLabels'
import { runIncidentCommand } from './incidents'

// Thẻ thông tin khẩn cấp của sự cố Khẩn cấp đang mở (007 FR-047a, FR-048): nhận dạng, dị ứng, thuốc đang dùng, bệnh nền,
// người liên hệ chính, nguyện vọng cuối đời Hiệu lực (hoặc "chưa có"). Người xem đủ thẻ bấm "Xác nhận đã đối chiếu nguyện
// vọng" (FR-048a, BR-M05-13; mỗi sự cố một lần, trước khi ghi biện pháp hồi sức). Người không có quyền xem sức khỏe chỉ
// nhận phần nhận dạng; không tải được thì ẩn khối này. children (Gọi 115) nằm cùng thẻ, luôn hiện kể cả khi không có thẻ.

function itemText(item) {
  const named = item.name ?? item.substanceName ?? item.medicationName ?? item.title ?? item.description
  if (named) return String(named)
  return Object.values(item)
    .filter((v) => typeof v === 'string' && v)
    .join(', ')
}

// Mục trống không chiếm ô (góp ý demo 2026-11-24): gom vào một dòng "Chưa ghi nhận: …" ở cuối thẻ
function List({ label, items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-col">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-body-sm">{items.map(itemText).join('; ')}</dd>
    </div>
  )
}

export function EmergencyCardPanel({ incidentId, children = null }) {
  const [card, setCard] = useState(undefined)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
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

  async function confirmWish() {
    setBusy(true)
    setProblem(null)
    try {
      await runIncidentCommand(incidentId, 'confirm-wish-check')
      setChecked(true)
    } catch (error) {
      // Đã có xác nhận từ trước (409) thì cũng là trạng thái "đã xác nhận", không phải lỗi của người dùng
      if (error?.problem?.errorCode === 'WISH_ALREADY_CHECKED') setChecked(true)
      else setProblem(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  if (!card) {
    return (
      <>
        {card === undefined && <Skeleton className="h-24 w-full" />}
        {children}
      </>
    )
  }
  const who = card.identification
  const wish = card.endOfLifeWish
  const hasWish = wish && !wish.notRecorded
  return (
    <section
      aria-label="Thẻ thông tin khẩn cấp"
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-card p-4"
    >
      <h2 className="type-title text-destructive">Thông tin khẩn cấp</h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {who && (
          <div className="flex flex-col">
            <dt className="type-caption text-muted-foreground">Người cao tuổi</dt>
            <dd className="type-body-sm">
              {[who.fullName, who.dateOfBirth && formatDate(who.dateOfBirth), who.roomBed].filter(Boolean).join(', ')}
            </dd>
          </div>
        )}
        {wish && (
          <div className="flex flex-col">
            <dt className="type-caption text-muted-foreground">Nguyện vọng cuối đời</dt>
            <dd className="type-body-sm">
              {hasWish ? (
                <>
                  <span className="type-label">{CHOICE_LABELS[wish.choice] ?? wish.choice}</span>
                  {wish.signerType && <span>, ký bởi {SIGNER_LABELS[wish.signerType] ?? wish.signerType}</span>}
                  {wish.note && <span>. {wish.note}</span>}
                </>
              ) : (
                'Chưa có nguyện vọng cuối đời'
              )}
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
              {card.primaryContact.fullName}
              {card.primaryContact.phoneNumber && (
                <>
                  {', '}
                  <a className="type-label text-primary underline" href={`tel:${card.primaryContact.phoneNumber}`}>
                    {card.primaryContact.phoneNumber}
                  </a>
                </>
              )}
            </dd>
          </div>
        )}
      </dl>
      {hasWish &&
        (checked ? (
          <p role="status" className="type-body-sm">
            Đã xác nhận đối chiếu nguyện vọng
          </p>
        ) : (
          <Button variant="outline" className="h-11 self-start" disabled={busy} onClick={confirmWish}>
            Xác nhận đã đối chiếu nguyện vọng
          </Button>
        ))}
      {problem && <ProblemAlert problem={problem} />}
      {[
        ['dị ứng', card.allergies],
        ['thuốc đang dùng', card.currentMedications],
        ['bệnh nền', card.chronicConditions],
      ].some(([, items]) => items && items.length === 0) && (
        <p className="type-caption text-muted-foreground">
          Chưa ghi nhận:{' '}
          {[
            ['dị ứng', card.allergies],
            ['thuốc đang dùng', card.currentMedications],
            ['bệnh nền', card.chronicConditions],
          ]
            .filter(([, items]) => items && items.length === 0)
            .map(([label]) => label)
            .join(', ')}
          .
        </p>
      )}
      {card.unavailable?.length > 0 && (
        <p className="type-caption text-muted-foreground">Chưa có dữ liệu: {card.unavailable.join(', ')}</p>
      )}
      {children}
    </section>
  )
}
