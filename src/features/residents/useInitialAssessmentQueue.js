import { useEffect, useState } from 'react'
import { ApiError, getResidents, getResidentsByIdAssessments, getResidentsByIdInitialHealthRecord } from '@/api'

// Tình trạng đánh giá đầu vào của người Đang tiếp nhận, cho cột "Đánh giá đầu vào" ở tab Đang tiếp nhận của Bác sĩ, Điều
// dưỡng (chủ dự án yêu cầu 2026-11-26: không thông báo, không chip riêng). Tính ở web từ API sẵn có của api-001 (GET /residents?status=ADMISSION_IN_PROGRESS,
// GET /residents/{id}/assessments, GET /residents/{id}/initial-health-record), chỉ để hiển thị (Q-307). Mỗi dòng kèm
// có phiếu Nháp chưa và trạng thái hồ sơ sức khỏe ban đầu (Hành chính lập bản Nháp tự khai, Q-400).
// Trả null khi chưa tải xong hoặc vai trò không xem được đánh giá (403).

async function allAdmissions() {
  const all = []
  let cursor
  do {
    const { data } = await getResidents({ query: { status: 'ADMISSION_IN_PROGRESS', cursor } })
    all.push(...data.items)
    cursor = data.nextCursor
  } while (cursor)
  return all
}

async function entryOf(profile) {
  const [list, health] = await Promise.allSettled([
    getResidentsByIdAssessments({ path: { id: profile.id } }),
    getResidentsByIdInitialHealthRecord({ path: { id: profile.id } }),
  ])
  if (list.status === 'rejected') throw list.reason
  const assessments = list.value.data
  const confirmed = assessments.some((a) => a.type === 'INITIAL' && a.status === 'CONFIRMED')
  let healthState = 'NONE'
  if (health.status === 'fulfilled') healthState = health.value.data.confirmed ? 'CONFIRMED' : 'DRAFT'
  else if (!(health.reason instanceof ApiError && health.reason.status === 404)) healthState = 'UNKNOWN'
  const draft = assessments.find((a) => a.status === 'DRAFT')
  return { profile, confirmed, hasDraft: !!draft, draftId: draft?.id ?? null, health: healthState }
}

export function useInitialAssessmentQueue(enabled, reloadKey) {
  const [queue, setQueue] = useState(null)
  useEffect(() => {
    if (!enabled) return undefined
    let live = true
    allAdmissions()
      .then((profiles) => Promise.all(profiles.map(entryOf)))
      .then((entries) => live && setQueue(entries))
      .catch(() => live && setQueue(null))
    return () => {
      live = false
    }
  }, [enabled, reloadKey])
  return enabled ? queue : null
}
