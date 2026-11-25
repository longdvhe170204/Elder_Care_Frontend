import { useEffect, useState } from 'react'
import { getMe, getStaff } from '@/api'

// Nhân viên bàn giao chọn được khi ghi đón (012) và Cho tạm vắng (004): người đang ghi ("Tôi", theo UserInfo.staffId của
// /me) đứng đầu, rồi nhân viên đang làm việc người ghi xem được (api-008: nhân viên chỉ thấy người cùng ca, nên Hành chính
// không có ca thì chỉ có "Tôi"). Test BF-12 2026-11-24. null khi đang tải. Dùng cả cho người ký phía viện khi ghi nhận
// phụ lục đã ký (004; góp ý test BF-12 2026-11-25).
export function useHandoverStaff() {
  const [me, setMe] = useState(undefined)
  const [staff, setStaff] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    getMe()
      .then(({ data }) => !cancelled && setMe(data))
      .catch(() => !cancelled && setMe(null))
    getStaff({ query: { status: 'WORKING' } })
      .then(({ data }) => !cancelled && setStaff(data ?? []))
      .catch(() => !cancelled && setStaff([]))
    return () => {
      cancelled = true
    }
  }, [])

  if (staff === undefined) return null
  const self = me?.staffId ? [{ id: me.staffId, label: `Tôi (${me.fullName})` }] : []
  const others = staff.filter((s) => s.id !== me?.staffId).map((s) => ({ id: s.id, label: s.fullName }))
  return [...self, ...others]
}
