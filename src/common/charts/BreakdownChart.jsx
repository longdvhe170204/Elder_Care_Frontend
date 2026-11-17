// Biểu đồ có chức năng cho Tổng quan, Báo cáo (chủ dự án duyệt 2026-11-17, đề xuất B; DESIGN.md 5.1 "Biểu đồ"). Chỉ vẽ
// `breakdown` mà api-016 trả, không tự tính chỉ tiêu (Q-306, Q-307):
// - các phần cộng đúng bằng tổng: thanh chồng một hàng (tỷ lệ của tổng), chú thích có tên và số;
// - không cộng đủ (theo tầng, ca, nhân viên…): thanh ngang so sánh, thanh dài nhất là giá trị lớn nhất;
// - một phần, quá MAX_PARTS phần hoặc tổng bằng 0: không vẽ, nơi gọi giữ dạng chữ.
// Màu theo tông trạng thái DESIGN.md 3.5: đỏ chỉ cho việc gấp; giường dùng màu sơ đồ giường; còn lại xanh thương hiệu
// (chỉ đồ họa), xanh chàm, xám. Màu không là tín hiệu duy nhất: mỗi phần luôn có tên và số; có bảng cho trình đọc màn hình.

import { chartKind, toneOf } from './chartRules'

const pct = (n) => `${Math.round(n * 10000) / 100}%`
const NUMBER = new Intl.NumberFormat('vi-VN')

function Swatch({ color }) {
  return (
    <span aria-hidden="true" className="inline-block size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} />
  )
}

function DataTable({ title, rows, labelOf }) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Phần</th>
          <th scope="col">Số</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.key}>
            <th scope="row">{labelOf(b.key)}</th>
            <td>{NUMBER.format(b.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function BreakdownChart({ title, total, breakdown, labelOf = (k) => k }) {
  const kind = chartKind(total, breakdown)
  if (kind === 'none') return null
  const rows = breakdown.filter((b) => typeof b.value === 'number')

  if (kind === 'stack') {
    return (
      <div className="flex w-full flex-col gap-2">
        <div aria-hidden="true" className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded">
          {rows
            .filter((b) => b.value > 0)
            .map((b, i) => (
              <span
                key={b.key}
                className="h-full"
                style={{ width: pct(b.value / total), background: toneOf(b.key, i) }}
              />
            ))}
        </div>
        <ul aria-label={`Chú thích ${title}`} className="flex flex-wrap gap-x-3 gap-y-1">
          {rows.map((b, i) => (
            <li key={b.key} className="inline-flex items-center gap-1.5 type-caption text-muted-foreground">
              <Swatch color={toneOf(b.key, i)} />
              <span>
                {labelOf(b.key)} <span className="tabular-nums text-foreground">{NUMBER.format(b.value)}</span>
              </span>
            </li>
          ))}
        </ul>
        <DataTable title={title} rows={rows} labelOf={labelOf} />
      </div>
    )
  }

  const max = Math.max(...rows.map((b) => b.value))
  return (
    <div className="flex w-full flex-col gap-1.5">
      <ul aria-hidden="true" className="flex flex-col gap-1.5">
        {rows.map((b, i) => (
          <li
            key={b.key}
            className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2 type-caption"
          >
            <span className="truncate text-muted-foreground" title={labelOf(b.key)}>
              {labelOf(b.key)}
            </span>
            <span className="h-2.5 overflow-hidden rounded-[3px] bg-muted">
              <span
                data-testid="breakdown-bar"
                className="block h-full"
                style={{ width: pct(max ? b.value / max : 0), background: toneOf(b.key, i) }}
              />
            </span>
            <span className="tabular-nums text-foreground">{NUMBER.format(b.value)}</span>
          </li>
        ))}
      </ul>
      <DataTable title={title} rows={rows} labelOf={labelOf} />
    </div>
  )
}
