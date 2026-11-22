import { useEffect, useState } from 'react'
import { getResidencyChangeRequestsById, getResidentsById } from '@/api'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDate } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { ChangeContent } from './ChangeParts'
import { ADDENDUM_STATUS, addendumNoText } from './changeRequestRules'

// Bản in phụ lục hợp đồng cho người đại diện ký (004 FR-043d, Q-420; W3): người cao tuổi, hợp đồng, số phụ lục, giá trị
// trước, sau, đơn giá, ngày hiệu lực dự kiến, chỗ ký hai bên. In bằng trình duyệt (window.print); phần nút không in.
export function AddendumPrint({ id, onNavigate = () => {} }) {
  const [request, setRequest] = useState(null)
  const [residentName, setResidentName] = useState('')
  const [failure, setFailure] = useState(null)

  useEffect(() => {
    let live = true
    if (!id) return
    getResidencyChangeRequestsById({ path: { id } })
      .then(({ data }) => {
        if (!live) return
        setRequest(data)
        if (data.residentId)
          getResidentsById({ path: { id: data.residentId } })
            .then(({ data: r }) => live && setResidentName(r.personalInfo?.fullName ?? ''))
            .catch(() => {})
      })
      .catch((e) => live && setFailure(problemOf(e)))
    return () => {
      live = false
    }
  }, [id])

  if (failure) return <ProblemAlert problem={failure} />
  if (!request) return <Skeleton className="h-64 w-full" />
  const addendum = request.addendum

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 print:max-w-none">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <Button variant="ghost" className="h-11" onClick={() => onNavigate('residency-changes', { id })}>
          Về yêu cầu điều chỉnh hợp đồng
        </Button>
        <Button className="h-11" onClick={() => window.print()}>
          In phụ lục
        </Button>
      </div>
      <article className="flex flex-col gap-4 rounded-2xl border bg-card p-6 print:border-0 print:p-0">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="type-title">{`${addendumNoText(addendum?.addendumNo)} hợp đồng dịch vụ chăm sóc`}</h1>
          <p className="type-body-sm">{`Hợp đồng mã ${request.contractId}`}</p>
          {addendum && (
            <p className="type-caption text-muted-foreground print:hidden">
              {`Trạng thái: ${ADDENDUM_STATUS[addendum.status] ?? addendum.status}`}
            </p>
          )}
        </header>
        <p className="type-body">{`Người cao tuổi: ${residentName || `mã ${request.residentId}`}`}</p>
        <ChangeContent content={{ ...request, representativeConfirmation: null }} headingClassName="type-card-title" />
        <p className="type-body">
          {`Ngày hiệu lực dự kiến: ${formatDate(addendum?.effectiveDate ?? request.requestedEffectiveDate)}. Ký muộn hơn ngày này thì phụ lục có hiệu lực từ ngày ký.`}
        </p>
        <div className="mt-8 grid grid-cols-2 gap-8 text-center">
          <div className="flex flex-col gap-16">
            <span className="type-card-title">Đại diện viện</span>
            <span className="type-caption text-muted-foreground">(Ký, ghi rõ họ tên)</span>
          </div>
          <div className="flex flex-col gap-16">
            <span className="type-card-title">Người đại diện của người cao tuổi</span>
            <span className="type-caption text-muted-foreground">(Ký, ghi rõ họ tên, ngày ký)</span>
          </div>
        </div>
      </article>
    </div>
  )
}
