import { useCallback, useEffect, useState } from 'react'
import {
  getFamilyPortalResidentsByResidentIdFamilyMembers,
  getRightChangeRequests,
  postRightChangeRequests,
} from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { StatusBadge } from '@/common/StatusBadge'
import { problemOf } from '@/common/problem'
import {
  CONFLICT_HINTS,
  RELATIONSHIP_LABELS,
  RIGHT_LABELS,
  RIGHT_ORDER,
  enabledRightsText,
} from '@/features/relatives/relationshipLabels'
import { PortalCard } from '../PortalParts'

// Gia đình và quyền của cổng người thân (test BF-12 2026-11-24; 012 FR-013, FR-014, FR-015 (a), FR-017, FR-020b,
// FR-050; chủ dự án chọn phương án A). Người đại diện thấy mọi người thân Hiệu lực, đề nghị đổi một quyền, thêm người
// được phép đón; yêu cầu người đại diện lập qua cổng có hiệu lực ngay, trừ khi trái mong muốn của người cao tuổi (chờ
// Quản lý viện duyệt). Người thân khác chỉ thấy mình và chỉ tắt được quyền của mình. Đặt, thôi người đại diện và dấu
// "được tự về" vẫn lập tại quầy (cần tệp bằng chứng). "Được yêu cầu thay đổi dịch vụ" tự theo vai trò (FR-010).

const SELECT = 'h-11 w-full rounded-md border border-input bg-transparent px-3'
const EMPTY_PICKER = { fullName: '', relationship: '', phoneNumber: '', idDocumentType: '', idDocumentNumber: '' }
const PICKER_FIELDS = [
  ['fullName', 'Họ tên', 'Nhập họ tên'],
  ['phoneNumber', 'Số điện thoại', 'Nhập số điện thoại'],
  ['idDocumentType', 'Loại giấy tờ', 'Nhập loại giấy tờ'],
  ['idDocumentNumber', 'Số giấy tờ', 'Nhập số giấy tờ'],
]

// Quyền người xem được đề nghị đổi cho một người: người đại diện bật, tắt được; người khác chỉ tắt quyền đang bật của mình
function choices(member, representative) {
  return RIGHT_ORDER.filter((right) => right !== 'REQUEST_SERVICES')
    .filter((right) => !(right === 'RECEIVE_URGENT' && member.primaryContact))
    .map((right) => ({ right, enabled: !!member.rights?.[right]?.enabled }))
    .filter((c) => representative || c.enabled)
}

function describePending(request) {
  return `${request.newValue ? 'Bật' : 'Tắt'} quyền ${RIGHT_LABELS[request.right] ?? request.right}`
}

function resultMessage(created) {
  if (created?.status === 'EFFECTIVE') return 'Đã gửi. Yêu cầu có hiệu lực ngay.'
  if (created?.conflictingWishId) return 'Đã gửi. Yêu cầu trái mong muốn của người cao tuổi nên chờ Quản lý viện duyệt.'
  return 'Đã gửi. Yêu cầu chờ người đại diện xác nhận.'
}

