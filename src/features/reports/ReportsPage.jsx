import { useCallback, useEffect, useRef, useState } from 'react'
import { getFloors, getMetricCatalog } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/common/PageHeader'
import { formatDate } from '@/common/dateTime'
import { ExportDialog } from './ExportDialog'
import { ExportList } from './ExportList'
import { MetricCatalogNotice } from './MetricCatalogNotice'
import { MetricDetailSheet } from './MetricDetailSheet'
import { ReportTable } from './ReportTable'
import { CARE_LEVELS, REPORT_GROUPS, isoDate } from './reportLabels'

// Mục menu "Báo cáo" (016; bố cục DESIGN.md 6.17.0): danh sách nhóm báo cáo vai trò thấy (bảng FR-010) và "Lần xuất";
// chọn khoảng, hiện khoảng ngày đang xem (FR-060, tối đa CFG-M14-01, backend từ chối khi dài hơn); nút chính "Xuất file".
// Lọc tầng chỉ có giá trị trong phạm vi (FR-013): báo cáo trả các giá trị, phạm vi toàn viện thì lấy danh mục tầng của 003.

const EXPORTS = 'EXPORTS'
const ALL_FLOORS = 'ALL'
const ALL_CARE_LEVELS = 'ALL'
const PRESETS = [
  { value: 'TODAY', label: 'Hôm nay' },
  { value: 'WEEK', label: '7 ngày qua' },
  { value: 'MONTH', label: 'Tháng này' },
  { value: 'CUSTOM', label: 'Tùy chọn' },
]
const COST_MODES = [
  { value: 'FINALIZED', label: 'Đã chốt' },
  { value: 'PROVISIONAL', label: 'Tạm tính' },
]

// Bộ lọc là ô chọn gốc trên một hàng (bản phác phương án B; DESIGN.md 7.2 "Hàng ô lọc": ô chọn gốc `select`, kiểu
// chung ở lớp base của index.css); nhãn đọc bằng trình đọc màn hình vì giá trị đang chọn đã nói rõ ô lọc gì
function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-auto min-w-36"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function rangeOf(preset, custom) {
  const today = new Date()
  switch (preset) {
    case 'TODAY':
      return { from: isoDate(today), to: isoDate(today) }
    case 'WEEK':
      return { from: isoDate(new Date(today.getTime() - 6 * 86_400_000)), to: isoDate(today) }
    case 'MONTH':
      return { from: `${isoDate(today).slice(0, 8)}01`, to: isoDate(today) }
    default:
      return custom
  }
}

