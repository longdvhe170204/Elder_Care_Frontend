import { useEffect, useState } from 'react'
import { getResidentsByResidentIdBelongings } from '@/api'
import { Button } from '@/components/ui/button'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { openFile } from '@/common/files'
import { problemOf } from '@/common/problem'
import { CHANNEL_OPTIONS, amountText, statusLabel } from './belongingLabels'
import { memberName, useFamilyContacts } from './useFamilyContacts'

// Nội dung đề nghị "Xử lý đồ không người nhận" (013 FR-027a; loại M12.UNCLAIMED_BELONGING_DISPOSAL) trên màn Yêu cầu phê
// duyệt, để Quản lý viện đọc được trước khi duyệt: cách xử lý, đơn vị nhận, đồ, các lần liên hệ, biên bản, ảnh (hoàn thiện
// BF-14, 2026-11-23; trước hiện tên trường và JSON thô). Cùng cách với ChangeContent của 004.

const DISPOSAL_METHOD_LABELS = {
  SELL: 'Bán',
  DESTROY: 'Tiêu hủy',
  TRANSFER_TO_AUTHORITY: 'Chuyển cơ quan có thẩm quyền',
}

export function DisposalContent({ content, headingClassName = 'type-caption text-muted-foreground' }) {
  const residentId = content.residentId
  const contacts = useFamilyContacts(residentId)
  const [items, setItems] = useState([])
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    let alive = true
    getResidentsByResidentIdBelongings({ path: { residentId } }).then(
      ({ data }) => alive && setItems((data ?? []).filter((b) => (content.belongingIds ?? []).includes(b.id))),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [residentId, content.belongingIds])

  const open = (id) =>
    openFile(id).then(
      () => setFailure(null),
      (e) => setFailure(problemOf(e)),
    )
  const channel = (value) => CHANNEL_OPTIONS.find((o) => o.value === value)?.label ?? value

  return (
    <section className="flex flex-col gap-3">
      <h3 className={headingClassName}>Nội dung đề nghị</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Cách xử lý</dt>
        <dd>{DISPOSAL_METHOD_LABELS[content.method] ?? content.method}</dd>
        {content.receivingUnit && (
          <>
            <dt className="text-muted-foreground">Đơn vị nhận</dt>
            <dd>{content.receivingUnit}</dd>
          </>
        )}
      </dl>
      <div className="flex flex-col gap-1">
        <h4 className="type-label">Đồ đề nghị xử lý</h4>
        <ul className="flex flex-col gap-1">
          {(content.belongingIds ?? []).map((id) => {
            const b = items.find((x) => x.id === id)
            return (
              <li key={id}>
                {b
                  ? [b.description, amountText(b), b.status && statusLabel(b.status)].filter(Boolean).join(', ')
                  : `Đồ #${id}`}
              </li>
            )
          })}
        </ul>
      </div>
      {content.contactAttempts?.length > 0 && (
        <div className="flex flex-col gap-1">
          <h4 className="type-label">Các lần liên hệ người thân</h4>
          <ul className="flex flex-col gap-1">
            {content.contactAttempts.map((a, i) => (
              <li key={i}>
                {formatDateTime(a.at)}, {channel(a.channel)}, {memberName(contacts.members, a.familyMemberId)}:{' '}
                {a.result}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {content.minutesFileId && (
          <Button type="button" variant="outline" size="sm" onClick={() => open(content.minutesFileId)}>
            Mở biên bản
          </Button>
        )}
        {(content.photoFileIds ?? []).map((id, index) => (
          <Button key={id} type="button" variant="outline" size="sm" onClick={() => open(id)}>
            Xem ảnh {index + 1}
          </Button>
        ))}
      </div>
      <ProblemAlert problem={failure} />
    </section>
  )
}
