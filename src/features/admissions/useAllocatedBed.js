import { useEffect, useState } from 'react'
import { getBedAllocations, getRoomTypes, getRooms } from '@/api/api003'

// Giường đã phân bổ của người cao tuổi (phân bổ Đang hiệu lực, không có thì Tương lai; 003) kèm loại phòng của giường.
// Hướng 1 (chủ dự án chọn 2026-11-27): hợp đồng chỉ hiện giường và báo khi loại phòng của giường khác loại phòng của hợp
// đồng; không ghi giường vào hợp đồng, không tự đổi loại phòng (giường nằm ở phân bổ, hợp đồng ghi loại phòng, FR-019).
// reload: giá trị đổi mỗi lần màn tải lại (ví dụ sau khi phân bổ) để đọc lại. Trả { bed, roomTypeName(id) }; bed null khi
// chưa có phân bổ hoặc không đọc được.
export function useAllocatedBed(residentId, reload) {
  const [state, setState] = useState({ bed: null, names: {} })
  useEffect(() => {
    if (!residentId) return
    let active = true
    Promise.all([
      getBedAllocations({ query: { residentId: Number(residentId) } }),
      getRooms({ query: {} }),
      getRoomTypes({ query: {} }),
    ])
      .then(([allocations, rooms, types]) => {
        if (!active) return
        const names = Object.fromEntries(types.data.map((t) => [t.id, t.name]))
        const allocation =
          allocations.data.find((a) => a.status === 'ACTIVE') ??
          allocations.data.find((a) => a.status === 'FUTURE') ??
          null
        const roomTypeId = allocation
          ? (rooms.data.find((r) => r.id === allocation.location.roomId)?.roomTypeId ?? null)
          : null
        // startDate: ngày bắt đầu của phân bổ theo giờ Việt Nam (yyyy-MM-dd), để so với ngày bắt đầu hợp đồng (004 FR-021;
        // backend so ngày: phân bổ bắt đầu trong hoặc trước ngày bắt đầu hợp đồng)
        const at = allocation?.startAt ?? allocation?.plannedStartAt
        const startDate = at ? new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }) : null
        setState({
          bed: allocation && { status: allocation.status, location: allocation.location, roomTypeId, startDate },
          names,
        })
      })
      .catch(() => active && setState({ bed: null, names: {} }))
    return () => {
      active = false
    }
  }, [residentId, reload])
  return { bed: state.bed, roomTypeName: (id) => state.names[id] ?? null }
}

// "Phòng 202, G3 · Khu A – Tầng 2"
export function bedText(location) {
  if (!location) return ''
  const place = [location.area, location.floor].filter(Boolean).join(' – ')
  const name = location.room && location.bed ? `${location.room}, ${location.bed}` : location.label
  return [name, place].filter(Boolean).join(' · ')
}

// Câu báo lệch khi loại phòng của giường khác loại phòng của hợp đồng; null khi khớp hoặc thiếu dữ liệu
export function roomTypeMismatch(allocated, contractRoomTypeId) {
  const { bed, roomTypeName } = allocated
  if (!bed?.roomTypeId || !contractRoomTypeId || bed.roomTypeId === Number(contractRoomTypeId)) return null
  const bedType = roomTypeName(bed.roomTypeId) ?? 'loại phòng khác'
  const contractType = roomTypeName(Number(contractRoomTypeId)) ?? 'loại phòng khác'
  return `Giường thuộc ${bedType.toLowerCase()}, hợp đồng ghi ${contractType.toLowerCase()}`
}
