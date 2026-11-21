import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { AssignmentPanel } from './AssignmentPanel'

let api
const shift = {
  id: 20,
  status: 'DRAFT',
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-11-01T08:00:00Z',
  staff: [{ staffId: 10 }],
  allowedCommands: ['createAssignment', 'copyAssignments', 'deleteAssignment'],
}
const scope = { scopeType: 'FLOOR', scopeId: 2 }
const places = { FLOOR: { 2: 'Tầng 2' }, AREA: {} }
beforeEach(() => {
  api = mockRoutes()
  api.on('GET', '/shifts/20/assignments', json(200, []))
  api.on(
    'GET',
    '/residents',
    json(200, {
      items: [
        { id: 5, personalInfo: { fullName: '[Người cao tuổi kiểm thử 5]' } },
        { id: 6, personalInfo: { fullName: '[Người cao tuổi kiểm thử 6]' } },
      ],
      nextCursor: null,
    }),
  )
  api.on('GET', '/rooms', json(200, [{ id: 31, code: 'P201', name: 'Phòng 201' }]))
  api.on('GET', '/task-types', json(200, [{ id: 7, name: 'Hỗ trợ uống nước', status: 'ACTIVE' }]))
})

async function pickResident(id) {
  fireEvent.change(screen.getByLabelText('Đối tượng phân công'), { target: { value: 'RESIDENT' } })
  const target = screen.getByLabelText('Đối tượng cụ thể')
  await within(target).findByRole('option', { name: `[Người cao tuổi kiểm thử ${id}]` })
  fireEvent.change(target, { target: { value: String(id) } })
}
afterEach(() => vi.unstubAllGlobals())

