import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
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
  it('Hành chính: không tải lịch sử đánh giá; thêm mục có nguồn rồi lưu thay toàn bộ danh sách', async () => {
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
    expect(within(section).getByText('Chưa có thông tin gia đình khai.')).toBeInTheDocument()
    fireEvent.change(within(section).getByLabelText('Chủ đề'), { target: { value: 'KNOWN_RISKS' } })
    fireEvent.change(within(section).getByLabelText('Nội dung'), { target: { value: 'Từng ngã hai lần năm nay' } })
    fireEvent.click(within(section).getByRole('radio', { name: 'Người thân' }))
    fireEvent.change(within(section).getByLabelText('Mã người thân'), { target: { value: '31' } })
    fireEvent.click(within(section).getByRole('button', { name: 'Thêm mục' }))
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

  it('nội dung trống thì báo tại ô, không thêm mục', async () => {
    api.on('GET', '/residents/5/initial-assessment/family-declared', problem(404, 'NO_DRAFT'))
    render(
      <AssessmentTab
        residentId={5}
        residentStatus="ADMISSION_IN_PROGRESS"
        allowedCommands={['RECORD_FAMILY_DECLARED']}
      />,
    )
    const section = await screen.findByRole('region', { name: 'Gia đình khai' })
    fireEvent.click(within(section).getByRole('button', { name: 'Thêm mục' }))
    expect(within(section).getByText('Nhập nội dung')).toBeInTheDocument()
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
