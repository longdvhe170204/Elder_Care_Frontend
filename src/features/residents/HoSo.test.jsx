import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
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

// 001 T022: tạo hồ sơ người cao tuổi (US1 #1, #2, #4; FR-001 → FR-005; hợp đồng POST /residents). Chủ dự án chốt khi test
// BF-01 2026-11-26: CCCD 12 chữ số bắt buộc, nhập và tra trước; các nhóm sau khóa tới khi tra xong mà không có hồ sơ mở.

let api

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function created(overrides = {}) {
  return {
    profile: {
      id: 7,
      profileCode: 'NCT-2026-000007',
      personalInfo: { fullName: 'Nguyễn Văn An' },
      previousProfileId: null,
    },
    warnings: [],
    ...overrides,
  }
}

const field = (label) => screen.getByLabelText(new RegExp(`^${label}`))

function fill({ name = 'Nguyễn Văn An', dob = '14/03/1948', gender = 'MALE' } = {}) {
  fireEvent.change(field('Họ và tên'), { target: { value: name } })
  fireEvent.change(field('Ngày sinh'), { target: { value: dob } })
  fireEvent.change(field('Giới tính'), { target: { value: gender } })
}

function checkCitizenId(number) {
  fireEvent.change(field('Số căn cước'), { target: { value: number } })
  fireEvent.click(screen.getByRole('button', { name: 'Tra hồ sơ' }))
}

// Tra CCCD chưa có hồ sơ nào: mở khóa các nhóm sau
async function lookedUpNew(number = '012345678901') {
  api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
  checkCitizenId(number)
  await screen.findByText('Chưa tìm thấy hồ sơ')
}

function profile(id, status, info = {}) {
  return {
    id,
    profileCode: `NCT-2025-00000${id}`,
    status,
    personalInfo: {
      fullName: 'Nguyễn Văn An',
      dateOfBirth: '1948-03-14',
      gender: 'MALE',
      idDocumentType: 'CITIZEN_ID',
      idDocumentNumber: '012345678901',
      permanentAddress: '12 Ngõ Thử, Hà Nội',
      contact: { phoneNumber: '0912000111' },
      ...info,
    },
  }
}

