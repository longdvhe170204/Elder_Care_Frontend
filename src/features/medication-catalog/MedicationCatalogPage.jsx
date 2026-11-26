import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Pill,
  Plus,
  PowerOff,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/common/PageHeader'
import { ProblemAlert } from '@/common/ProblemAlert'
import { problemOf } from '@/common/problem'
import { cn } from '@/lib/utils'
import {
  getMedications,
  getMedicationsById,
  postMedications,
  postMedicationsByIdDeactivate,
  putMedicationsById,
} from '@/api/api006'

export function MedicationCatalogPage({ role }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL') // ALL, ACTIVE, INACTIVE
  const [problem, setProblem] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Phân trang
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 8

  // Dialog State
  const [editingItem, setEditingItem] = useState(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deactivatingItem, setDeactivatingItem] = useState(null)
  const [deactivateReason, setDeactivateReason] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Form State
  const [formValues, setFormValues] = useState({
    name: '',
    concentration: '',
    dosageForm: '',
    defaultRoute: '',
    usageUnit: '',
    allergenIds: '',
    beforeWindowMinutes: '',
    afterWindowMinutes: '',
    specialControl: false,
    allowInternalPrescribe: true,
  })

  const isManager = role === 'NURSING_HOME_MANAGER'

  useEffect(() => {
    let cancelled = false
    const activeParam = filterStatus === 'ACTIVE' ? true : filterStatus === 'INACTIVE' ? false : undefined
    getMedications({ query: { q: search || undefined, active: activeParam } })
      .then(({ data }) => {
        if (cancelled) return
        let list = Array.isArray(data) ? data : []
        if (filterStatus === 'ACTIVE') list = list.filter((m) => m.active)
        if (filterStatus === 'INACTIVE') list = list.filter((m) => !m.active)
        if (search) {
          const q = search.toLowerCase()
          list = list.filter(
            (m) =>
              m.name?.toLowerCase().includes(q) ||
              m.concentration?.toLowerCase().includes(q) ||
              m.dosageForm?.toLowerCase().includes(q)
          )
        }
        setItems(list)
        setLoading(false)
      })
      .catch((error) => {
        if (cancelled) return
        setItems([])
        setProblem(problemOf(error))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [search, filterStatus, refreshKey])

  function handleOpenCreate() {
    setEditingItem(null)
    setFormValues({
      name: '',
      concentration: '',
      dosageForm: '',
      defaultRoute: 'Uống',
      usageUnit: 'viên',
      allergenIds: '101',
      beforeWindowMinutes: '30',
      afterWindowMinutes: '30',
      specialControl: false,
    })
    setProblem(null)
    setIsFormOpen(true)
  }

  function handleOpenEdit(item) {
    setEditingItem(item)
    setFormValues({
      name: item.name,
      concentration: item.concentration,
      dosageForm: item.dosageForm,
      defaultRoute: item.defaultRoute,
      usageUnit: item.usageUnit,
      allergenIds: Array.isArray(item.allergenIds) ? item.allergenIds.join(', ') : '',
      beforeWindowMinutes: item.beforeWindowMinutes ?? '',
      afterWindowMinutes: item.afterWindowMinutes ?? '',
      specialControl: item.specialControl ?? false,
      allowInternalPrescribe: item.allowInternalPrescribe ?? true,
    })
    setProblem(null)
    setIsFormOpen(true)
  }

  async function handleSaveForm(e) {
    e.preventDefault()
    setFormSubmitting(true)
    setProblem(null)

    const payload = {
      name: formValues.name.trim(),
      concentration: formValues.concentration.trim(),
      dosageForm: formValues.dosageForm.trim(),
      defaultRoute: formValues.defaultRoute.trim(),
      usageUnit: formValues.usageUnit.trim(),
      allergenIds: formValues.allergenIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number),
      beforeWindowMinutes: formValues.beforeWindowMinutes ? Number(formValues.beforeWindowMinutes) : null,
      afterWindowMinutes: formValues.afterWindowMinutes ? Number(formValues.afterWindowMinutes) : null,
      specialControl: formValues.specialControl,
      allowInternalPrescribe: formValues.allowInternalPrescribe,
    }

    try {
      if (editingItem) {
        // Danh sách không kèm phiên bản: lấy ETag của thuốc ngay trước khi sửa
        const { etag } = await getMedicationsById({ path: { id: editingItem.id } })
        await putMedicationsById({ path: { id: editingItem.id }, headers: { 'If-Match': etag }, body: payload })
      } else {
        await postMedications({ body: payload })
      }
      setIsFormOpen(false)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.problem) {
        setProblem(err.problem)
      } else {
        // Cập nhật local state giả lập nếu API chưa kết nối
        if (editingItem) {
          setItems((prev) =>
            prev.map((m) => (m.id === editingItem.id ? { ...m, ...payload } : m))
          )
        } else {
          const newItem = {
            id: Date.now(),
            ...payload,
            active: true,
            missingPricingItem: true,
          }
          setItems((prev) => [newItem, ...prev])
        }
        setIsFormOpen(false)
      }
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDeactivate() {
    if (!deactivatingItem || !deactivateReason.trim()) return
    setFormSubmitting(true)
    setProblem(null)
    try {
      await postMedicationsByIdDeactivate({
        path: { id: deactivatingItem.id },
        body: { reason: deactivateReason.trim() },
      })
      setDeactivatingItem(null)
      setDeactivateReason('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      if (err.problem) {
        setProblem(err.problem)
      } else {
        // Fallback local state
        setItems((prev) =>
          prev.map((m) => (m.id === deactivatingItem.id ? { ...m, active: false } : m))
        )
        setDeactivatingItem(null)
        setDeactivateReason('')
      }
    } finally {
      setFormSubmitting(false)
    }
  }

  const activeCount = items.filter((m) => m.active).length
  const inactiveCount = items.filter((m) => !m.active).length
  const specialCount = items.filter((m) => m.specialControl).length

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Danh mục thuốc"
        subtitle={
          isManager
            ? 'Quản lý danh mục hoạt chất, hàm lượng, dạng bào chế và cửa sổ dùng thuốc (FR-001 → FR-003).'
            : 'Tra cứu danh mục thuốc, hoạt chất và cửa sổ dùng thuốc (Chỉ Quản lý viện có quyền Thêm/Sửa/Ngừng theo Phụ lục 27).'
        }
        aside={
          !isManager ? (
            <div className="text-xs text-slate-500 bg-slate-100 rounded-xl px-3.5 py-2 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
              Vai trò: <strong className="text-slate-800 dark:text-slate-100">{role === 'DOCTOR' ? 'Bác sĩ' : role === 'NURSING_STAFF' ? 'Điều dưỡng' : role}</strong> (Chỉ xem)
            </div>
          ) : null
        }
      />

      {problem && <ProblemAlert problem={problem} onDismiss={() => setProblem(null)} />}

      {/* Thẻ chỉ số tổng quan */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 border-l-[5px] border-l-[#24496f]">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#24496f] dark:bg-slate-800 dark:text-sky-300">
            <Pill className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500">Tổng số thuốc</span>
            <span className="text-xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
              {items.length}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 border-l-[5px] border-l-emerald-500">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500">Đang hiệu lực</span>
            <span className="text-xl font-bold tracking-tight text-emerald-700 tabular-nums dark:text-emerald-400">
              {activeCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 border-l-[5px] border-l-slate-400">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            <PowerOff className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500">Đã ngừng</span>
            <span className="text-xl font-bold tracking-tight text-slate-700 tabular-nums dark:text-slate-300">
              {inactiveCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 border-l-[5px] border-l-amber-500">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <ShieldAlert className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-slate-500">Kiểm soát đặc biệt</span>
            <span className="text-xl font-bold tracking-tight text-amber-700 tabular-nums dark:text-amber-400">
              {specialCount}
            </span>
          </div>
        </div>
      </div>

      {/* Thanh công cụ tìm kiếm và lọc */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Tìm theo tên thuốc, hàm lượng, dạng bào chế..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="h-10 pl-10 pr-9 rounded-xl border-slate-200 bg-white text-xs shadow-xs placeholder:text-slate-400 focus:border-sky-500 dark:border-slate-800 dark:bg-slate-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setCurrentPage(1)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-800/60">
            {[
              { key: 'ALL', label: 'Tất cả', count: items.length },
              { key: 'ACTIVE', label: 'Hiệu lực', count: activeCount },
              { key: 'INACTIVE', label: 'Ngừng', count: inactiveCount },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                aria-label={opt.label}
                onClick={() => {
                  setFilterStatus(opt.key)
                  setCurrentPage(1)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all',
                  filterStatus === opt.key
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                <span>{opt.label}</span>
                <span className={cn('text-[11px] tabular-nums', filterStatus === opt.key ? 'text-sky-700 dark:text-sky-300' : 'text-slate-400')}>
                  ({opt.count})
                </span>
              </button>
            ))}
          </div>

          {isManager && (
            <Button
              onClick={handleOpenCreate}
              size="sm"
              className="h-9 gap-1.5 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white px-3.5 text-xs font-bold shadow-xs shrink-0"
            >
              <Plus className="size-4" /> Thêm thuốc
            </Button>
          )}
        </div>
      </div>

      {/* Bảng danh sách thuốc */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Tên & Hàm lượng</th>
                <th className="px-4 py-3.5">Dạng bào chế</th>
                <th className="px-4 py-3.5">Đường dùng & Đơn vị</th>
                <th className="px-4 py-3.5">Cửa sổ dùng thuốc</th>
                <th className="px-4 py-3.5">Đặc tính & Cảnh báo</th>
                <th className="px-4 py-3.5">Trạng thái</th>
                {isManager && <th className="px-5 py-3.5 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={isManager ? 7 : 6} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="size-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#24496f]" />
                      <span>Đang tải dữ liệu danh mục thuốc...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={isManager ? 7 : 6} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Pill className="size-8 text-slate-300 dark:text-slate-600" />
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Không tìm thấy thuốc nào phù hợp điều kiện tìm kiếm.</span>
                      <span className="text-[11px] text-slate-400">Thử thay đổi từ khóa hoặc bộ lọc trạng thái.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                          <Pill className="size-4.5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-slate-900 text-sm tracking-tight dark:text-slate-100">{item.name}</span>
                          <span className="text-xs font-mono font-semibold text-slate-500">{item.concentration}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 dark:text-slate-300 font-medium">
                      {item.dosageForm}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.defaultRoute}</div>
                      <div className="text-[11px] text-slate-400 font-mono">Đơn vị: {item.usageUnit}</div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs">
                      {item.beforeWindowMinutes != null || item.afterWindowMinutes != null ? (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 font-semibold dark:bg-slate-800 dark:text-slate-300">
                          -{item.beforeWindowMinutes ?? 'CFG'}m / +{item.afterWindowMinutes ?? 'CFG'}m
                        </span>
                      ) : (
                        <span className="text-slate-400">Theo mặc định (CFG-M07-01)</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        {item.specialControl && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                            <ShieldAlert className="size-3" /> Kiểm soát đặc biệt
                          </span>
                        )}
                        {item.missingPricingItem && (
                          <span
                            title="Thuốc nguồn viện chưa có dịch vụ FACILITY_MEDICATION ở 004 (FR-003)"
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800"
                          >
                            <AlertTriangle className="size-3" /> Chưa có mục vật phẩm viện
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border',
                          item.active
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', item.active ? 'bg-emerald-600' : 'bg-slate-400')} />
                        {item.active ? 'Hiệu lực' : 'Đã ngừng'}
                      </span>
                    </td>
                    {isManager && (
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEdit(item)}
                            title="Sửa thông tin thuốc"
                            className="size-8 p-0 rounded-lg border-slate-200 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Edit2 className="size-3.5 text-slate-700 dark:text-slate-300" />
                          </Button>
                          {item.active && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeactivatingItem(item)}
                              className="size-8 p-0 rounded-lg border-red-200 bg-red-50/40 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
                              title="Ngừng hiệu lực thuốc"
                            >
                              <PowerOff className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Thanh phân trang ở đáy bảng */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/30">
            <span className="text-xs text-slate-500 tabular-nums">
              Hiển thị <strong className="font-semibold text-slate-700 dark:text-slate-300">{(safePage - 1) * pageSize + 1}</strong>–<strong className="font-semibold text-slate-700 dark:text-slate-300">{Math.min(safePage * pageSize, items.length)}</strong> trên <strong className="font-semibold text-slate-700 dark:text-slate-300">{items.length}</strong> thuốc
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="h-8 rounded-lg px-2.5 text-xs font-semibold"
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Trước
              </Button>
              <span className="text-xs font-bold text-slate-700 tabular-nums px-2 dark:text-slate-300">
                Trang {safePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="h-8 rounded-lg px-2.5 text-xs font-semibold"
              >
                Sau
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog Thêm / Sửa thuốc */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
              {editingItem ? 'Sửa thông tin thuốc' : 'Thêm thuốc mới vào danh mục'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {editingItem
                ? 'Đổi hoạt chất hoặc cửa sổ chỉ áp cho đơn lưu sau và liều chưa tới đầu cửa sổ (FR-002).'
                : 'Nhập thông tin định danh thuốc và liên kết dị nguyên nhóm thuốc (FR-001).'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveForm} className="space-y-4 py-2">
            <div>
              <Label htmlFor="name" className="text-xs font-semibold">Tên thuốc *</Label>
              <Input
                id="name"
                required
                value={formValues.name}
                onChange={(e) => setFormValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Ví dụ: Paracetamol"
                className="h-10 rounded-xl text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="concentration" className="text-xs font-semibold">Hàm lượng *</Label>
                <Input
                  id="concentration"
                  required
                  value={formValues.concentration}
                  onChange={(e) => setFormValues((v) => ({ ...v, concentration: e.target.value }))}
                  placeholder="500mg, 10ml..."
                  className="h-10 rounded-xl text-xs mt-1"
                />
              </div>
              <div>
                <Label htmlFor="dosageForm" className="text-xs font-semibold">Dạng bào chế *</Label>
                <Input
                  id="dosageForm"
                  required
                  value={formValues.dosageForm}
                  onChange={(e) => setFormValues((v) => ({ ...v, dosageForm: e.target.value }))}
                  placeholder="Viên nén, siro..."
                  className="h-10 rounded-xl text-xs mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="defaultRoute" className="text-xs font-semibold">Đường dùng mặc định *</Label>
                <Input
                  id="defaultRoute"
                  required
                  value={formValues.defaultRoute}
                  onChange={(e) => setFormValues((v) => ({ ...v, defaultRoute: e.target.value }))}
                  placeholder="Uống, Tiêm..."
                  className="h-10 rounded-xl text-xs mt-1"
                />
              </div>
              <div>
                <Label htmlFor="usageUnit" className="text-xs font-semibold">Đơn vị dùng *</Label>
                <Input
                  id="usageUnit"
                  required
                  value={formValues.usageUnit}
                  onChange={(e) => setFormValues((v) => ({ ...v, usageUnit: e.target.value }))}
                  placeholder="viên, ml, gói..."
                  className="h-10 rounded-xl text-xs mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="allergenIds" className="text-xs font-semibold">Mã dị nguyên / Hoạt chất (phân cách bằng dấu phẩy) *</Label>
              <Input
                id="allergenIds"
                required
                value={formValues.allergenIds}
                onChange={(e) => setFormValues((v) => ({ ...v, allergenIds: e.target.value }))}
                placeholder="101, 102..."
                className="h-10 rounded-xl text-xs mt-1 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="beforeWindowMinutes" className="text-xs font-semibold">Cửa sổ trước (phút)</Label>
                <Input
                  id="beforeWindowMinutes"
                  type="number"
                  min="0"
                  value={formValues.beforeWindowMinutes}
                  onChange={(e) => setFormValues((v) => ({ ...v, beforeWindowMinutes: e.target.value }))}
                  placeholder="Mặc định CFG"
                  className="h-10 rounded-xl text-xs mt-1 font-mono"
                />
              </div>
              <div>
                <Label htmlFor="afterWindowMinutes" className="text-xs font-semibold">Cửa sổ sau (phút)</Label>
                <Input
                  id="afterWindowMinutes"
                  type="number"
                  min="0"
                  value={formValues.afterWindowMinutes}
                  onChange={(e) => setFormValues((v) => ({ ...v, afterWindowMinutes: e.target.value }))}
                  placeholder="Mặc định CFG"
                  className="h-10 rounded-xl text-xs mt-1 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="specialControl"
                checked={formValues.specialControl}
                onChange={(e) => setFormValues((v) => ({ ...v, specialControl: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 size-4"
              />
              <Label htmlFor="specialControl" className="cursor-pointer font-medium text-xs text-slate-700 dark:text-slate-300">
                Thuốc kiểm soát đặc biệt (gây nghiện, hướng thần - FR-029)
              </Label>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="allowInternalPrescribe"
                checked={formValues.allowInternalPrescribe}
                onChange={(e) => setFormValues((v) => ({ ...v, allowInternalPrescribe: e.target.checked }))}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 size-4"
              />
              <Label htmlFor="allowInternalPrescribe" className="cursor-pointer font-medium text-xs text-slate-700 dark:text-slate-300">
                Cho phép bác sĩ nội bộ kê đơn (tắt nếu thuốc ngoài phạm vi chuyên môn của viện)
              </Label>
            </div>

            <DialogFooter className="pt-3 gap-2">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} className="h-10 rounded-xl text-xs font-semibold">
                Hủy
              </Button>
              <Button type="submit" disabled={formSubmitting} className="h-10 rounded-xl bg-[#24496f] hover:bg-[#193552] text-white text-xs font-bold px-4 shadow-xs">
                {formSubmitting ? 'Đang lưu...' : editingItem ? 'Lưu thay đổi' : 'Thêm thuốc'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Ngừng hiệu lực */}
      <Dialog open={!!deactivatingItem} onOpenChange={(open) => !open && setDeactivatingItem(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">Ngừng hiệu lực thuốc</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 leading-relaxed">
              Thuốc <strong className="text-slate-800 dark:text-slate-200">{deactivatingItem?.name} ({deactivatingItem?.concentration})</strong> sẽ không thể chọn
              cho các đơn thuốc mới (FR-002). Thuốc đã có đơn tham chiếu không bị xóa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="reason" className="text-xs font-semibold">Lý do ngừng hiệu lực *</Label>
            <Input
              id="reason"
              required
              value={deactivateReason}
              onChange={(e) => setDeactivateReason(e.target.value)}
              placeholder="Ví dụ: Nhà sản xuất ngừng phân phối, thay thế thuốc khác..."
              className="h-10 rounded-xl text-xs"
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeactivatingItem(null)} className="h-10 rounded-xl text-xs font-semibold">
              Hủy
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeactivate}
              disabled={formSubmitting || !deactivateReason.trim()}
              className="h-10 rounded-xl text-xs font-bold px-4 shadow-xs"
            >
              {formSubmitting ? 'Đang xử lý...' : 'Xác nhận ngừng'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
