import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { DiscardChangesDialog } from '@/common/DiscardChangesDialog'
import { BedAllocationForm } from './BedAllocationForm'

// Khung riêng Phân bổ giường (audit BF-01 2026-11-26, chủ dự án duyệt bản phác): khung xl, đầu và chân cố định, đóng khi đã
// nhập thì hỏi lại. afterContract: mở ngay sau khi lập hợp đồng nội trú (phương án C, 2026-11-21), nút đóng là "Để sau".
const FORM_ID = 'bed-allocation-form'

export function BedAllocationSheet({
  resident,
  defaultDate,
  afterContract = false,
  onClose,
  onSaved,
  onOpenWaitingList,
}) {
  const [state, setState] = useState({ dirty: false, busy: false })
  const [confirmClose, setConfirmClose] = useState(false)
  const onStateChange = useCallback((next) => setState(next), [])

  function requestClose() {
    if (state.busy) return
    if (state.dirty) setConfirmClose(true)
    else onClose()
  }

  return (
    <Sheet open onOpenChange={(next) => !next && requestClose()}>
      <SheetContent side="center" className="gap-0 p-0 sm:max-w-3xl">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 pt-6 pb-4 pr-12">
            <SheetTitle className="type-title">
              {afterContract ? 'Chọn giường cho hợp đồng vừa lập' : 'Phân bổ giường'}
            </SheetTitle>
            <SheetDescription>{[resident.fullName, resident.profileCode].filter(Boolean).join(' · ')}</SheetDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <BedAllocationForm
              resident={resident}
              defaultDate={defaultDate}
              formId={FORM_ID}
              onStateChange={onStateChange}
              onOpenWaitingList={onOpenWaitingList}
              onSaved={onSaved}
            />
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="h-11" disabled={state.busy} onClick={requestClose}>
              {afterContract ? 'Để sau' : 'Hủy'}
            </Button>
            <Button type="submit" form={FORM_ID} className="h-11" disabled={state.busy}>
              {state.busy ? 'Đang lưu…' : 'Xác nhận phân bổ'}
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
