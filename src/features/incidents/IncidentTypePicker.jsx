import {
  Activity,
  Bandage,
  BellRing,
  Biohazard,
  CircleAlert,
  ClockAlert,
  HandHelping,
  HeartPulse,
  MapPin,
  PackageOpen,
  PackageX,
  PersonStanding,
  Pill,
  Stethoscope,
  Users,
  Utensils,
  Wind,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LEVEL_LABEL } from './incidentView'

// Biểu tượng theo mã loại của danh mục M05.INCIDENT_TYPE; loại Quản lý viện thêm sau dùng biểu tượng chung
const TYPE_ICON = {
  FALL: PersonStanding,
  BREATHING_OR_CONSCIOUSNESS: HeartPulse,
  CHOKING_OR_AIRWAY_OBSTRUCTION: Wind,
  MEDICATION: Pill,
  BEHAVIOR: Users,
  MISSING_OR_NOT_RETURNED: MapPin,
  WRONG_MEAL_SERVED: Utensils,
  OTHER_INJURY: Bandage,
  OTHER_HEALTH_CARE: Stethoscope,
  SUSPECTED_INFECTION: Biohazard,
  BELONGINGS_LOST: PackageX,
  BELONGINGS_DAMAGED: PackageOpen,
  FACILITY: Wrench,
  // Cảnh báo không mang mã loại sự cố: SOS do người cao tuổi bấm, yêu cầu hỗ trợ do nhân viên gửi, việc quá hạn, chỉ số, thuốc
  RESIDENT_HELP_REQUEST: BellRing,
  STAFF_ASSIST_REQUEST: HandHelping,
  OVERDUE_CARE_TASK: ClockAlert,
  CHI_SO: Activity,
  CRITICAL_CONDITION: HeartPulse,
  BO_LO_LIEU: Pill,
  CHUA_DOI_CHIEU: Pill,
}
// Loại hay gặp lên đầu theo thứ tự cố định; loại "khác" xuống cuối, đứng sau dòng "Không có loại phù hợp?"
const COMMON_TYPE_CODES = [
  'FALL',
  'BREATHING_OR_CONSCIOUSNESS',
  'CHOKING_OR_AIRWAY_OBSTRUCTION',
  'MEDICATION',
  'BEHAVIOR',
  'MISSING_OR_NOT_RETURNED',
  'WRONG_MEAL_SERVED',
]
// Loại sự cố chia hai nhóm theo cờ nonHealth của danh mục: liên quan sức khỏe, chăm sóc và việc khác (đồ gửi, cơ sở vật chất)
const TYPE_SECTIONS = [
  ['Sức khỏe, chăm sóc', false],
  ['Việc khác', true],
]
const isOtherType = (t) => /^OTHER/.test(t.code ?? '')

function orderedTypes(list) {
  const rank = (t) => {
    const i = COMMON_TYPE_CODES.indexOf(t.code)
    return i < 0 ? COMMON_TYPE_CODES.length : i
  }
  return list.toSorted((a, b) => rank(a) - rank(b))
}

export function IncidentTypeIcon({ code, className }) {
  const Icon = TYPE_ICON[code] ?? CircleAlert
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground',
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  )
}

// Chọn loại sự cố bằng ô biểu tượng kèm tên (dùng chung cho Ghi nhận sự cố, Tạo cảnh báo, Chuyển thành sự cố): chọn xong
// thu gọn thành một dòng, "Đổi loại" mở lại lưới. Loại đã ngừng dùng không hiện.
// showDefaultLevel = false khi mức của sự cố không theo loại (chuyển từ cảnh báo lấy mức của cảnh báo)
export function IncidentTypePicker({ types, value, onChange, showDefaultLevel = true }) {
  const usable = types.filter((t) => t.active !== false && t.status !== 'INACTIVE')
  const picked = usable.find((t) => String(t.id) === value)

  if (picked) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
        <IncidentTypeIcon code={picked.code} className="size-9" />
        <span className="flex-1 type-label">
          {picked.name}
          {showDefaultLevel && picked.defaultLevel && (
            <span className="ml-2 type-caption font-normal text-muted-foreground">
              mặc định {LEVEL_LABEL[picked.defaultLevel].toLowerCase()}
            </span>
          )}
        </span>
        <Button type="button" variant="ghost" className="h-11" onClick={() => onChange('')}>
          Đổi loại
        </Button>
      </div>
    )
  }

  const tiles = (list) => (
    <div className="grid grid-cols-2 gap-3 @lg:grid-cols-3 @2xl:grid-cols-4">
      {list.map((t) => (
        <Button
          key={t.id}
          type="button"
          variant="outline"
          className="h-auto min-h-28 flex-col justify-start gap-2 rounded-lg bg-card px-2 py-3 text-center whitespace-normal"
          onClick={() => onChange(String(t.id))}
        >
          <IncidentTypeIcon code={t.code} />
          <span>{t.name}</span>
        </Button>
      ))}
    </div>
  )

  return (
    <div className="@container flex flex-col gap-4">
      {TYPE_SECTIONS.map(([label, nonHealth]) => {
        const inSection = orderedTypes(usable.filter((t) => !!t.nonHealth === nonHealth))
        if (inSection.length === 0) return null
        const common = inSection.filter((t) => !isOtherType(t))
        const others = inSection.filter(isOtherType)
        return (
          <section key={label} aria-label={label} className="flex flex-col gap-2">
            <h4 className="type-caption text-muted-foreground">{label}</h4>
            {common.length > 0 && tiles(common)}
            {others.length > 0 && (
              <>
                <p className="type-caption text-muted-foreground">Không có loại phù hợp?</p>
                {tiles(others)}
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
