import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CreateResident } from '../residents/CreateResident'
import { ApplicationForm } from './ApplicationParts'

// Tiếp nhận mới (chủ dự án yêu cầu 2026-11-18): một khung đi liền hai bước đầu của BF-01. Tạo hồ sơ người cao tuổi xong
// (hồ sơ mới luôn ở Đang tiếp nhận) thì khung chuyển ngay sang form lập đăng ký của chính người đó, không phải đóng khung,
// đổi màn hay chọn lại người cao tuổi; lưu đăng ký xong gọi onDone với lượt đăng ký để mở màn Hồ sơ tiếp nhận. Mỗi bước
// vẫn là một lệnh do Hành chính bấm lưu (Q-306, Q-307); đóng khung sau bước 1 thì hồ sơ đã tạo vẫn còn, lập đăng ký sau ở
// màn Đăng ký tiếp nhận.
export function NewAdmissionSheet({ onClose, onResidentCreated, onDone }) {
  const [created, setCreated] = useState(null)

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className={created ? 'overflow-y-auto p-6 sm:max-w-lg' : 'sm:max-w-lg'}>
        {created ? (
          <ApplicationForm
            residentId={created.profile.id}
            residentName={created.profile.personalInfo?.fullName}
            notice={
              <div role="status" className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 type-body-sm">
                <span>{`Đã tạo hồ sơ ${created.profile.profileCode}. Tiếp theo: lập đăng ký tiếp nhận.`}</span>
                {(created.warnings ?? []).map((w) => (
                  <span key={w.code} className="text-warning-foreground">
                    {w.description}
                  </span>
                ))}
              </div>
            }
            onClose={onClose}
            onDone={(message, application) => onDone(message, application)}
          />
        ) : (
          <CreateResident
            onCreated={(data) => {
              setCreated(data)
              onResidentCreated?.(data)
            }}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