function RequestSheet({ open, residentId, member, representative, onClose, onDone }) {
  const [right, setRight] = useState('')
  const [picker, setPicker] = useState(EMPTY_PICKER)
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState(null)
  const [busy, setBusy] = useState(false)
  const [key] = useState(() => crypto.randomUUID())
  const newPicker = !member
  const options = member ? choices(member, representative) : []
  const chosen = options.find((c) => c.right === right)
  const errors = {
    right: !newPicker && !chosen,
    picker: newPicker && Object.values(picker).some((v) => !v.trim()),
    reason: !reason.trim(),
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    setFailure(null)
    if (Object.values(errors).some(Boolean)) return
    const body = newPicker
      ? {
          residentId,
          type: 'RIGHT',
          right: 'PICKUP_ALLOWED',
          newValue: true,
          newPicker: Object.fromEntries(Object.entries(picker).map(([k, v]) => [k, v.trim()])),
          reason: reason.trim(),
        }
      : {
          residentId,
          type: 'RIGHT',
          relationshipId: member.relationshipId,
          right,
          newValue: !chosen.enabled,
          reason: reason.trim(),
        }
    setBusy(true)
    try {
      const { data } = await postRightChangeRequests({ headers: { 'Idempotency-Key': key }, body })
      onDone(resultMessage(data))
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }

  const title = newPicker ? 'Thêm người được phép đón' : `Đề nghị đổi quyền cho ${member.fullName}`
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <form noValidate onSubmit={submit} className="flex flex-col gap-4 p-4">
          <SheetTitle className="type-title">{title}</SheetTitle>
          <SheetDescription>
            {representative
              ? 'Đề nghị của người đại diện có hiệu lực ngay, trừ khi trái mong muốn của người cao tuổi.'
              : 'Bạn chỉ tắt được quyền của chính mình. Tắt "Được phép đón" có hiệu lực ngay.'}
          </SheetDescription>
          <FieldGroup>
            {newPicker ? (
              <>
                {PICKER_FIELDS.map(([name, label, error]) => {
                  const invalid = submitted && !picker[name].trim()
                  return (
                    <Field key={name} data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor={`picker-${name}`}>{label}</FieldLabel>
                      <Input
                        id={`picker-${name}`}
                        className="h-11"
                        value={picker[name]}
                        onChange={(e) => setPicker({ ...picker, [name]: e.target.value })}
                        aria-invalid={invalid || undefined}
                      />
                      {invalid && <FieldError>{error}</FieldError>}
                    </Field>
                  )
                })}
                <Field data-invalid={(submitted && !picker.relationship) || undefined}>
                  <FieldLabel htmlFor="picker-relationship">Quan hệ với người cao tuổi</FieldLabel>
                  <select
                    id="picker-relationship"
                    value={picker.relationship}
                    onChange={(e) => setPicker({ ...picker, relationship: e.target.value })}
                    aria-invalid={(submitted && !picker.relationship) || undefined}
                    className={SELECT}
                  >
                    <option value="">Chọn quan hệ</option>
                    {Object.entries(RELATIONSHIP_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {submitted && !picker.relationship && <FieldError>Chọn quan hệ</FieldError>}
                </Field>
              </>
            ) : (
              <Field data-invalid={(submitted && errors.right) || undefined}>
                <FieldLabel>Quyền muốn đổi</FieldLabel>
                <ToggleGroup
                  variant="outline"
                  value={right ? [right] : []}
                  onValueChange={(next) => setRight(next[0] ?? '')}
                  aria-label="Quyền muốn đổi"
                  className="flex flex-col items-stretch"
                >
                  {options.map((c) => (
                    <ToggleGroupItem key={c.right} value={c.right} className="h-11 justify-start px-4">
                      {`${c.enabled ? 'Tắt' : 'Bật'} ${RIGHT_LABELS[c.right]}`}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {submitted && errors.right && <FieldError>Chọn quyền muốn đổi</FieldError>}
              </Field>
            )}
            <Field data-invalid={(submitted && errors.reason) || undefined}>
              <FieldLabel htmlFor="request-reason">Lý do</FieldLabel>
              <Textarea
                id="request-reason"
                rows={3}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={(submitted && errors.reason) || undefined}
              />
              {submitted && errors.reason && <FieldError>Nhập lý do</FieldError>}
            </Field>
          </FieldGroup>
          <ProblemAlert problem={failure} title="Chưa gửi được đề nghị">
            {failure && CONFLICT_HINTS[failure.errorCode] && <p>{CONFLICT_HINTS[failure.errorCode]}</p>}
          </ProblemAlert>
          <Button type="submit" className="h-11" disabled={busy}>
            Gửi đề nghị
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function MemberCard({ member, pending, onRequest }) {
  const name = member.self ? `${member.fullName} (bạn)` : member.fullName
  const roles = [member.representative && 'Người đại diện', member.primaryContact && 'Người liên hệ chính'].filter(
    Boolean,
  )
  return (
    <section aria-label={name}>
      <PortalCard title={name}>
        <span className="text-muted-foreground">
          {[RELATIONSHIP_LABELS[member.relationship] ?? member.relationship, ...roles].join(', ')}
        </span>
        <span>{`Đang bật: ${enabledRightsText(member)}`}</span>
        {pending.length > 0 && (
          <ul className="flex flex-col gap-1">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status="Chờ xác nhận" />
                <span>{describePending(p)}</span>
              </li>
            ))}
          </ul>
        )}
        {onRequest && (
          <Button variant="outline" className="self-start" onClick={onRequest}>
            Đề nghị đổi quyền
          </Button>
        )}
      </PortalCard>
    </section>
  )
}

export function FamilyRightsPage({ viewer }) {
  const residentId = viewer.residentId
  const representative = !!viewer.representative
  const [members, setMembers] = useState(null)
  const [pending, setPending] = useState([])
  const [failure, setFailure] = useState(null)
  const [opened, setOpened] = useState(null)
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    getFamilyPortalResidentsByResidentIdFamilyMembers({ path: { residentId } })
      .then(({ data }) => {
        setFailure(null)
        setMembers(data)
      })
      .catch((e) => setFailure(problemOf(e)))
    getRightChangeRequests({ query: { residentId, status: 'PENDING_CONFIRMATION' } })
      .then(({ data }) => setPending(data ?? []))
      .catch(() => setPending([]))
  }, [residentId])

  useEffect(() => {
    load()
  }, [load])

  // Người thân thường chỉ có thẻ của mình và chỉ mở được form khi còn quyền để tắt
  const canRequest = (member) => representative || (member.self && choices(member, false).length > 0)

  return (
    <>
      <PageHeader
        title="Gia đình và quyền"
        subtitle={
          representative
            ? `${viewer.residentName}. Đề nghị bạn lập có hiệu lực ngay, trừ khi trái mong muốn của người cao tuổi.`
            : `${viewer.residentName}. Bạn chỉ tắt được quyền của chính mình; muốn bật quyền, liên hệ người đại diện.`
        }
      />
      <ProblemAlert problem={failure} title="Chưa tải được danh sách người thân" />
      {message && (
        <p role="status" className="type-body-sm">
          {message}
        </p>
      )}
      {!members && !failure && <Skeleton className="h-32 w-full" />}
      {members?.map((member) => (
        <MemberCard
          key={member.relationshipId}
          member={member}
          pending={pending.filter((p) => p.relationshipId === member.relationshipId)}
          onRequest={canRequest(member) ? () => setOpened({ member }) : null}
        />
      ))}
      {representative && members && (
        <Button className="h-11 self-start" onClick={() => setOpened({ member: null })}>
          Thêm người được phép đón
        </Button>
      )}
      {opened && (
        <RequestSheet
          open
          residentId={residentId}
          member={opened.member}
          representative={representative}
          onClose={() => setOpened(null)}
          onDone={(text) => {
            setOpened(null)
            setMessage(text)
            load()
          }}
        />
      )}
    </>
  )
}
