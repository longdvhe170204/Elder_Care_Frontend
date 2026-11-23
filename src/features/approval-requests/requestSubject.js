import { useEffect, useState } from 'react'
import { getContractsById, getResidentsById } from '@/api'

// Người cao tuổi và hợp đồng của một yêu cầu phê duyệt, để người duyệt biết yêu cầu của cụ nào (chủ dự án yêu cầu
// 2026-11-21). api-000 không trả người cao tuổi; tra theo nội dung: contractId (thay đổi lưu trú, 004) → hợp đồng →
// hồ sơ, hoặc residentId. Không xem được thì không hiện. Mỗi hợp đồng, hồ sơ chỉ tra một lần trong phiên trang.

const contracts = new Map()
const residents = new Map()

function cached(map, key, load) {
  if (!map.has(key))
    map.set(
      key,
      load().catch(() => null),
    )
  return map.get(key)
}

async function subjectOf(content) {
  let residentId = content?.residentId ?? null
  let contractNumber = null
  if (content?.contractId) {
    const contract = await cached(contracts, content.contractId, () =>
      getContractsById({ path: { id: content.contractId } }).then(({ data }) => data),
    )
    contractNumber = contract?.contractNumber ?? null
    residentId = residentId ?? contract?.residentId ?? null
  }
  if (!residentId) return contractNumber ? { residentId: null, residentName: null, contractNumber } : null
  const resident = await cached(residents, residentId, () =>
    getResidentsById({ path: { id: residentId } }).then(({ data }) => data),
  )
  return { residentId, residentName: resident?.personalInfo?.fullName ?? null, contractNumber }
}

export function subjectText(subject) {
  if (!subject) return ''
  return [subject.residentName, subject.contractNumber && `HĐ ${subject.contractNumber}`].filter(Boolean).join(' · ')
}

export function useRequestSubject(content) {
  const contractId = content?.contractId ?? null
  const residentId = content?.residentId ?? null
  const key = `${contractId}:${residentId}`
  const [state, setState] = useState({ key: null, subject: null })
  useEffect(() => {
    let live = true
    if (!contractId && !residentId) return
    subjectOf({ contractId, residentId }).then((subject) => live && setState({ key, subject }))
    return () => {
      live = false
    }
  }, [contractId, residentId, key])
  return state.key === key ? state.subject : null
}

// Chỉ cho test: xóa bộ nhớ tra cứu giữa các ca
export function resetRequestSubjects() {
  contracts.clear()
  residents.clear()
}
