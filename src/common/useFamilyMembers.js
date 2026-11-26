import { useEffect, useState } from 'react'
import { getResidentsByResidentIdFamilyContacts } from '@/api'

// Danh sách rỗng đánh dấu "không đọc được" (thiếu quyền, lỗi mạng), để ô chọn không báo nhầm là chưa có người thân
const UNAVAILABLE = Object.freeze([])
export const membersUnavailable = (members) => members === UNAVAILABLE

// Người thân có quan hệ Hiệu lực với người cao tuổi, để chọn theo tên thay cho ô nhập mã (demo 2026-11-25). Đọc danh sách
// liên hệ người thân (api-012 GET /residents/{residentId}/family-contacts; Q-448: Quản lý viện, Trưởng tầng, Bác sĩ, Điều
// dưỡng, Hành chính), backend chỉ trả quan hệ Hiệu lực. Không đọc được thì danh sách rỗng UNAVAILABLE.
export function useFamilyMembers(residentId) {
  const [members, setMembers] = useState([])
  useEffect(() => {
    if (!residentId) return
    let live = true
    getResidentsByResidentIdFamilyContacts({ path: { residentId } })
      .then(
        ({ data }) =>
          live && setMembers((data ?? []).map((c) => ({ id: c.familyMemberId, fullName: c.fullName }))),
      )
      .catch(() => live && setMembers(UNAVAILABLE))
    return () => {
      live = false
    }
  }, [residentId])
  return members
}

// Tên người thân theo mã; không có trong danh sách thì "người thân mã …"
export const memberNameOf = (members, id) =>
  members.find((m) => String(m.id) === String(id))?.fullName ?? `người thân mã ${id}`
