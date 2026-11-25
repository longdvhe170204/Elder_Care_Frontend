import { useEffect, useState } from 'react'
import { getResidents } from '@/api'

// Danh sách người cao tuổi trong phạm vi quyền (GET /residents của api-001) để chọn, tìm theo tên thay cho ô nhập mã
// (demo 2026-11-25). null: đang tải; rỗng: không đọc được thì màn quay về ô nhập mã như trước.
export function useResidentDirectory() {
  const [residents, setResidents] = useState(null)
  useEffect(() => {
    let live = true
    getResidents({ query: {} })
      .then(({ data }) => live && setResidents(data?.items ?? []))
      .catch(() => live && setResidents([]))
    return () => {
      live = false
    }
  }, [])
  return residents
}

// "Họ tên (mã hồ sơ)"; không có trong danh sách thì "Người cao tuổi mã …"
export function residentLabel(residents, id) {
  const r = (residents ?? []).find((x) => x.id === Number(id))
  if (!r) return `Người cao tuổi mã ${id}`
  const name = r.personalInfo?.fullName ?? `Mã ${r.id}`
  return r.profileCode ? `${name} (${r.profileCode})` : name
}

// So khớp không phân biệt hoa thường, bỏ dấu tiếng Việt, theo họ tên hoặc mã hồ sơ
const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
export function residentMatches(residents, id, query) {
  const q = fold(query.trim())
  if (!q) return true
  return fold(residentLabel(residents, id)).includes(q) || String(id).includes(q)
}
