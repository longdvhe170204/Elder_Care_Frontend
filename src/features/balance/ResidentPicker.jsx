import { useEffect, useState } from 'react'
import { getResidents } from '@/api'
import { ProblemAlert } from '@/common/ProblemAlert'
import { ResidentCombobox } from '@/common/ResidentCombobox'
import { problemOf } from '@/common/problem'

// Chọn người cao tuổi (GET /residents của api-001, trong phạm vi quyền của người dùng); chọn một người thì gọi
// onPick({ residentId, fullName }). Demo 2026-11-26 (E): ô tìm theo tên hoặc mã hồ sơ, danh sách hiện ngay khi gõ
// (ResidentCombobox) thay ô tìm phải bấm nút rồi chọn trong hàng nút.
export function ResidentPicker({ onPick }) {
  const [items, setItems] = useState(null)
  const [failure, setFailure] = useState(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    let live = true
    getResidents({ query: {} })
      .then(({ data }) => live && setItems(data.items ?? []))
      .catch((error) => {
        if (!live) return
        setItems([])
        setFailure(problemOf(error))
      })
    return () => {
      live = false
    }
  }, [])

  const residents = items ?? []
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <ResidentCombobox
        id="balance-resident"
        label="Tìm người cao tuổi"
        options={residents.map((r) => ({
          value: String(r.id),
          label: r.profileCode ? `${r.personalInfo.fullName} (${r.profileCode})` : r.personalInfo.fullName,
        }))}
        value={value}
        loading={items === null}
        onChange={(next) => {
          setValue(next)
          const r = residents.find((x) => String(x.id) === next)
          if (r) onPick({ residentId: r.id, fullName: r.personalInfo.fullName })
        }}
      />
      <ProblemAlert problem={failure} />
    </div>
  )
}