export function ReportsPage({ role, onNavigate }) {
  const groups = REPORT_GROUPS.filter((g) => g.roles.includes(role))
  const [tab, setTab] = useState(groups[0]?.value ?? EXPORTS)
  const [preset, setPreset] = useState('MONTH')
  const [custom, setCustom] = useState(() => rangeOf('MONTH'))
  const [metrics, setMetrics] = useState({})
  const [opened, setOpened] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exports, setExports] = useState(0)
  const [floorAreaId, setFloorAreaId] = useState(null)
  // FR-051: chi phí xem theo bảng đã chốt (mặc định) hoặc tạm tính
  const [costMode, setCostMode] = useState('FINALIZED')
  // FR-060: lọc mức chăm sóc ở nhóm Người cao tuổi (mức hiệu lực tại ngày, mức dự kiến của danh sách chờ)
  const [careLevel, setCareLevel] = useState(null)
  const [filterOptions, setFilterOptions] = useState(null)
  const [catalogFloors, setCatalogFloors] = useState([])
  const facilityWide = filterOptions?.facilityWide === true

  // Danh mục tên, nhóm chỉ tiêu: tải khi mở màn; lỗi (phiên hết hạn, backend khởi động lại, trình duyệt chặn request)
  // thì báo rõ kèm nút Thử lại và thử lại sau mỗi lần tải báo cáo tới khi được, không lặng lẽ hiện mã chỉ tiêu
  const [reportLoads, setReportLoads] = useState(0)
  const [catalogFailed, setCatalogFailed] = useState(false)
  const metricsLoaded = useRef(false)
  const handleFilterOptions = useCallback((options) => {
    setFilterOptions(options)
    setReportLoads((n) => n + 1)
  }, [])

  const loadMetricCatalog = useCallback(() => {
    getMetricCatalog()
      .then(({ data }) => {
        metricsLoaded.current = true
        setMetrics(Object.fromEntries(data.map((m) => [m.code, m])))
        setCatalogFailed(false)
      })
      .catch(() => setCatalogFailed(true))
  }, [])

  useEffect(() => {
    if (!metricsLoaded.current) loadMetricCatalog()
  }, [reportLoads, loadMetricCatalog])

  useEffect(() => {
    if (!facilityWide) return
    getFloors()
      .then(({ data }) => setCatalogFloors(data))
      .catch(() => {})
  }, [facilityWide])

  const current = groups.find((g) => g.value === tab)
  const floors = facilityWide ? catalogFloors : (filterOptions?.floorAreas ?? [])
  const floor = floors.find((f) => f.id === floorAreaId)
  const range = rangeOf(preset, custom)
  const validRange = range.from && range.to && range.from <= range.to

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
      <PageHeader
        title={current ? `Báo cáo ${current.label.toLowerCase()}` : 'Lần xuất báo cáo'}
        subtitle={
          current
            ? 'Số liệu trong phạm vi của bạn theo khoảng đã chọn.'
            : 'Các lần xuất file; Quản lý viện thấy mọi lần, người khác thấy lần của mình.'
        }
        aside={
          current && (
            <Button disabled={!validRange} onClick={() => setExporting(true)}>
              Xuất file
            </Button>
          )
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[12rem_minmax(0,1fr)]">
        {/* DESIGN.md 6.17.0: danh sách nhóm báo cáo dọc từ 1024px, hẹp hơn là tab gạch chân cuộn ngang */}
        <nav aria-label="Nhóm báo cáo" className="-mx-1 overflow-x-auto lg:mx-0 lg:overflow-visible">
          <ul className="flex gap-1 border-b px-1 lg:flex-col lg:border-b-0 lg:px-0">
            {[...groups, { value: EXPORTS, label: 'Lần xuất' }].map((g) => {
              const selected = g.value === tab
              return (
                <li key={g.value} className={g.value === EXPORTS ? 'lg:mt-2 lg:border-t lg:pt-2' : undefined}>
                  <button
                    type="button"
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => {
                      setTab(g.value)
                      setFloorAreaId(null)
                      setCareLevel(null)
                    }}
                    className={`min-h-11 w-full whitespace-nowrap px-3 text-left type-label focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:rounded-lg ${
                      selected
                        ? 'border-b-2 border-primary text-foreground lg:border lg:border-border lg:bg-card'
                        : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground lg:border lg:border-transparent lg:hover:bg-card'
                    }`}
                  >
                    {g.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          {current && (
            <div className="flex flex-wrap items-end gap-3">
              <FilterSelect label="Khoảng thời gian" value={preset} onChange={setPreset} options={PRESETS} />
              {validRange && (
                <span className="flex h-10 items-center type-body-sm text-muted-foreground">
                  {`${formatDate(range.from).slice(0, 5)} → ${formatDate(range.to)}`}
                </span>
              )}
              {floors.length > 1 && (
                <FilterSelect
                  label="Tầng"
                  value={floorAreaId === null ? ALL_FLOORS : String(floorAreaId)}
                  onChange={(next) => setFloorAreaId(next === ALL_FLOORS ? null : Number(next))}
                  options={[
                    { value: ALL_FLOORS, label: 'Mọi tầng' },
                    ...floors.map((f) => ({ value: String(f.id), label: f.name })),
                  ]}
                />
              )}
              {current.value === 'RESIDENTS' && (
                <FilterSelect
                  label="Mức chăm sóc"
                  value={careLevel ?? ALL_CARE_LEVELS}
                  onChange={(next) => setCareLevel(next === ALL_CARE_LEVELS ? null : next)}
                  options={[{ value: ALL_CARE_LEVELS, label: 'Mọi mức chăm sóc' }, ...CARE_LEVELS]}
                />
              )}
              {current.value === 'INCURRED_COSTS' && (
                <FilterSelect label="Chế độ chi phí" value={costMode} onChange={setCostMode} options={COST_MODES} />
              )}
              {preset === 'CUSTOM' && (
                <>
                  <Field className="w-auto">
                    <FieldLabel htmlFor="report-from">Từ ngày</FieldLabel>
                    <Input
                      id="report-from"
                      type="date"
                      value={custom.from}
                      onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                    />
                  </Field>
                  <Field className="w-auto">
                    <FieldLabel htmlFor="report-to">Đến ngày</FieldLabel>
                    <Input
                      id="report-to"
                      type="date"
                      value={custom.to}
                      onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                    />
                  </Field>
                </>
              )}
            </div>
          )}
          {current && catalogFailed && <MetricCatalogNotice onRetry={loadMetricCatalog} />}
          {current && validRange && (
            <ReportTable
              key={`${current.value}|${range.from}|${range.to}|${floorAreaId ?? ''}|${costMode}|${careLevel ?? ''}`}
              group={current.value}
              from={range.from}
              to={range.to}
              floorAreaId={floorAreaId ?? undefined}
              costMode={current.value === 'INCURRED_COSTS' ? costMode : undefined}
              careLevel={careLevel ?? undefined}
              floors={floors}
              metrics={metrics}
              onOpen={setOpened}
              onFilterOptions={handleFilterOptions}
            />
          )}
          {current && !validRange && (
            <section className="rounded-2xl border bg-card p-4 md:p-5">
              <p className="type-body">Chọn ngày bắt đầu không sau ngày kết thúc.</p>
            </section>
          )}
          {!current && <ExportList version={exports} />}
        </div>
      </div>
      {current && (
        <ExportDialog
          open={exporting}
          onOpenChange={setExporting}
          group={current.value}
          groupLabel={current.label}
          from={range.from}
          to={range.to}
          floorAreaId={floorAreaId ?? undefined}
          floorName={floor?.name}
          costMode={current.value === 'INCURRED_COSTS' ? costMode : undefined}
          careLevel={careLevel ?? undefined}
          canIdentify={role === 'NURSING_HOME_MANAGER'}
          onExported={() => setExports((n) => n + 1)}
        />
      )}
      <MetricDetailSheet opened={opened} onClose={() => setOpened(null)} onNavigate={onNavigate} />
    </div>
  )
}
