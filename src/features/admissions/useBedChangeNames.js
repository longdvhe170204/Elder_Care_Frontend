import { useEffect, useState } from 'react'
import { getBedsById, getRoomTypes } from '@/api'

// Tên cho loại thay đổi "Loại phòng" (mã BED, Q-445): giá trị trước là loại phòng của hợp đồng (roomTypeId), giá trị sau là
// giường mới (newBedId) hoặc bedId của phụ lục. Đọc tên loại phòng, nhãn giường để changeValueText ghi bằng chữ; không đọc
// được thì changeValueText ghi "mã …". Góp ý test BF-12 2026-11-25.
export function useBedChangeNames(values) {
  const [names, setNames] = useState({ roomTypes: {}, beds: {} })
  const roomTypeIds = [...new Set(values.map((v) => v?.roomTypeId).filter(Boolean))]
  const bedIds = [...new Set(values.map((v) => v?.newBedId ?? v?.bedId).filter(Boolean))]
  const key = `${roomTypeIds.join(',')}|${bedIds.join(',')}`

  useEffect(() => {
    let cancelled = false
    if (roomTypeIds.length > 0)
      getRoomTypes({ query: {} })
        .then(({ data }) => {
          if (cancelled) return
          const roomTypes = Object.fromEntries((data ?? []).map((t) => [t.id, t.name]))
          setNames((n) => ({ ...n, roomTypes }))
        })
        .catch(() => {})
    for (const id of bedIds)
      getBedsById({ path: { id } })
        .then(({ data }) => {
          if (cancelled || !data?.location?.label) return
          setNames((n) => ({ ...n, beds: { ...n.beds, [id]: data.location.label } }))
        })
        .catch(() => {})
    return () => {
      cancelled = true
    }
    // key gom các mã cần đọc; đổi mã thì đọc lại
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return names
}
