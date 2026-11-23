import { useEffect, useState } from 'react'
import { getResidentsByResidentIdRelationships } from '@/api'

// Người thân có quan hệ với người cao tuổi (api-012 GET /residents/{residentId}/relationships), để chọn người đại diện,
// người nhận theo tên thay cho ô nhập mã (test luồng BF-14 2026-11-23). Không đọc được (không có quyền, lỗi mạng) thì
// status 'error' và màn quay về ô nhập mã như trước.
export function useFamilyContacts(residentId) {
  const [state, setState] = useState({ status: 'loading', members: [] })
  useEffect(() => {
    let alive = true
    getResidentsByResidentIdRelationships({ path: { residentId } }).then(
      ({ data }) =>
        alive &&
        setState({
          status: 'ready',
          members: (data ?? []).map((r) => ({
            id: r.familyMember.id,
            fullName: r.familyMember.fullName,
            representative: !!r.representative,
            primaryContact: !!r.primaryContact,
            pickupAllowed: !!r.rights?.PICKUP_ALLOWED?.effective,
          })),
        }),
      () => alive && setState({ status: 'error', members: [] }),
    )
    return () => {
      alive = false
    }
  }, [residentId])
  return state
}

// Tên người thân theo mã; không có trong danh sách thì "người thân mã …"
export function memberName(members, id) {
  return members.find((m) => m.id === id)?.fullName ?? `người thân mã ${id}`
}