describe('CreateResident: nhập CCCD trước, tra hồ sơ cũ theo CCCD (test BF-01 2026-11-26)', () => {
  it('thông tin cá nhân khóa tới khi tra xong số căn cước', async () => {
    renderForm()
    expect(field('Họ và tên').matches(':disabled')).toBe(true)

    fireEvent.change(field('Số căn cước'), { target: { value: '012345678901' } })
    expect(field('Họ và tên').matches(':disabled')).toBe(true)

    await lookedUpNew()
    expect(field('Họ và tên').matches(':disabled')).toBe(false)
  })

  it('CCCD bắt buộc, không đủ 12 chữ số thì báo, không tra', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Tra hồ sơ' }))
    expect(screen.getByText('Nhập số căn cước')).toBeInTheDocument()

    checkCitizenId('01234567890')
    expect(screen.getByText('Số căn cước gồm đúng 12 chữ số')).toBeInTheDocument()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('ô số căn cước chỉ giữ chữ số, tối đa 12 số', () => {
    renderForm()
    fireEvent.change(field('Số căn cước'), { target: { value: '012 345 678 901 23' } })
    expect(field('Số căn cước')).toHaveValue('012345678901')
  })

  it('FR-004: có hồ sơ cũ Kết thúc lưu trú thì báo sẽ liên kết và điền được thông tin từ hồ sơ cũ', async () => {
    api.on('GET', '/residents', json(200, { items: [profile(5, 'RESIDENCY_ENDED')], nextCursor: null }))
    renderForm()
    checkCitizenId('012345678901')

    await screen.findByText('Đã tìm thấy hồ sơ cũ')
    expect(
      screen.getByText(/Nguyễn Văn An, mã NCT-2025-000005, Kết thúc lưu trú\. Hồ sơ mới sẽ được liên kết/),
    ).toBeInTheDocument()
    expect(new URL(api.fetchMock.mock.calls[0][0], 'http://x').searchParams.get('q')).toBe('012345678901')
    fireEvent.click(screen.getByRole('button', { name: 'Điền từ hồ sơ cũ' }))

    expect(field('Họ và tên')).toHaveValue('Nguyễn Văn An')
    expect(field('Ngày sinh')).toHaveValue('14/03/1948')
    expect(field('Số điện thoại')).toHaveValue('0912000111')
  })

  it('DBR-01: CCCD đang dùng ở hồ sơ chưa kết thúc thì chặn tạo', async () => {
    api.on('GET', '/residents', json(200, { items: [profile(6, 'IN_RESIDENCE')], nextCursor: null }))
    renderForm()
    checkCitizenId('012345678901')

    await screen.findByText('Đã có hồ sơ đang mở')
    expect(screen.getByText(/Không tạo thêm hồ sơ cho số căn cước này/)).toBeInTheDocument()
    expect(field('Họ và tên').matches(':disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Tạo hồ sơ' })).toBeDisabled()
  })

  it('hồ sơ gần nhất Qua đời thì cảnh báo, không liên kết', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, { items: [profile(8, 'DECEASED'), profile(4, 'RESIDENCY_ENDED')], nextCursor: null }),
    )
    renderForm()
    checkCitizenId('012345678901')

    await screen.findByText('Số căn cước trùng hồ sơ đã qua đời')
    expect(screen.getByText(/hồ sơ mới không liên kết với hồ sơ này/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Điền từ hồ sơ cũ' })).toBeNull()
  })

  it('đổi số CCCD sau khi tra thì phải tra lại', async () => {
    renderForm()
    await lookedUpNew()

    fireEvent.change(field('Số căn cước'), { target: { value: '012345678902' } })

    expect(field('Họ và tên').matches(':disabled')).toBe(true)
  })

  it('chưa tra mà bấm Tạo hồ sơ thì báo tại ô căn cước', () => {
    renderForm()
    fireEvent.change(field('Số căn cước'), { target: { value: '012345678901' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Bấm "Tra hồ sơ" để kiểm tra số căn cước trước')).toBeInTheDocument()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
})

describe('CreateResident: kiểm tra định dạng', () => {
  it('họ tên có chữ số, số điện thoại sai định dạng thì báo tại ô, không gọi backend', async () => {
    renderForm()
    await lookedUpNew()
    fill({ name: 'Nguyễn Văn 4n' })
    fireEvent.change(field('Số điện thoại'), { target: { value: '09a12' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Họ và tên chỉ gồm chữ cái và khoảng trắng')).toBeInTheDocument()
    expect(
      screen.getByText('Số điện thoại Việt Nam: di động 10 số (03, 05, 07, 08, 09…), cố định 11 số (02…)'),
    ).toBeInTheDocument()
    expect(api.calls('POST', '/residents')).toHaveLength(0)
  })

  it('ngày sinh trước năm 1900 bị chặn', async () => {
    renderForm()
    await lookedUpNew()
    fill({ dob: '31/12/1899' })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Ngày sinh không trước năm 1900')).toBeInTheDocument()
    expect(api.calls('POST', '/residents')).toHaveLength(0)
  })
})

describe('CreateResident', () => {
  it('BUG-07: họ tên quá 200 ký tự báo tại ô bằng tiếng Việt, không gọi backend', async () => {
    renderForm()
    await lookedUpNew()
    fill({ name: 'A'.repeat(201) })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Họ và tên tối đa 200 ký tự')).toBeInTheDocument()
    expect(api.calls('POST', '/residents')).toHaveLength(0)
  })

  it('chặn gửi khi thiếu họ tên, ngày sinh, giới tính', async () => {
    renderForm()
    await lookedUpNew()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Nhập họ và tên')).toBeInTheDocument()
    expect(screen.getByText('Nhập ngày sinh')).toBeInTheDocument()
    expect(screen.getByText('Chọn giới tính')).toBeInTheDocument()
    expect(api.calls('POST', '/residents')).toHaveLength(0)
  })

  it('gửi thông tin kèm Idempotency-Key và hiện mã hồ sơ đã cấp', async () => {
    api.on('POST', '/residents', json(201, created()))
    const onCreated = vi.fn()
    renderForm({ onCreated })
    await lookedUpNew()
    fill()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText('NCT-2026-000007')).toBeInTheDocument())
    const [, init] = api.calls('POST', '/residents')[0]
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(init.body)).toMatchObject({
      fullName: 'Nguyễn Văn An',
      dateOfBirth: '1948-03-14',
      gender: 'MALE',
      idDocumentType: 'CITIZEN_ID',
      idDocumentNumber: '012345678901',
    })
    expect(onCreated).toHaveBeenCalled()
  })

  it('CCCD đang dùng: báo ngay ở ô số căn cước kèm mã hồ sơ đang mang CCCD', async () => {
    api.on('POST', '/residents', problem(409, 'CITIZEN_ID_IN_USE', { profileCode: 'NCT-2026-000001' }))
    renderForm()
    await lookedUpNew()
    fill()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText('Số căn cước đang dùng ở hồ sơ NCT-2026-000001')).toBeInTheDocument())
  })

  it('cảnh báo CCCD trùng hồ sơ đã qua đời hiện sau khi tạo', async () => {
    api.on(
      'POST',
      '/residents',
      json(
        201,
        created({
          warnings: [
            {
              code: 'CITIZEN_ID_MATCHES_DECEASED_PROFILE',
              description: 'CCCD trùng hồ sơ đã qua đời, cần kiểm tra lại giấy tờ',
            },
          ],
        }),
      ),
    )
    renderForm()
    await lookedUpNew()
    fill()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText(/đã qua đời, cần kiểm tra lại giấy tờ/)).toBeInTheDocument())
  })
})
