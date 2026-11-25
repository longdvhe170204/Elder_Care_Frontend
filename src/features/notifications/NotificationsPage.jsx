import { useState } from 'react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DetailLayout } from '@/common/DetailLayout'
import { PageHeader } from '@/common/PageHeader'
import { DeliveryErrors } from './DeliveryErrors'
import { DirectContacts } from './DirectContacts'
import { NotificationChannels } from './NotificationChannels'
import { NotificationHistory } from './NotificationHistory'
import { NotificationInbox } from './NotificationInbox'
import { NotificationDetail } from '@/common/notifications/NotificationDetail'

const noop = () => {}

// Mục menu "Thông báo" (009 T035, T028; bố cục duyệt 2026-10-23, DESIGN.md 5.19.0). Tab theo bảng quyền FR-039 của spec
// 009 (Phụ lục 27 không có dòng thông báo): chỉ để hiển thị, backend vẫn kiểm từng lệnh và trả 403.
// Chi tiết của tab mở trong DetailLayout ở cấp màn để khung cao hết màn (DESIGN.md 5); đổi tab thì đóng khung.

const QL = 'NURSING_HOME_MANAGER'
const TT = 'FLOOR_MANAGER'
const HC = 'OFFICE_STAFF'

const TABS = [
  { value: 'inbox', label: 'Hộp thông báo', subtitle: 'Thông báo gửi cho bạn; khẩn cấp chưa xác nhận đứng đầu.' },
  {
    value: 'history',
    label: 'Lịch sử gửi',
    roles: [QL, TT],
    subtitle: 'Mỗi dòng là một người nhận của một yêu cầu, kèm căn cứ và kết quả từng kênh.',
  },
  {
    value: 'errors',
    label: 'Lỗi gửi',
    roles: [QL],
    subtitle: 'Yêu cầu bị từ chối, thiếu mức, không có người nhận, gửi thất bại.',
  },
  {
    value: 'direct-contacts',
    label: 'Liên hệ trực tiếp',
    roles: [QL, HC],
    subtitle: 'Người thân không nhận được thông báo Trung bình qua kênh nào; Hành chính gọi và ghi kết quả.',
  },
  {
    value: 'channels',
    label: 'Kênh',
    roles: [QL],
    subtitle: 'Bật, tắt kênh và gắn kênh khác vào mức; mỗi thay đổi ghi lý do.',
  },
]

// notificationId: mở thẳng chi tiết một thông báo (từ "Việc gửi tới bạn" của Tổng quan; demo 2026-11-25)
export function NotificationsPage({ role, onNavigate, notificationId = null }) {
  const tabs = TABS.filter((t) => !t.roles || t.roles.includes(role))
  const [tab, setTab] = useState('inbox')
  const closeDetail = () => setDetail(null)
  const [detail, setDetail] = useState(() =>
    notificationId
      ? {
          key: `notification-${notificationId}`,
          label: 'Chi tiết thông báo',
          render: (titles) => (
            <NotificationDetail
              id={notificationId}
              onOpened={noop}
              onHidden={() => setDetail(null)}
              onNavigate={onNavigate}
              {...titles}
            />
          ),
        }
      : null,
  )
  const current = tabs.find((t) => t.value === tab) ?? tabs[0]

  return (
    <DetailLayout
      open={detail !== null}
      detailKey={detail?.key}
      onClose={closeDetail}
      label={detail?.label}
      renderDetail={(titles) => detail.render(titles)}
    >
      <PageHeader title="Thông báo" subtitle={current.subtitle}>
        {tabs.length > 1 && (
          <ToggleGroup
            variant="outline"
            value={[current.value]}
            onValueChange={(next) => {
              if (!next[0]) return
              setTab(next[0])
              setDetail(null)
            }}
            className="flex-wrap self-start"
          >
            {tabs.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} className="h-10 px-4">
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </PageHeader>
      {current.value === 'inbox' && (
        <NotificationInbox openedKey={detail?.key} onOpen={setDetail} onClose={closeDetail} onNavigate={onNavigate} />
      )}
      {current.value === 'history' && <NotificationHistory openedKey={detail?.key} onOpen={setDetail} />}
      {current.value === 'errors' && <DeliveryErrors />}
      {current.value === 'direct-contacts' && <DirectContacts canRecord={role === HC} />}
      {current.value === 'channels' && <NotificationChannels />}
    </DetailLayout>
  )
}
