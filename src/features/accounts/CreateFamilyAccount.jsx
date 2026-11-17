import { useState } from 'react'
import { ApiError, getFamilyMembers, postFamilyAccounts } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { TemporaryPasswordNotice } from './TemporaryPasswordNotice'

// Tạo tài khoản người thân (002 US6; FR-050 → FR-052; hợp đồng POST /family-accounts; chủ dự án yêu cầu 2026-11-17).
// Hành chính, Quản lý viện tìm hồ sơ người thân (GET /family-members của 012), xác minh danh tính theo FR-052 rồi tạo;
// tài khoản chỉ có vai trò Người thân. Backend kiểm quan hệ còn hiệu lực (RELATIONSHIP_ENDED) và xác minh
// (INVALID_VERIFICATION). Mật khẩu tạm hiện một lần. Idempotency-Key giữ suốt form.

const METHODS = [
  ['IN_PERSON_ID_DOCUMENT', 'Có mặt, đối chiếu giấy tờ tùy thân'],
  ['CALLBACK_REGISTERED_NUMBER', 'Gọi lại số đã đăng ký'],
]

export function CreateFamilyAccount({ onCreated, onClose }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [memberId, setMemberId] = useState('')
  const [username, setUsername] = useState('')
  const [method, setMethod] = useState('')
  const [proof, setProof] = useState('')
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const [key] = useState(() => crypto.randomUUID())

  async function search() {
    setFailure(null)
    try {
      const { data } = await getFamilyMembers({ query: { q: query.trim() } })
      setFound(data)
    } catch (error) {
      setFound([])
      setFailure(problemOf(error))
    }
  }

  async function submit(event) {
    event.preventDefault()
    setFailure(null)
    const next = {}
    if (!memberId) next.member = 'Chọn một hồ sơ người thân'
    if (!username.trim()) next.username = 'Nhập tên đăng nhập'
    if (!method) next.method = 'Chọn cách xác minh danh tính'
    else if (!proof.trim())
      next.proof = method === 'IN_PERSON_ID_DOCUMENT' ? 'Nhập số giấy tờ đã đối chiếu' : 'Nhập số đã gọi lại'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      const verification =
        method === 'IN_PERSON_ID_DOCUMENT'
          ? { method, idDocumentNumber: proof.trim() }
          : { method, calledPhoneNumber: proof.trim() }
      const { data } = await postFamilyAccounts({
        headers: { 'Idempotency-Key': key },
        body: { familyMemberId: Number(memberId), username: username.trim(), verification },
      })
      setCreated(data)
      onCreated(data)
    } catch (error) {
      const p = problemOf(error)
      if (error instanceof ApiError && error.status === 422) setErrors({ username: p.detail || p.title })
      else setFailure(p)
    } finally {
      setSaving(false)
    }
  }

  const member = (found ?? []).find((m) => String(m.id) === memberId)

  return (
    <>
      <SheetHeader className="gap-1 pt-6">
        <SheetTitle className="type-title">Tạo tài khoản người thân</SheetTitle>
        <SheetDescription>
          Người thân phải còn quan hệ với người cao tuổi; xác minh danh tính trước khi tạo.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6">
        {created ? (
          <div className="flex flex-col gap-3">
            <p className="type-body-sm">
              Đã tạo tài khoản {created.username}
              {member ? ` cho ${member.fullName}` : ''}. Người thân đăng nhập cổng người thân và đổi mật khẩu ở lần đầu.
            </p>
            {created.temporaryPassword && <TemporaryPasswordNotice password={created.temporaryPassword} />}
            <Button variant="outline" className="self-start" onClick={onClose}>
              Xong
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={!!errors.member || undefined}>
                <FieldLabel htmlFor="create-family-account-query">Tìm người thân</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="create-family-account-query"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        search()
                      }
                    }}
                    className="h-10"
                  />
                  <Button type="button" variant="outline" className="h-10" onClick={search}>
                    Tìm
                  </Button>
                </div>
                {errors.member ? (
                  <FieldError>{errors.member}</FieldError>
                ) : (
                  <FieldDescription>Họ tên, số điện thoại hoặc số giấy tờ trong hồ sơ người thân.</FieldDescription>
                )}
              </Field>
              {found && (
                <FieldSet>
                  <FieldLegend variant="label">Hồ sơ người thân</FieldLegend>
                  {found.length === 0 ? (
                    <p className="type-body-sm text-muted-foreground">Không có hồ sơ khớp.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {found.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 type-body-sm">
                          <input
                            type="radio"
                            name="create-family-account-member"
                            value={m.id}
                            checked={memberId === String(m.id)}
                            onChange={() => setMemberId(String(m.id))}
                            className="size-4"
                          />
                          <span>
                            {m.fullName}
                            {m.phoneNumber ? ` · ${m.phoneNumber}` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </FieldSet>
              )}
              <Field data-invalid={!!errors.username || undefined}>
                <FieldLabel htmlFor="create-family-account-username">Tên đăng nhập</FieldLabel>
                <Input
                  id="create-family-account-username"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  aria-invalid={!!errors.username || undefined}
                  className="h-10"
                />
                {errors.username && <FieldError>{errors.username}</FieldError>}
              </Field>
              <FieldSet data-invalid={!!errors.method || undefined}>
                <FieldLegend variant="label">Xác minh danh tính</FieldLegend>
                <div className="flex flex-col gap-2">
                  {METHODS.map(([code, label]) => (
                    <label key={code} className="flex items-center gap-2 type-body-sm">
                      <input
                        type="radio"
                        name="create-family-account-method"
                        value={code}
                        checked={method === code}
                        onChange={() => {
                          setMethod(code)
                          setProof('')
                        }}
                        className="size-4"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {errors.method && <FieldError>{errors.method}</FieldError>}
              </FieldSet>
              {method && (
                <Field data-invalid={!!errors.proof || undefined}>
                  <FieldLabel htmlFor="create-family-account-proof">
                    {method === 'IN_PERSON_ID_DOCUMENT' ? 'Số giấy tờ đã đối chiếu' : 'Số đã gọi lại'}
                  </FieldLabel>
                  <Input
                    id="create-family-account-proof"
                    autoComplete="off"
                    inputMode={method === 'CALLBACK_REGISTERED_NUMBER' ? 'tel' : undefined}
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    aria-invalid={!!errors.proof || undefined}
                    className="h-10"
                  />
                  {errors.proof ? (
                    <FieldError>{errors.proof}</FieldError>
                  ) : (
                    <FieldDescription>
                      {method === 'IN_PERSON_ID_DOCUMENT'
                        ? 'Đối chiếu giấy tờ người thân mang đến với hồ sơ người thân.'
                        : 'Phải trùng số điện thoại đã đăng ký trong hồ sơ người thân.'}
                    </FieldDescription>
                  )}
                </Field>
              )}
            </FieldGroup>

            <ProblemAlert problem={failure} />

            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="h-11" disabled={saving}>
                Tạo tài khoản
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={onClose}>
                Hủy
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
