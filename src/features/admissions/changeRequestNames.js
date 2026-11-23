import { useEffect, useRef, useState } from 'react'
import { getContracts, getResidentsById } from '@/api'

// Họ tên người cao tuổi và số hợp đồng cho từng dòng của danh sách yêu cầu điều chỉnh hợp đồng: api-004 chỉ trả
// residentId, contractId. Mỗi người cao tuổi gọi một lần, hợp đồng gọi một lần cho cả danh sách; không xem được (403) hoặc
// lỗi thì bỏ qua và danh sách rơi về mã yêu cầu. Không đổi hợp đồng API.
export function useRequestNames(requests, seesContracts) {
  const [names, setNames] = useState({})
  const [numbers, setNumbers] = useState({})
  const asked = useRef(new Set())
  const residentIds = [...new Set((requests ?? []).map((r) => r.residentId).filter(Boolean))]
  const key = residentIds.join(',')

  useEffect(() => {
    for (const id of residentIds) {
      if (asked.current.has(id)) continue
      asked.current.add(id)
      getResidentsById({ path: { id } })
        .then(({ data }) => setNames((n) => ({ ...n, [id]: data?.personalInfo?.fullName ?? null })))
        .catch(() => {})
    }
    // residentIds suy ra từ key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!seesContracts || !key) return
    getContracts({ query: {} })
      .then(({ data }) => setNumbers(Object.fromEntries((data ?? []).map((c) => [c.id, c.contractNumber]))))
      .catch(() => {})
  }, [seesContracts, key])

  return {
    nameOf: (r) => names[r.residentId] ?? null,
    contractNumberOf: (r) => numbers[r.contractId] ?? null,
  }
}
