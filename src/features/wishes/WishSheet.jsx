import { useEffect, useState } from 'react'
import { getStaff } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { SearchSelect } from '@/common/SearchSelect'

// Khung riêng cho Bác sĩ, Điều dưỡng ghi phiếu nguyện vọng mới khi chưa có bản Nháp (chủ dự án duyệt 2026-11-26; như khung
// Nháp của Hành chính, WishDraftSheet; kiểm chứng Nháp làm ngay trong thẻ): khung xl, đầu và chân cố định; "Hủy" và nút lưu
// ở chân; đóng khi chưa lưu thì hỏi lại. Nội dung phiếu là form có id formId do khối gọi truyền vào.
export function WishSheet({ title, formId, dirty, busy, submitLabel, onClose, children }) {
  const [confirmClose, setConfirmClose] = useState(false)
  const requestClose = () => (dirty ? setConfirmClose(true) : onClose())

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">{title}</SheetTitle>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6" aria-busy={busy || undefined}>
            {children}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" onClick={requestClose}>
              Hủy
            </Button>
            <Button type="submit" form={formId} className="h-11" disabled={busy}>
              {busy ? 'Đang lưu…' : submitLabel}
            </Button>
          </div>
        </div>
      </SheetContent>

      <DiscardChangesDialog
        open={confirmClose}
        onKeep={() => setConfirmClose(false)}
        onDiscard={() => {
          setConfirmClose(false)
          onClose()
        }}
      />
    </Sheet>
  )
}

// Bác sĩ nhận định: ô chọn tìm theo tên (giá trị là mã tài khoản, như StaffSelectField valueKey="accountId")
export function DoctorSelect({ id, value, onChange, error }) {
  const [staff, setStaff] = useState(null)
  useEffect(() => {
    let live = true
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => live && setStaff(data ?? []))
      .catch(() => live && setStaff([]))
    return () => {
      live = false
    }
  }, [])
  const options = (staff ?? [])
    .filter((s) => s.accountId != null && s.position === 'Bác sĩ')
    .map((s) => ({ value: String(s.accountId), label: s.fullName }))
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>
        Bác sĩ nhận định{' '}
        <span aria-hidden="true" className="text-destructive">
          *
        </span>
      </FieldLabel>
      <SearchSelect
        id={id}
        options={options}
        value={value}
        onChange={onChange}
        placeholder={staff === null ? 'Đang tải danh sách' : 'Gõ tên Bác sĩ'}
        invalid={!!error}
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
