import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getResidents, postResidents } from '@/api'
import { CircleAlert, CircleCheck, Info, LoaderCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ProblemAlert } from '@/common/ProblemAlert'
import { SearchSelect } from '@/common/SearchSelect'
import { problemOf } from '@/common/problem'
import { GENDER_LABELS, STATUS_LABELS } from './residentLabels'
import { VN_PHONE, normalizePhone } from './vnPhone'
import { displayDate, isoDate, maskDate } from '@/common/dateText'

// Tạo hồ sơ người cao tuổi (001 T022; US1 #1 → #4, #10; FR-001 → FR-004; hợp đồng POST /residents), nằm trong khung
// `admission-start` (NewAdmissionSheet). Idempotency-Key giữ suốt lần nhập để bấm lại không tạo hai hồ sơ.
// CCCD bắt buộc và nhập trước (chủ dự án chốt khi test BF-01 2026-11-26): tra hồ sơ mang CCCD đó (GET /residents?q=, khớp
// đủ số giấy tờ) để thấy trước người này đang có hồ sơ mở (không tạo được, DBR-01), có hồ sơ cũ Kết thúc lưu trú, Hủy
// tiếp nhận (hồ sơ mới sẽ liên kết, FR-004) hay hồ sơ gần nhất Qua đời (không liên kết). Backend vẫn kiểm khi tạo.
// Bố cục (yêu cầu 2026-11-26): đầu, chân khung cố định, chỉ phần form cuộn; bốn nhóm Định danh, Cơ bản, Liên hệ, Ghi
// chú. Địa chỉ thường trú ba ô Tỉnh/Thành phố, Phường/Xã, Địa chỉ chi tiết, ghép thành một chuỗi gửi vào
// permanentAddress; không có ô Địa chỉ liên hệ. onDirtyChange báo khung cha để hỏi lại khi đóng mà chưa lưu.

const FINAL = ['RESIDENCY_ENDED', 'ADMISSION_CANCELLED', 'DECEASED']
const FORM_ID = 'create-resident-form'

// Số định danh cá nhân trên CCCD: 12 chữ số
const CITIZEN_ID = /^\d{12}$/
// Họ tên: chữ (có dấu), khoảng trắng, dấu nháy, dấu chấm, gạch nối; so sau khi chuẩn hóa NFC để chữ gõ kiểu tổ hợp
// (Unikey "Unicode tổ hợp") vẫn hợp lệ
const NAME = /^\p{L}[\p{L}\s.'-]*$/u
const MAX_ADDRESS = 500

const EMPTY = {
  idDocumentNumber: '',
  fullName: '',
  dateOfBirth: '',
  gender: '',
  provinceCode: '',
  wardCode: '',
  address: '',
  phoneNumber: '',
  specialNotes: '',
}

function blank(value) {
  const text = value.trim()
  return text === '' ? undefined : text
}

const cleanName = (value) => value.normalize('NFC').trim().replace(/\s+/g, ' ')
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })

// Danh mục 34 tỉnh, 3.321 xã/phường (Quyết định 19/2025/QĐ-TTg, áp dụng từ 01/7/2025), rút gọn từ
// github.com/ThangLeQuoc/vietnamese-provinces-database (MIT, tải 2026-11-26) vào src/common/administrativeUnits.json:
// [{ code, name, wards: [[code, name]] }]. Tải khi mở form (import động); chưa tải xong thì danh sách rỗng
// Lọc theo tên riêng, bỏ tiền tố cấp hành chính: gõ "ha" không khớp mọi "Thành phố", "Phường"
const withoutUnitPrefix = (name) => name.replace(/^(Thành phố|Tỉnh|Phường|Xã|Đặc khu)\s+/i, '')

function useAdministrativeUnits() {
  const [units, setUnits] = useState([])
  useEffect(() => {
    let live = true
    import('@/common/administrativeUnits.json').then(({ default: data }) => live && setUnits(data))
    return () => {
      live = false
    }
  }, [])
  return units
}

function citizenIdError(number) {
  if (!number) return 'Nhập số căn cước'
  if (!CITIZEN_ID.test(number)) return 'Số căn cước gồm đúng 12 chữ số'
  return null
}

function Required() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

