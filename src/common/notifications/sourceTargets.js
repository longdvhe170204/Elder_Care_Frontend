import { getBelongingsById, getBelongingsHandoversById, getRecipientConfirmations } from '@/api'

// Trang mở bản ghi nguồn của thông báo đồ gửi (013; hoàn thiện BF-14, 2026-11-23). Chỉ dùng khi backend trả
// sourceRecord.canOpen (009 SourceRecordAccessPort). resolve(id) trả [trang, tham số] cho onNavigate của màn nhân viên.

// Nguồn mở thẳng được trên màn nhân viên khi nơi dùng truyền onNavigate: [màn, tên tham số mã, nhãn nút] (004 BF-08 sửa
// đổi, W12: yêu cầu thay đổi lưu trú, hồ sơ người cao tuổi; demo 2026-11-25: nhắc hợp đồng). Dùng ở chi tiết thông báo
// và ở "Việc gửi tới bạn" của Tổng quan.
export const SOURCE_PAGES = {
  'M02.RESIDENCY_CHANGE': ['residency-changes', 'id', 'Mở yêu cầu điều chỉnh hợp đồng'],
  'M01.RESIDENT': ['residents', 'residentId', 'Mở hồ sơ người cao tuổi'],
  'M02.CONTRACT_EXPIRING': ['contracts', 'contractId', 'Mở hợp đồng'],
  'M02.SHORT_TERM_CONTRACT': ['contracts', 'contractId', 'Mở hợp đồng'],
  'M02.CONTRACT_OVERDUE': ['contracts', 'contractId', 'Mở hợp đồng'],
  // Demo 2026-11-26 (E): luồng kết thúc lưu trú; phần tử thứ tư là tham số thêm của màn đích
  'M15.APPROVAL_REQUEST': ['approval-requests', 'requestId', 'Mở yêu cầu phê duyệt'],
  'M11.BALANCE': ['balance', 'residentId', 'Mở số dư của người cao tuổi', { focus: 'resident' }],
  'M11.COST_STATEMENT': ['charges', 'statementId', 'Mở bảng chi phí'],
  'M02.RESIDENCY_ENDING': ['residency-endings', 'endingId', 'Mở hồ sơ kết thúc lưu trú'],
}

// [màn, tham số] để mở bản ghi nguồn của thông báo; null khi nguồn chưa mở thẳng được
export function sourceNavigation(record) {
  const target = record?.id ? SOURCE_PAGES[record.type] : null
  if (!target) return null
  const [page, param, , extra] = target
  return [page, { [param]: Number(record.id), ...extra }]
}

const ALL_CONFIRMATION_STATUSES = 'PENDING_CONFIRMATION,EFFECTIVE,REJECTED,CANCELLED,USED,EXPIRED'

export const SOURCE_TARGETS = {
  'M12.BELONGING_HANDOVER': {
    label: 'Mở đồ gửi',
    resolve: async (id) => {
      const { data } = await getBelongingsHandoversById({ path: { id: Number(id) } })
      return ['belongings', { residentId: data.residentId, belongingId: data.belongingId }]
    },
  },
  'M12.BELONGING': {
    label: 'Mở đồ gửi',
    resolve: async (id) => {
      const { data } = await getBelongingsById({ path: { id: Number(id) } })
      return ['belongings', { residentId: data.belonging.residentId, belongingId: Number(id) }]
    },
  },
  'M12.BELONGING_RESIDENT': {
    label: 'Mở đồ gửi của người cao tuổi',
    resolve: async (id) => ['belongings', { residentId: Number(id) }],
  },
  'M12.RECIPIENT_CONFIRMATION': {
    label: 'Mở đồ gửi của người cao tuổi',
    resolve: async (id) => {
      const { data } = await getRecipientConfirmations({ query: { status: ALL_CONFIRMATION_STATUSES } })
      const found = (data ?? []).find((c) => c.id === Number(id))
      if (!found) throw new Error('Không tìm thấy yêu cầu xác nhận người nhận')
      return ['belongings', { residentId: found.residentId }]
    },
  },
  'M12.STAFF_HELD_BELONGINGS': {
    label: 'Mở đồ nhân viên đang giữ',
    resolve: async (id) => ['belongings', { tab: 'held', staffId: Number(id) }],
  },
  'M12.INVENTORY_CHECK': {
    label: 'Mở phiếu kiểm kê',
    resolve: async (id) => ['belongings', { tab: 'inventory', checkId: Number(id) }],
  },
  'M12.INVENTORY_PERIOD': {
    label: 'Mở kiểm kê',
    resolve: async () => ['belongings', { tab: 'inventory' }],
  },
  'M12.STORAGE_LOCATION': {
    label: 'Mở kiểm kê',
    resolve: async () => ['belongings', { tab: 'inventory' }],
  },
}
