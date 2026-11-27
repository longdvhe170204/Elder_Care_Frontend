import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes } from '@/test/fetchRoutes'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { CreateResident } from './CreateResident'

// Tiêu đề, mô tả của khung nằm trong Sheet nên form phải render trong Sheet đang mở
function renderForm(props = {}) {
  return render(
    <Sheet open>
      <SheetContent>
        <CreateResident onCreated={() => {}} onClose={() => {}} {...props} />
      </SheetContent>
    </Sheet>,
  )
}

// 001 T022, FR-005: hỏi xác nhận không trùng chỉ khi tạo hồ sơ không có CCCD (backend kiểm cùng họ tên, ngày sinh). Từ khi
// chủ dự án chốt CCCD bắt buộc (test BF-01 2026-11-26) form luôn gửi CCCD: trùng người được chặn bằng tra CCCD (DBR-01),
// không còn bước "Xác nhận không trùng".

let api

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CreateResident: CCCD bắt buộc thay cho xác nhận không trùng', () => {
  it('cùng họ tên, ngày sinh với hồ sơ khác vẫn tạo được bằng CCCD, không gửi confirmNotDuplicate', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, {
        items: [
          {
            id: 3,
            profileCode: 'NCT-2026-000003',
            status: 'IN_RESIDENCE',
            personalInfo: {
              fullName: 'Trần Thị Mai',
              dateOfBirth: '1948-03-14',
              idDocumentType: 'CITIZEN_ID',
              idDocumentNumber: '079048001111',
            },
          },
        ],
        nextCursor: null,
      }),
    )
    api.on(
      'POST',
      '/residents',
      json(201, {
        profile: {
          id: 9,
          profileCode: 'NCT-2026-000009',
          personalInfo: { fullName: 'Trần Thị Mai' },
          previousProfileId: null,
        },
        warnings: [],
      }),
    )
    renderForm()
    fireEvent.change(screen.getByLabelText(/^Số căn cước/), { target: { value: '079048002222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tra hồ sơ' }))
    // Hồ sơ kia khác số căn cước nên không tính là cùng người
    await screen.findByText('Chưa tìm thấy hồ sơ')
    fireEvent.change(screen.getByLabelText(/^Họ và tên/), { target: { value: 'Trần Thị Mai' } })
    fireEvent.change(screen.getByLabelText(/^Ngày sinh/), { target: { value: '14/03/1948' } })
    fireEvent.change(screen.getByLabelText(/^Giới tính/), { target: { value: 'FEMALE' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText('NCT-2026-000009')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Xác nhận không trùng/ })).toBeNull()
    const body = JSON.parse(api.calls('POST', '/residents')[0][1].body)
    expect(body).toMatchObject({ idDocumentType: 'CITIZEN_ID', idDocumentNumber: '079048002222' })
    expect(body.confirmNotDuplicate).toBeUndefined()
  })
})
