import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getAlerts, getResidentsByIdEndOfLifeWishes } from '@/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/common/permissions/permissions'
import { isOpen } from '@/features/alerts/alertView'
import { CHOICE_LABELS, SIGNER_LABELS } from '@/features/wishes/wishLabels'
import { CriticalCarePanel, FlagActions } from './CriticalCarePanel'

// Khối "Nguy kịch" dùng chung ở hồ sơ người cao tuổi, chi tiết sự cố và chi tiết cảnh báo (007 US11, BF-17). Sự cố khẩn cấp
// và cảnh báo nguy kịch vẫn là hai bản ghi riêng (FR-041): khối này chỉ đặt cạnh nhau, không gộp và không đổi điều kiện
// đóng của bên nào (BR-M05-09, BR-M05-15). Chưa có cảnh báo nguy kịch đang mở thì chỉ người có quyền ghi dấu (Bác sĩ,
// hoặc Điều dưỡng khi không có Bác sĩ trực, Q-218) thấy nút "Ghi dấu nguy kịch", kể cả khi người đó chưa có sự cố nào.
// Có cảnh báo đang mở thì hiện nguyện vọng Hiệu lực (hoặc "chưa có"), rồi các bước của CriticalCarePanel.

function WishGlance({ residentId }) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    let live = true
    getResidentsByIdEndOfLifeWishes({ path: { id: residentId } }).then(
      ({ data }) => live && setState({ status: 'ready', wish: data?.current ?? null }),
      () => live && setState({ status: 'hidden' }),
    )
    return () => {
      live = false
    }
  }, [residentId])
  if (state.status === 'loading') return <Skeleton className="h-6 w-2/3" />
  if (state.status === 'hidden') return null
  const wish = state.wish
  return (
    <p className="type-body-sm">
      <span className="type-caption text-muted-foreground">Nguyện vọng cuối đời: </span>
      {wish ? (
        <>
          <span className="type-label">{CHOICE_LABELS[wish.choice] ?? wish.choice}</span>
          {wish.signerType && <span>, ký bởi {SIGNER_LABELS[wish.signerType] ?? wish.signerType}</span>}
        </>
      ) : (
        'Chưa có nguyện vọng cuối đời'
      )}
    </p>
  )
}

// `defaultOpen`: khối mở sẵn (chi tiết cảnh báo nguy kịch); ở hồ sơ và chi tiết sự cố khối thu gọn, chỉ hiện dòng nguyện vọng và nút mở.
export function CriticalCareSection({ residentId, incidentId = null, defaultOpen = false, onChanged }) {
  const { can } = usePermissions()
  const [alert, setAlert] = useState(undefined)
  // Cảnh báo nguy kịch gần nhất (kể cả đã đóng): đóng cảnh báo không gỡ dấu, dấu còn mở tới khi Bác sĩ gỡ (BF-17 bước 7)
  const [latest, setLatest] = useState(null)
  const [recording, setRecording] = useState(false)
  const [flagExists, setFlagExists] = useState(false)
  const [open, setOpen] = useState(defaultOpen)

  const load = useCallback(async () => {
    try {
      const { data } = await getAlerts({ query: { residentId } })
      const critical = (data ?? [])
        .filter((a) => a.type === 'CRITICAL_CONDITION' && a.criticalFlagId != null)
        .sort((a, b) => b.id - a.id)
      setLatest(critical[0] ?? null)
      setAlert(critical.find(isOpen) ?? null)
    } catch {
      setAlert(null)
    }
  }, [residentId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nạp cảnh báo nguy kịch khi mở khối
    load()
  }, [load])

  function changed() {
    setRecording(false)
    setFlagExists(false)
    load()
    onChanged?.()
  }

  if (alert === undefined) return null
  if (!alert) {
    if (!can('CRITICAL_SIGN', 'CREATE')) return null
    return recording ? (
      <section aria-label="Nguy kịch" className="flex flex-col gap-3">
        <Button variant="ghost" className="h-11 self-start" onClick={() => setRecording(false)}>
          Quay lại
        </Button>
        {flagExists && latest && can('CRITICAL_SIGN', 'UPDATE') && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 p-3">
            <h3 className="type-card-title">Dấu nguy kịch đang mở</h3>
            <p className="type-caption text-muted-foreground">
              Cảnh báo nguy kịch trước đã đóng nhưng dấu vẫn còn. Gỡ dấu khi tình trạng đã ổn định, rồi mới ghi dấu mới.
            </p>
            <FlagActions flagId={latest.criticalFlagId} onChanged={changed} showConfirm={false} />
          </div>
        )}
        <CriticalCarePanel
          residentId={residentId}
          alert={null}
          onChanged={changed}
          onFlagExists={() => setFlagExists(true)}
        />
      </section>
    ) : (
      <section aria-label="Nguy kịch">
        <Button
          variant="outline"
          className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
          onClick={() => setRecording(true)}
        >
          Ghi dấu nguy kịch
        </Button>
      </section>
    )
  }
  if (!can('CRITICAL_SIGN', 'VIEW')) return null
  const canAct = can('CRITICAL_SIGN', 'UPDATE')
  return (
    <section aria-label="Nguy kịch" className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-card-title text-destructive">Nguy kịch</h3>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Thu gọn' : 'Mở xử lý nguy kịch'}
          {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </Button>
      </div>
      <WishGlance residentId={residentId} />
      {open && alert.incidentId != null && (
        <p className="type-caption text-muted-foreground">
          Đã gắn với sự cố SC-{alert.incidentId}
          {alert.incidentId === incidentId ? ' (sự cố đang xem)' : ''}. Chuyển viện chỉ nhập một lần, cảnh báo và sự cố
          cùng thấy kết quả.
        </p>
      )}
      {open &&
        (canAct ? (
          <CriticalCarePanel residentId={residentId} alert={alert} onChanged={changed} />
        ) : (
          <p className="type-caption text-muted-foreground">
            Chỉ xem: Bác sĩ hoặc Điều dưỡng xử lý dấu nguy kịch và cảnh báo này.
          </p>
        ))}
    </section>
  )
}
