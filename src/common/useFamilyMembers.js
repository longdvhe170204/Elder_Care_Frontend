import { useEffect, useState } from 'react'
import { getResidentsByResidentIdRelationships } from '@/api'

// Người thân có quan hệ Hiệu lực với người cao tuổi (api-012 GET /residents/{residentId}/relationships), để chọn theo tên
// thay cho ô nhập mã (demo 2026-11-25). Không đọc được (thiếu quyền, lỗi mạng) thì danh sách rỗng.
export function useFamilyMembers(residentId) {
  const [members, setMembers] = useState([])
  useEffect(() => {
    if (!residentId) return
    let live = true
    getResidentsByResidentIdRelationships({ path: { residentId } })
      .then(
        ({ data }) =>
          live &&
          setMembers(
            (data ?? [])
              .filter((r) => r.status === undefined || r.status === 'ACTIVE')
              .map((r) => ({ id: r.familyMember.id, fullName: r.familyMember.fullName })),
          ),
      )
      .catch(() => {})
    return () => {
      live = false
    }
  }, [residentId])
  return members
}

// Tên người thân theo mã; không có trong danh sách thì "người thân mã …"
export const memberNameOf = (members, id) =>
  members.find((m) => String(m.id) === String(id))?.fullName ?? `người thân mã ${id}`
