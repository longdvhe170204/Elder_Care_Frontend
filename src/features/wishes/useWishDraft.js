import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '@/api'
import { problemOf } from '@/common/problem'

// Nạp bản Nháp tự khai đang mở của phiếu nguyện vọng (001 T116; Q-412, FR-023n → FR-023q); 404 NO_DRAFT là chưa có Nháp.
// enabled: vai trò có lệnh với Nháp theo allowedCommands (Hành chính lập; Bác sĩ, Điều dưỡng kiểm chứng, Hủy nháp).
export function useWishDraft(loader, residentId, enabled) {
  const [draft, setDraft] = useState(null)
  const [failure, setFailure] = useState(null)

  const reload = useCallback(async () => {
    if (!enabled) return
    try {
      const { data } = await loader({ path: { id: residentId } })
      setDraft(data)
      setFailure(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setDraft(null)
        setFailure(null)
      } else setFailure(problemOf(error))
    }
  }, [loader, residentId, enabled])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp bản Nháp khi mở khối
    reload()
  }, [reload])

  return { draft, setDraft, failure, reload }
}
