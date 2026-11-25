import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import { clearChoice, typeChoice } from '@/test/choiceTray'
import { AssessmentTab } from './AssessmentTab'
import { FamilyDeclaredList } from './FamilyDeclared'

// 001 T116 (Q-412, FR-025a; US3 #9, #10): Hành chính ghi phần "Gia đình khai" của lần đánh giá đầu vào khi người cao tuổi
// còn Đang tiếp nhận, không thấy nhận xét, mức; Bác sĩ, Điều dưỡng thấy phần này chỉ đọc, kèm nhãn tự khai.

let api

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ENTRY = {
  topic: 'KNOWN_RISKS',
  content: 'Từng ngã hai lần năm nay',
  source: { type: 'FAMILY_MEMBER', familyMemberId: 31 },
  recordedBy: 'Hành chính Hoa',
  at: '2026-11-17T02:00:00Z',
}

describe('Gia đình khai', () => {
  // Phương án B "bảng theo chủ đề" (chủ dự án chọn 2026-11-21): năm chủ đề là năm dòng cố định, mỗi dòng ô chọn nhanh và
  // nguồn; "Thêm nguồn khác" thêm dòng cho cùng chủ đề; lưu một lần, chỉ gửi dòng có nội dung (lệnh thay toàn bộ danh sách)
  it('B_bangTheoChuDe_luuMotLan_chiGuiDongCoNoiDung', async () => {
    api.on('GET', '/residents/5/initial-assessment/family-declared', problem(404, 'NO_DRAFT'))
    api.on(
      'PUT',
      '/residents/5/initial-assessment/family-declared',
      json(201, { assessmentId: 9, status: 'DRAFT', entries: [ENTRY] }),
    )
    render(
      <AssessmentTab
        residentId={5}
        residentStatus="ADMISSION_IN_PROGRESS"
        allowedCommands={['RECORD_FAMILY_DECLARED']}
      />,
    )

    const section = await screen.findByRole('region', { name: 'Gia đình khai' })
    for (const topic of ['Tình trạng chung', 'Vận động', 'Tự chăm sóc', 'Nhận thức', 'Nguy cơ đã biết'])
      expect(within(section).getByRole('group', { name: topic })).toBeInTheDocument()
    const risks = within(section).getByRole('group', { name: 'Nguy cơ đã biết' })
    typeChoice('Nguy cơ đã biết', 'Từng ngã hai lần năm nay', risks)
    fireEvent.click(within(risks).getByRole('radio', { name: 'Người thân' }))
    fireEvent.change(within(risks).getByLabelText('Mã người thân'), { target: { value: '31' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Lưu Gia đình khai' }))

    await waitFor(() => expect(api.calls('PUT', '/residents/5/initial-assessment/family-declared')).toHaveLength(1))
    expect(JSON.parse(api.calls('PUT', '/residents/5/initial-assessment/family-declared')[0][1].body)).toEqual({
      entries: [
        {
          topic: 'KNOWN_RISKS',
          content: 'Từng ngã hai lần năm nay',
          source: { type: 'FAMILY_MEMBER', familyMemberId: 31 },
        },
      ],
    })
    expect(api.calls('GET', '/residents/5/assessments')).toHaveLength(0)
    expect(await within(section).findByText('Tự khai, chưa được Bác sĩ kiểm chứng')).toBeInTheDocument()
  })

  it('B_themNguonKhac_choCungChuDe_vaMucDaLuuHienTrongDong', async () => {
    api.on('GET', '/residents/5/initial-assessment/family-declared', json(200, { assessmentId: 9, entries: [ENTRY] }))
    render(
      <AssessmentTab
        residentId={5}
        residentStatus="ADMISSION_IN_PROGRESS"
        allowedCommands={['RECORD_FAMILY_DECLARED']}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Gia đình khai' })
    const risks = within(section).getByRole('group', { name: 'Nguy cơ đã biết' })
    expect(await within(risks).findByRole('button', { name: 'Bỏ Từng ngã hai lần năm nay' })).toBeInTheDocument()
    expect(within(risks).getByLabelText('Mã người thân')).toHaveValue('31')
    fireEvent.click(within(risks).getByRole('button', { name: 'Thêm nguồn khác' }))
    expect(within(risks).getByRole('button', { name: 'Nguy cơ đã biết, nguồn thứ 2' })).toBeInTheDocument()
    fireEvent.click(within(section).getByRole('button', { name: 'Lưu Gia đình khai' }))
    expect(await within(section).findByText('Chưa có thay đổi để lưu.')).toBeInTheDocument()
  })

  // F7: nguồn Người thân chưa nhập mã thì báo tại dòng, không gửi, không báo "Đã lưu"
  it('F7_nguonNguoiThanChuaNhapMa_baoTaiDong_khongGui', async () => {
    api.on('GET', '/residents/5/initial-assessment/family-declared', problem(404, 'NO_DRAFT'))
    render(
      <AssessmentTab
        residentId={5}
        residentStatus="ADMISSION_IN_PROGRESS"
        allowedCommands={['RECORD_FAMILY_DECLARED']}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Gia đình khai' })
    const cognition = within(section).getByRole('group', { name: 'Nhận thức' })
    typeChoice('Nhận thức', 'Hay quên uống thuốc', cognition)
    fireEvent.click(within(cognition).getByRole('radio', { name: 'Người thân' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Lưu Gia đình khai' }))
    expect(await within(cognition).findByText('Nhập mã người thân')).toBeInTheDocument()
    expect(within(section).queryByText(/Đã lưu/)).toBeNull()
    expect(api.calls('PUT', '/residents/5/initial-assessment/family-declared')).toHaveLength(0)

    clearChoice(cognition)
    fireEvent.click(within(cognition).getByRole('radio', { name: 'Người cao tuổi' }))
    fireEvent.click(within(section).getByRole('button', { name: 'Lưu Gia đình khai' }))
    expect(await within(section).findByText('Chưa có thay đổi để lưu.')).toBeInTheDocument()
  })

  it('danh sách chỉ đọc cho Bác sĩ: chủ đề, nội dung, nguồn, nhãn tự khai', () => {
    render(<FamilyDeclaredList entries={[ENTRY]} />)
    const list = screen.getByRole('region', { name: 'Gia đình khai' })
    expect(within(list).getByText('Nguy cơ đã biết')).toBeInTheDocument()
    expect(within(list).getByText('Từng ngã hai lần năm nay')).toBeInTheDocument()
    expect(within(list).getByText(/Người thân \(mã 31\)/)).toBeInTheDocument()
    expect(within(list).getByText('Tự khai, chưa được Bác sĩ kiểm chứng')).toBeInTheDocument()
  })
})

// Demo 2026-11-25: đọc được danh sách người thân thì chọn theo tên thay cho ô nhập mã
describe('Gia đình khai: chọn người thân theo tên', () => {
  it('chonNguoiThanTheoTen_guiDungMa', async () => {
    api.on('GET', '/residents/5/initial-assessment/family-declared', problem(404, 'NO_DRAFT'))
    api.on(
      'GET',
      '/residents/5/relationships',
      json(200, [{ id: 1, status: 'ACTIVE', familyMember: { id: 31, fullName: 'Trần Văn Minh' } }]),
    )
    api.on(
      'PUT',
      '/residents/5/initial-assessment/family-declared',
      json(201, { assessmentId: 9, status: 'DRAFT', entries: [ENTRY] }),
    )
    render(
      <AssessmentTab
        residentId={5}
        residentStatus="ADMISSION_IN_PROGRESS"
        allowedCommands={['RECORD_FAMILY_DECLARED']}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Gia đình khai' })
    const risks = within(section).getByRole('group', { name: 'Nguy cơ đã biết' })
    typeChoice('Nguy cơ đã biết', 'Từng ngã hai lần năm nay', risks)
    fireEvent.click(within(risks).getByRole('radio', { name: 'Người thân' }))
    await within(risks).findByRole('option', { name: 'Trần Văn Minh' })
    expect(within(risks).queryByLabelText('Mã người thân')).toBeNull()
    fireEvent.change(within(risks).getByLabelText('Người thân'), { target: { value: '31' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Lưu Gia đình khai' }))
    await waitFor(() => expect(api.calls('PUT', '/residents/5/initial-assessment/family-declared')).toHaveLength(1))
    const body = JSON.parse(api.calls('PUT', '/residents/5/initial-assessment/family-declared')[0][1].body)
    expect(body.entries[0].source).toEqual({ type: 'FAMILY_MEMBER', familyMemberId: 31 })
  })
})
