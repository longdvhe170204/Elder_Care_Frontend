import { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { AlertFollowUps } from '@/features/alerts/AlertFollowUps'
import { loadAlert } from '@/features/alerts/alerts'
import { typeLabel } from '@/features/alerts/alertView'

// 005 FR-057, Q-419: thẻ việc có nhãn "Đang theo dõi" mở khung chi tiết; khung có các lần theo dõi và form ghi kết quả theo
// dõi cho từng cảnh báo đang mở của người cao tuổi đó (lệnh `follow-up` theo `allowedCommands` của 007). Không tạo công việc.

function FollowingAlert({ id }) {
  const [alert, setAlert] = useState(null)
  const [problem, setProblem] = useState(null)
  const reload = useCallback(async () => {
    try {
      setAlert(await loadAlert(id))
      setProblem(null)
    } catch (error) {
      setProblem(problemOf(error))
    }
  }, [id])
  useEffect(() => {
    let current = true
    loadAlert(id)
      .then((data) => current && setAlert(data))
      .catch((error) => current && setProblem(problemOf(error)))
    return () => {
      current = false
    }
  }, [id])
  if (problem) return <ProblemAlert problem={problem} />
  if (!alert) return <Skeleton className="h-20 w-full" />
  return (
    <AlertFollowUps
      alert={alert}
      title={`Đang theo dõi: ${typeLabel(alert.type)}`}
      canRecord={(alert.allowedCommands ?? []).includes('follow-up')}
      onRecorded={reload}
    />
  )
}

export function FollowingAlerts({ alertIds }) {
  if (!alertIds?.length) return null
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      {alertIds.map((id) => (
        <FollowingAlert key={id} id={id} />
      ))}
    </div>
  )
}
