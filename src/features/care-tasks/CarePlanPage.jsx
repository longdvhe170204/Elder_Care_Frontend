import { useEffect, useState } from 'react'
import { getResidents, getResidentsByResidentIdCarePlans, postResidentsByResidentIdCarePlans } from '@/api'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/common/PageHeader'
import { DetailLayout } from '@/common/DetailLayout'
import { StatusBadge } from '@/common/StatusBadge'
import { ProblemAlert } from '@/common/ProblemAlert'
import { PermissionDeniedState } from '@/common/PageState'
import { usePermissions } from '@/common/permissions/permissions'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { CareField } from './CareField'
import { CarePlanDetail } from './CarePlanDetail'
import { FREQUENCIES, planLabel, planState } from './carePlanLabels'

function ResidentChoice({ value, onChange }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [residents, setResidents] = useState([])
  const [cursor, setCursor] = useState(null)
  const [failure, setFailure] = useState(null)
  useEffect(() => {
    let cancelled = false
    getResidents({ query: { q: query || undefined } })
      .then(({ data }) => {
        if (!cancelled) {
          setResidents(data.items)
          setCursor(data.nextCursor)
          setFailure(null)
        }
      })
      .catch((error) => {
        if (!cancelled) setFailure(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [query])
  async function more() {
    try {
      const { data } = await getResidents({ query: { q: query || undefined, cursor } })
      setResidents((old) => [...old, ...data.items])
      setCursor(data.nextCursor)
    } catch (error) {
      setFailure(problemOf(error))
    }
  }
  const options = Object.fromEntries(residents.map((resident) => [resident.id, resident.personalInfo?.fullName ?? `Người cao tuổi mã ${resident.id}`]))
  if (value && !options[value]) options[value] = 'Người cao tuổi đã chọn'
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(text.trim())
        }}
      >
        <div className="min-w-0 flex-1">
          <CareField label="Tìm người cao tuổi" value={text} onChange={setText} />
        </div>
        <Button type="submit" variant="outline">
          Tìm hồ sơ
        </Button>
      </form>
      <ProblemAlert problem={failure} />
      <CareField label="Người cao tuổi" value={value || ''} onChange={(id) => onChange(Number(id))} options={options} />
      {cursor && (
        <Button variant="outline" onClick={more}>
          Xem thêm hồ sơ
        </Button>
      )}
    </section>
  )
}

function CurrentItems({ plan }) {
  return (
    <ul className="divide-y">
      {(plan.items ?? []).map((item) => (
        <li key={item.id} className="flex flex-col gap-1 py-3">
          <p>{item.content}</p>
          <p className="type-body-sm text-muted-foreground">
            {FREQUENCIES[item.frequencyType]}
            {item.intervalHours ? ` · ${item.intervalHours} giờ` : ''}
            {item.startsAt ? ` · ${item.startsAt}` : ' · Trong ca'}
          </p>
          {item.waterTargetMl != null && <p className="type-body-sm">Mục tiêu nước: {item.waterTargetMl} ml/ngày</p>}
        </li>
      ))}
    </ul>
  )
}

// Q-447: một kế hoạch trên màn (hiện hành + bản sửa đang xử lý), không hiện phiên bản, không so sánh tự chọn
export function CarePlanPage({ residentId: initialResidentId = 0 }) {
  const { can } = usePermissions()
  const [residentId, setResidentId] = useState(initialResidentId)
  const [plans, setPlans] = useState(null)
  const [failure, setFailure] = useState(null)
  const [selected, setSelected] = useState(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!residentId) return undefined
    let cancelled = false
    getResidentsByResidentIdCarePlans({ path: { residentId } })
      .then(({ data }) => {
        if (!cancelled) {
          setPlans(data)
          setFailure(null)
        }
      })
      .catch((error) => {
        if (!cancelled) setFailure(problemOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [residentId, reload])
  async function create() {
    setBusy(true)
    setFailure(null)
    try {
      const { data } = await postResidentsByResidentIdCarePlans({
        path: { residentId },
        body: {},
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      })
      setSelected(data.id)
      setReload((value) => value + 1)
    } catch (error) {
      setFailure(problemOf(error))
    } finally {
      setBusy(false)
    }
  }
  function choose(id) {
    setResidentId(id)
    setPlans(null)
    setSelected(null)
    setFailure(null)
  }
  const { current, scheduled, open } = planState(plans)
  const shown = scheduled ?? current
  const hasPlan = Boolean(shown)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Kế hoạch chăm sóc" subtitle="Điều dưỡng lập, sửa kế hoạch rồi gửi Bác sĩ duyệt" />
      <DetailLayout
        open={selected !== null}
        detailKey={selected}
        onClose={() => setSelected(null)}
        label="Chi tiết kế hoạch chăm sóc"
        renderDetail={({ Title, Description }) => (
          <CarePlanDetail
            key={selected}
            planId={selected}
            currentPlanId={current?.id}
            Title={Title}
            Description={Description}
            onChanged={() => setReload((value) => value + 1)}
          />
        )}
      >
        <ResidentChoice value={residentId} onChange={choose} />
        {failure?.status === 403 ? (
          <PermissionDeniedState label="kế hoạch chăm sóc" />
        ) : (
          <>
            <ProblemAlert problem={failure} />
            {residentId ? (
              <section className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-busy={busy || plans === null}>
                <h2 className="type-title">Kế hoạch hiện hành</h2>
                {plans === null ? (
                  <p role="status">Đang tải kế hoạch…</p>
                ) : (
                  <>
                    {(open || scheduled) && (
                      <div className="flex flex-wrap items-center gap-3">
                        {scheduled && <StatusBadge status={planLabel(scheduled, true)} />}
                        {open && <StatusBadge status={planLabel(open, hasPlan)} />}
                        {open && (
                          <Button variant="outline" onClick={() => setSelected(open.id)}>
                            {hasPlan ? 'Mở bản sửa' : 'Mở kế hoạch đang soạn'}
                          </Button>
                        )}
                      </div>
                    )}
                    {current ? (
                      <>
                        <p className="type-body-sm text-muted-foreground">
                          Hiệu lực từ {formatDate(current.effectiveFrom)}
                        </p>
                        <CurrentItems plan={current} />
                      </>
                    ) : (
                      <p>Chưa có kế hoạch chăm sóc đang hiệu lực.</p>
                    )}
                    {can('CARE_PLAN', 'CREATE') && !open && (
                      <div className="border-t pt-4">
                        <Button disabled={busy} onClick={create}>
                          {hasPlan ? 'Sửa kế hoạch' : 'Lập kế hoạch'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            ) : (
              <p>Chọn người cao tuổi để xem kế hoạch.</p>
            )}
          </>
        )}
      </DetailLayout>
    </div>
  )
}
