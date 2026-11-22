// "Lịch chăm sóc hằng ngày" (012 FR-076, Q-416): nhãn trạng thái rút gọn và giờ hiển thị theo Asia/Ho_Chi_Minh.
export const TASK_STATUS = { DONE: 'Hoàn thành', NOT_DONE: 'Chưa hoàn thành', NOT_PERFORMED: 'Không thực hiện' }

const TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export const formatTime = (iso) => TIME.format(new Date(iso))

export const todayInVietnam = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