export function CreateResident({ onCreated, onClose, onOpenProfile, onDirtyChange }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const [key] = useState(() => crypto.randomUUID())
  // Kết quả tra: null chưa tra; { number, open, latestClosed } khi đã tra; { number, failed } khi lỗi
  const [lookup, setLookup] = useState(null)
  const [looking, setLooking] = useState(false)
  const formRef = useRef(null)
  const units = useAdministrativeUnits()
  const province = units.find((p) => p.code === form.provinceCode) ?? null
  const ward = province?.wards.find(([code]) => code === form.wardCode) ?? null
  const provinceOptions = useMemo(
    () => units.map((p) => ({ value: p.code, label: p.name, search: withoutUnitPrefix(p.name) })),
    [units],
  )
  const wardOptions = useMemo(
    () =>
      (province?.wards ?? []).map(([code, name]) => ({ value: code, label: name, search: withoutUnitPrefix(name) })),
    [province],
  )

  const dirty = !created && Object.values(form).some((v) => v.trim() !== '')
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])

  const set = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.value }))

  const number = form.idDocumentNumber
  const lookedUp = lookup?.number === number && !lookup.failed
  // Các nhóm sau mở khi đã tra căn cước và không có hồ sơ đang mở
  const documentDone = lookedUp && !lookup.open

  function changeDocumentNumber(event) {
    // Chỉ giữ chữ số: dán "001 045 009 876" vẫn đủ 12 số
    const digits = event.target.value.replace(/\D/g, '').slice(0, 12)
    setForm((current) => ({ ...current, idDocumentNumber: digits }))
    setErrors((current) => ({ ...current, idDocumentNumber: undefined }))
  }

  async function checkCitizenId() {
    const error = citizenIdError(number)
    setErrors((current) => ({ ...current, idDocumentNumber: error ?? undefined }))
    if (error) return
    setLooking(true)
    try {
      const { data } = await getResidents({ query: { q: number } })
      const same = (data?.items ?? []).filter(
        (p) => p.personalInfo?.idDocumentType === 'CITIZEN_ID' && p.personalInfo?.idDocumentNumber === number,
      )
      // Danh sách xếp mới nhất trước (ResidentLookup.search); backend liên kết với hồ sơ cuối gần nhất nếu không Qua đời
      setLookup({
        number,
        open: same.find((p) => !FINAL.includes(p.status)) ?? null,
        latestClosed: same.find((p) => FINAL.includes(p.status)) ?? null,
      })
    } catch {
      setLookup({ number, failed: true })
    } finally {
      setLooking(false)
    }
  }

  // Chỉ điền ô còn trống, không ghi đè phần đã gõ
  function fillFromPrevious() {
    const info = lookup.latestClosed.personalInfo ?? {}
    const previous = {
      fullName: info.fullName ?? '',
      dateOfBirth: displayDate(info.dateOfBirth),
      gender: info.gender ?? '',
      address: info.permanentAddress ?? '',
      phoneNumber: info.contact?.phoneNumber ?? '',
    }
    setForm((current) => {
      const next = { ...current }
      for (const [name, value] of Object.entries(previous)) if (!current[name].trim()) next[name] = value
      return next
    })
  }

  // "Số nhà, đường…, Phường/Xã, Tỉnh/Thành phố" trong một chuỗi (hợp đồng chỉ có permanentAddress)
  const permanentAddress = () => [form.address.trim(), ward?.[1], province?.name].filter(Boolean).join(', ')

  function validate() {
    const next = {}
    const docError = citizenIdError(number)
    if (docError) next.idDocumentNumber = docError
    else if (!lookedUp) next.idDocumentNumber = 'Bấm "Tra hồ sơ" để kiểm tra số căn cước trước'
    else if (lookup.open) next.idDocumentNumber = `Số căn cước đang dùng ở hồ sơ ${lookup.open.profileCode}`
    // Các nhóm sau còn khóa thì chỉ báo lỗi ô căn cước
    if (next.idDocumentNumber) return next
    const name = cleanName(form.fullName)
    if (!name) next.fullName = 'Nhập họ và tên'
    else if (name.length > 200) next.fullName = 'Họ và tên tối đa 200 ký tự'
    else if (!NAME.test(name)) next.fullName = 'Họ và tên chỉ gồm chữ cái và khoảng trắng'
    const dob = isoDate(form.dateOfBirth)
    if (!form.dateOfBirth.trim()) next.dateOfBirth = 'Nhập ngày sinh'
    else if (!dob) next.dateOfBirth = 'Nhập ngày có thật, dạng dd/mm/yyyy'
    else if (dob > today()) next.dateOfBirth = 'Ngày sinh không ở tương lai'
    else if (dob < '1900-01-01') next.dateOfBirth = 'Ngày sinh không trước năm 1900'
    if (!form.gender) next.gender = 'Chọn giới tính'
    if (permanentAddress().length > MAX_ADDRESS) next.address = `Địa chỉ tối đa ${MAX_ADDRESS} ký tự`
    const phone = form.phoneNumber.trim()
    if (phone && !VN_PHONE.test(normalizePhone(phone)))
      next.phoneNumber = 'Số điện thoại Việt Nam: di động 10 số (03, 05, 07, 08, 09…), cố định 11 số (02…)'
    return next
  }

  // Lỗi ở ô nào thì đưa con trỏ tới ô lỗi đầu tiên theo thứ tự trên form
  function focusFirstError() {
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus())
  }

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    setFailure(null)
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length > 0) {
      focusFirstError()
      return
    }
    setSaving(true)
    try {
      const phoneNumber = blank(form.phoneNumber) && normalizePhone(form.phoneNumber.trim())
      const { data } = await postResidents({
        headers: { 'Idempotency-Key': key },
        body: {
          fullName: cleanName(form.fullName),
          dateOfBirth: isoDate(form.dateOfBirth),
          gender: form.gender,
          idDocumentType: 'CITIZEN_ID',
          idDocumentNumber: number,
          permanentAddress: blank(permanentAddress()),
          contact: phoneNumber ? { phoneNumber } : undefined,
          specialNotes: blank(form.specialNotes),
        },
      })
      setCreated(data)
      onCreated?.(data)
    } catch (error) {
      const body = error instanceof ApiError ? error.problem : null
      if (body?.errorCode === 'CITIZEN_ID_IN_USE') {
        // Hai người tạo cùng lúc: backend chặn, báo tại ô căn cước
        setErrors({ idDocumentNumber: `Số căn cước đang dùng ở hồ sơ ${body.profileCode ?? 'khác'}` })
        focusFirstError()
      } else {
        setFailure(problemOf(error))
      }
    } finally {
      setSaving(false)
    }
  }

  const describedBy = (name, hasHint = false) => (errors[name] ? `${name}-error` : hasHint ? `${name}-hint` : undefined)

  const locked = !documentDone || saving

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="shrink-0 gap-1 border-b px-6 pt-6 pb-4 pr-12">
        <SheetTitle className="type-title">Tạo hồ sơ người cao tuổi</SheetTitle>
        <SheetDescription>Nhập thông tin định danh để kiểm tra hồ sơ trùng trước khi tạo.</SheetDescription>
      </SheetHeader>

      {created ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5" role="status">
          <p className="type-body-sm">
            Đã tạo hồ sơ <strong>{created.profile.profileCode}</strong> cho {created.profile.personalInfo.fullName}.
          </p>
          {created.profile.previousProfileId && (
            <p className="type-body-sm text-muted-foreground">
              Hồ sơ này được liên kết với hồ sơ trước của cùng người.
            </p>
          )}
          {(created.warnings ?? []).map((w) => (
            <p key={w.code} className="type-body-sm text-destructive">
              {w.description}
            </p>
          ))}
        </div>
      ) : (
        <form
          id={FORM_ID}
          ref={formRef}
          onSubmit={submit}
          noValidate
          aria-busy={saving || undefined}
          className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-6"
        >
          <div className="py-6">
            <FieldSet>
              <FieldLegend className="type-label mb-4">01 · Thông tin định danh</FieldLegend>
              <Field data-invalid={!!errors.idDocumentNumber || undefined}>
                <FieldLabel htmlFor="resident-doc-number">
                  Số căn cước <Required />
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="resident-doc-number"
                    value={number}
                    onChange={changeDocumentNumber}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        checkCitizenId()
                      }
                    }}
                    placeholder="Nhập 12 chữ số"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    className="h-11 tabular-nums"
                    aria-invalid={!!errors.idDocumentNumber || undefined}
                    aria-describedby={describedBy('idDocumentNumber', true)}
                  />
                  <Button type="button" className="h-11 shrink-0" disabled={looking} onClick={checkCitizenId}>
                    {looking ? 'Đang tra…' : 'Tra hồ sơ'}
                  </Button>
                </div>
                {errors.idDocumentNumber ? (
                  <FieldError id="idDocumentNumber-error">{errors.idDocumentNumber}</FieldError>
                ) : (
                  <FieldDescription id="idDocumentNumber-hint">
                    Nhập số căn cước để kiểm tra hồ sơ đã tồn tại hay chưa.
                  </FieldDescription>
                )}
              </Field>
              <div aria-live="polite">
                {looking ? (
                  <Alert className="px-4 py-3">
                    <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                    <AlertTitle>Đang tra cứu hồ sơ…</AlertTitle>
                  </Alert>
                ) : (
                  lookup?.number === number && (
                    <LookupResult lookup={lookup} onFillFromPrevious={fillFromPrevious} onOpenProfile={onOpenProfile} />
                  )
                )}
              </div>
            </FieldSet>
          </div>

          <div className="py-6">
            <FieldSet disabled={locked} className="disabled:opacity-60">
              <FieldLegend className="type-label mb-4">02 · Thông tin cơ bản</FieldLegend>
              <Field data-invalid={!!errors.fullName || undefined}>
                <FieldLabel htmlFor="resident-name">
                  Họ và tên <Required />
                </FieldLabel>
                <Input
                  id="resident-name"
                  value={form.fullName}
                  onChange={set('fullName')}
                  placeholder={locked ? 'Tra số căn cước trước' : 'Nhập họ và tên đầy đủ'}
                  autoComplete="off"
                  required
                  className="h-11"
                  aria-invalid={!!errors.fullName || undefined}
                  aria-describedby={describedBy('fullName')}
                />
                {errors.fullName && <FieldError id="fullName-error">{errors.fullName}</FieldError>}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field data-invalid={!!errors.dateOfBirth || undefined}>
                  <FieldLabel htmlFor="resident-dob">
                    Ngày sinh <Required />
                  </FieldLabel>
                  <Input
                    id="resident-dob"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    maxLength={10}
                    value={form.dateOfBirth}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dateOfBirth: maskDate(event.target.value, current.dateOfBirth),
                      }))
                    }
                    autoComplete="off"
                    required
                    className="h-11 tabular-nums"
                    aria-invalid={!!errors.dateOfBirth || undefined}
                    aria-describedby={describedBy('dateOfBirth')}
                  />
                  {errors.dateOfBirth && <FieldError id="dateOfBirth-error">{errors.dateOfBirth}</FieldError>}
                </Field>
                <Field data-invalid={!!errors.gender || undefined}>
                  <FieldLabel htmlFor="resident-gender">
                    Giới tính <Required />
                  </FieldLabel>
                  <select
                    id="resident-gender"
                    value={form.gender}
                    onChange={set('gender')}
                    required
                    className="h-11 w-full disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
                    aria-invalid={!!errors.gender || undefined}
                    aria-describedby={describedBy('gender')}
                  >
                    <option value="">Chọn</option>
                    {Object.entries(GENDER_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {errors.gender && <FieldError id="gender-error">{errors.gender}</FieldError>}
                </Field>
              </div>
            </FieldSet>
          </div>

          <div className="py-6">
            <FieldSet disabled={locked} className="disabled:opacity-60">
              <FieldLegend className="type-label mb-4">03 · Thông tin liên hệ</FieldLegend>
              <Field>
                <FieldLabel htmlFor="resident-province">Tỉnh/Thành phố</FieldLabel>
                <SearchSelect
                  id="resident-province"
                  options={provinceOptions}
                  value={form.provinceCode}
                  onChange={(provinceCode) => setForm((current) => ({ ...current, provinceCode, wardCode: '' }))}
                  disabled={locked}
                  placeholder={units.length ? 'Chọn hoặc tìm Tỉnh/Thành phố' : 'Đang tải danh mục…'}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="resident-ward">Phường/Xã</FieldLabel>
                <SearchSelect
                  id="resident-ward"
                  options={wardOptions}
                  value={form.wardCode}
                  onChange={(wardCode) => setForm((current) => ({ ...current, wardCode }))}
                  disabled={locked || !province}
                  placeholder={province ? 'Chọn hoặc tìm Phường/Xã' : 'Chọn Tỉnh/Thành phố trước'}
                />
              </Field>
              <Field data-invalid={!!errors.address || undefined}>
                <FieldLabel htmlFor="resident-address">Địa chỉ chi tiết</FieldLabel>
                <Input
                  id="resident-address"
                  value={form.address}
                  onChange={set('address')}
                  maxLength={MAX_ADDRESS}
                  placeholder="Số nhà, đường, thôn, tổ dân phố..."
                  className="h-11"
                  aria-invalid={!!errors.address || undefined}
                  aria-describedby={describedBy('address')}
                />
                {errors.address && <FieldError id="address-error">{errors.address}</FieldError>}
              </Field>
              <Field data-invalid={!!errors.phoneNumber || undefined}>
                <FieldLabel htmlFor="resident-phone">Số điện thoại</FieldLabel>
                <Input
                  id="resident-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={18}
                  value={form.phoneNumber}
                  onChange={set('phoneNumber')}
                  placeholder="Nhập số điện thoại, ví dụ 0912 345 678"
                  className="h-11"
                  aria-invalid={!!errors.phoneNumber || undefined}
                  aria-describedby={describedBy('phoneNumber', true)}
                />
                {errors.phoneNumber ? (
                  <FieldError id="phoneNumber-error">{errors.phoneNumber}</FieldError>
                ) : (
                  <FieldDescription id="phoneNumber-hint">
                    Không bắt buộc nếu người cao tuổi không có hoặc không sử dụng điện thoại.
                  </FieldDescription>
                )}
              </Field>
            </FieldSet>
          </div>

          <div className="py-6">
            <FieldSet disabled={locked} className="disabled:opacity-60">
              <Field>
                <FieldLabel htmlFor="resident-notes">Ghi chú</FieldLabel>
                <Textarea
                  id="resident-notes"
                  rows={2}
                  value={form.specialNotes}
                  onChange={set('specialNotes')}
                  placeholder="Thông tin bổ sung (nếu có)"
                />
              </Field>
            </FieldSet>
          </div>

          {failure && (
            <div className="py-6">
              <ProblemAlert problem={failure} />
            </div>
          )}
        </form>
      )}

      <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
        {created ? (
          <Button className="h-11" onClick={onClose}>
            Xong
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" form={FORM_ID} className="h-11" disabled={saving || (lookedUp && !!lookup.open)}>
              {saving ? 'Đang tạo hồ sơ…' : 'Tạo hồ sơ'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function profileText(p) {
  return `${p.personalInfo?.fullName ?? 'Không rõ họ tên'}, mã ${p.profileCode}, ${STATUS_LABELS[p.status] ?? p.status}`
}

function OpenProfile({ profile, onOpenProfile }) {
  if (!onOpenProfile) return null
  return (
    <Button type="button" variant="outline" className="h-11" onClick={() => onOpenProfile(profile.id)}>
      {`Mở hồ sơ ${profile.profileCode}`}
    </Button>
  )
}

// Kết quả tra căn cước trước khi tạo (DBR-01, FR-004): một khối Alert có biểu tượng và tiêu đề. Không tạo được hoặc cần
// kiểm lại giấy tờ: tông Cần chú ý (đỏ chỉ cho việc gấp, DESIGN.md mục 1); chưa có hồ sơ: tông Đạt
function LookupResult({ lookup, onFillFromPrevious, onOpenProfile }) {
  if (lookup.failed) {
    return (
      <Alert className="px-4 py-3" variant="destructive" role="alert">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Chưa tra được hồ sơ</AlertTitle>
        <AlertDescription>Lỗi kết nối hoặc máy chủ. Bấm "Tra hồ sơ" để thử lại.</AlertDescription>
      </Alert>
    )
  }
  if (lookup.open) {
    return (
      <Alert className="px-4 py-3" variant="attention">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Đã có hồ sơ đang mở</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>{`${profileText(lookup.open)}. Không tạo thêm hồ sơ cho số căn cước này.`}</p>
          <OpenProfile profile={lookup.open} onOpenProfile={onOpenProfile} />
        </AlertDescription>
      </Alert>
    )
  }
  const closed = lookup.latestClosed
  if (closed?.status === 'DECEASED') {
    return (
      <Alert className="px-4 py-3" variant="attention">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Số căn cước trùng hồ sơ đã qua đời</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>{`${profileText(closed)}. Cần kiểm tra lại giấy tờ; hồ sơ mới không liên kết với hồ sơ này.`}</p>
          <OpenProfile profile={closed} onOpenProfile={onOpenProfile} />
        </AlertDescription>
      </Alert>
    )
  }
  if (closed) {
    return (
      <Alert className="px-4 py-3">
        <Info aria-hidden="true" />
        <AlertTitle>Đã tìm thấy hồ sơ cũ</AlertTitle>
        <AlertDescription className="flex flex-col gap-2">
          <p>{`${profileText(closed)}. Hồ sơ mới sẽ được liên kết với hồ sơ này; bản đồng ý, đánh giá cũ không chuyển sang.`}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-11" onClick={onFillFromPrevious}>
              Điền từ hồ sơ cũ
            </Button>
            <OpenProfile profile={closed} onOpenProfile={onOpenProfile} />
          </div>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert className="px-4 py-3" variant="success">
      <CircleCheck aria-hidden="true" />
      <AlertTitle>Chưa tìm thấy hồ sơ</AlertTitle>
      <AlertDescription>Số căn cước này chưa có hồ sơ. Bạn có thể tiếp tục tạo hồ sơ mới.</AlertDescription>
    </Alert>
  )
}
