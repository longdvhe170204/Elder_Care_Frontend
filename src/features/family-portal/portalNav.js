// Mục ở "Thêm" của cổng người thân; chỉ hiện khi người xem có quyền (012 FR-046, FR-046b, FR-049).
// Bản mẫu đọc quyền từ dữ liệu minh họa; quyền thật do backend trả.
export const MORE_ITEMS = [
  // Q-416: mọi người thân có quan hệ Hiệu lực; giá trị đo chỉ khi có quyền xem sức khỏe (012 FR-076)
  { key: 'care-schedule', label: 'Lịch chăm sóc hằng ngày', allowed: () => true },
  { key: 'health', label: 'Sức khỏe', allowed: (v) => v.perms.health },
  { key: 'costs', label: 'Chi phí, số dư', allowed: (v) => v.perms.costs },
  { key: 'feedback', label: 'Phản hồi', allowed: () => true },
  { key: 'deposits', label: 'Đồ gửi', allowed: (v) => v.representative || v.perms.pickup },
  { key: 'contract', label: 'Hợp đồng, dịch vụ', allowed: (v) => v.representative },
  { key: 'account', label: 'Tài khoản, quyền của tôi', allowed: () => true },
  // Test BF-12 (2026-11-24, 012 FR-014, FR-050): mọi người thân; người đại diện thấy cả gia đình, người khác chỉ thấy mình
  { key: 'family-rights', label: 'Gia đình và quyền', allowed: () => true },
]

export function allowedPage(page, viewer) {
  const item = MORE_ITEMS.find((i) => i.key === page)
  return !item || item.allowed(viewer)
}