it('FR_031_xemCanhBaoTruocLuu_vaDoiDuLieuThiPhaiXemLai', async () => {
  api.on(
    'POST',
    '/shifts/20/assignments/preview',
    json(200, {
      warnings: [
        {
          code: 'TASK_TYPE_REQUIREMENTS_NOT_MET',
          description: 'Chưa đủ chứng chỉ cho một số công việc',
          details: { taskTypeIds: [7] },
        },
      ],
    }),
  )
  let saved
  api.on('POST', '/shifts/20/assignments', (_url, options) => {
    saved = JSON.parse(options.body)
    return json(201, { id: 8, warnings: [] })
  })
  render(
    <AssignmentPanel
      shift={shift}
      scope={scope}
      places={places}
      staff={[{ id: 10, fullName: '[Nhân viên kiểm thử]' }]}
    />,
  )
  await pickResident(5)
  expect(screen.getByRole('button', { name: 'Lưu phân công' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra phân công' }))
  expect(await screen.findByText('Chưa đủ chứng chỉ cho một số công việc')).toBeVisible()
  fireEvent.click(screen.getByLabelText('Đã xem các công việc không đủ điều kiện'))
  expect(screen.getByRole('button', { name: 'Lưu phân công' })).toBeEnabled()
  await pickResident(6)
  expect(screen.getByRole('button', { name: 'Lưu phân công' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra phân công' }))
  await screen.findByText('Chưa đủ chứng chỉ cho một số công việc')
  fireEvent.click(screen.getByLabelText('Đã xem các công việc không đủ điều kiện'))
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phân công' }))
  await waitFor(() => expect(saved?.targetId).toBe(6))
})

it('F15_kiemTraPhanCong409_hienLoiNgayTrongFormLapPhanCong', async () => {
  api.on(
    'POST',
    '/shifts/20/assignments/preview',
    problem(409, 'INVALID_ASSIGNMENT_TARGET', { detail: 'Đối tượng nằm ngoài phạm vi ca' }),
  )
  render(
    <AssignmentPanel
      shift={shift}
      scope={scope}
      places={places}
      staff={[{ id: 10, fullName: '[Nhân viên kiểm thử]' }]}
    />,
  )
  await pickResident(5)
  const check = screen.getByRole('button', { name: 'Kiểm tra phân công' })
  fireEvent.click(check)
  const form = check.closest('form')
  expect(await within(form).findByText('Đối tượng nằm ngoài phạm vi ca')).toBeVisible()
})

it('FR_027_ketThucBatBuocLyDo_vaGuiDungLenh', async () => {
  api.on(
    'GET',
    '/shifts/20/assignments',
    json(200, [
      {
        id: 8,
        staffId: 10,
        targetType: 'ROOM',
        targetId: 5,
        role: 'CAREGIVER',
        assignmentKind: 'PRIMARY',
        status: 'ACTIVE',
      },
    ]),
  )
  let body
  api.on('POST', '/assignments/8/end', (_url, options) => {
    body = JSON.parse(options.body)
    return json(200, {})
  })
  render(
    <AssignmentPanel
      shift={{ ...shift, status: 'IN_PROGRESS', allowedCommands: ['endAssignment'] }}
      staff={[{ id: 10, fullName: '[Nhân viên kiểm thử]' }]}
    />,
  )
  // DESIGN.md mục 8: câu ngắn có dấu phẩy, không dấu "·", nút không ghi #mã
  expect(await screen.findByText('Nhân viên chăm sóc, chính')).toBeVisible()
  expect(screen.queryByText(/·|#8/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Kết thúc phân công của [Nhân viên kiểm thử]' }))
  expect(screen.getByRole('button', { name: 'Xác nhận kết thúc' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Lý do kết thúc'), { target: { value: 'Chuyển người phụ trách' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận kết thúc' }))
  await waitFor(() => expect(body).toEqual({ reason: 'Chuyển người phụ trách' }))
})

it('FR_033_chiXemKhiBackendKhongChoLenhGhi', async () => {
  render(<AssignmentPanel shift={{ ...shift, allowedCommands: [] }} />)
  await screen.findByText('Chưa có phân công trong ca.')
  expect(screen.queryByRole('button', { name: 'Lưu phân công' })).not.toBeInTheDocument()
})

it('D13_chonDoiTuongLoaiCongViecCaNguonTheoTen_khongGoMa', async () => {
  api.on(
    'GET',
    '/shifts/20/assignments',
    json(200, [
      {
        id: 8,
        staffId: 10,
        targetType: 'RESIDENT',
        targetId: 5,
        taskTypeId: 7,
        role: 'CAREGIVER',
        assignmentKind: 'PRIMARY',
        status: 'SCHEDULED',
      },
    ]),
  )
  render(
    <AssignmentPanel
      shift={shift}
      scope={scope}
      places={places}
      shifts={[shift, { id: 19, startsAt: '2026-10-31T00:00:00Z', endsAt: '2026-10-31T08:00:00Z' }]}
      staff={[{ id: 10, fullName: '[Nhân viên kiểm thử]' }]}
    />,
  )
  expect(
    await screen.findByText(
      (_, el) =>
        el?.tagName === 'P' &&
        el.textContent.includes('Người cao tuổi [Người cao tuổi kiểm thử 5], công việc Hỗ trợ uống nước'),
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText(/#5/)).toBeNull()
  expect(screen.queryByLabelText('Mã đối tượng')).toBeNull()
  expect(within(screen.getByLabelText('Đối tượng cụ thể')).getByRole('option', { name: 'Tầng 2' })).toBeInTheDocument()
  expect(
    await within(screen.getByLabelText('Loại công việc (tùy chọn)')).findByRole('option', { name: 'Hỗ trợ uống nước' }),
  ).toBeInTheDocument()
  const source = screen.getByLabelText('Ca nguồn')
  expect(
    within(source)
      .getAllByRole('option')
      .map((o) => o.value),
  ).toEqual(['', '19'])
})

it('F17_danhDauDieuDuongPhuTrach_guiAssignedNurse', async () => {
  api.on('POST', '/shifts/20/assignments/preview', json(200, { warnings: [] }))
  let saved
  api.on('POST', '/shifts/20/assignments', (_url, options) => {
    saved = JSON.parse(options.body)
    return json(201, { id: 9, warnings: [] })
  })
  render(
    <AssignmentPanel
      shift={shift}
      scope={scope}
      places={places}
      staff={[{ id: 10, fullName: '[Nhân viên kiểm thử]' }]}
    />,
  )
  await pickResident(5)
  fireEvent.change(screen.getByLabelText('Vai trò thực hiện'), { target: { value: 'NURSING_STAFF' } })
  fireEvent.click(screen.getByLabelText('Điều dưỡng phụ trách'))
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra phân công' }))
  await screen.findByText('Phân công đủ điều kiện tại thời điểm kiểm tra.')
  fireEvent.click(screen.getByRole('button', { name: 'Lưu phân công' }))
  await waitFor(() =>
    expect(saved).toEqual(expect.objectContaining({ targetId: 5, role: 'NURSING_STAFF', assignedNurse: true })),
  )
})
