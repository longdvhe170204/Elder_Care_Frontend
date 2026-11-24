import { getBelongingsById, getBelongingsHandoversById, getRecipientConfirmations } from '@/api'

// Trang mở bản ghi nguồn của thông báo đồ gửi (013; hoàn thiện BF-14, 2026-11-23). Chỉ dùng khi backend trả
// sourceRecord.canOpen (009 SourceRecordAccessPort). resolve(id) trả [trang, tham số] cho onNavigate của màn nhân viên.

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
