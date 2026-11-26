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

// 001 T022: tạo hồ sơ người cao tuổi (US1 #1, #2, #4; FR-001 → FR-005; hợp đồng POST /residents).

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

function fill({ name = 'Nguyễn Văn An', dob = '1948-03-14', gender = 'MALE', document = 'NONE' } = {}) {
  if (document) fireEvent.change(screen.getByLabelText('Loại giấy tờ'), { target: { value: document } })
  fireEvent.change(screen.getByLabelText('Họ tên'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Ngày sinh'), { target: { value: dob } })
  fireEvent.change(screen.getByLabelText('Giới tính'), { target: { value: gender } })
}

async function checkCitizenId(number) {
  fireEvent.change(screen.getByLabelText('Loại giấy tờ'), { target: { value: 'CITIZEN_ID' } })
  fireEvent.change(screen.getByLabelText('Số giấy tờ'), { target: { value: number } })
  fireEvent.click(screen.getByRole('button', { name: 'Tra hồ sơ' }))
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

describe('CreateResident: nhập giấy tờ trước, tra hồ sơ cũ theo CCCD (test BF-01 2026-11-26)', () => {
  it('thông tin cá nhân khóa tới khi xong bước giấy tờ', () => {
    renderForm()
    expect(screen.getByLabelText('Họ tên').matches(':disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Loại giấy tờ'), { target: { value: 'CITIZEN_ID' } })
    expect(screen.getByLabelText('Họ tên').matches(':disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText('Loại giấy tờ'), { target: { value: 'NONE' } })
    expect(screen.getByLabelText('Họ tên').matches(':disabled')).toBe(false)
  })

  it('CCCD không đủ 12 chữ số thì báo, không tra', () => {
    renderForm()
    fireEvent.change(screen.getByLabelText('Loại giấy tờ'), { target: { value: 'CITIZEN_ID' } })
    fireEvent.change(screen.getByLabelText('Số giấy tờ'), { target: { value: '01234567890' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tra hồ sơ' }))

    expect(screen.getByText('Số CCCD gồm đúng 12 chữ số')).toBeTruthy()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('FR-004: có hồ sơ cũ Kết thúc lưu trú thì báo sẽ liên kết và điền được thông tin từ hồ sơ cũ', async () => {
    api.on('GET', '/residents', json(200, { items: [profile(5, 'RESIDENCY_ENDED')], nextCursor: null }))
    renderForm()
    await checkCitizenId('012345678901')

    await screen.findByText('Người này đã có hồ sơ cũ. Hồ sơ mới sẽ được liên kết với hồ sơ này:')
    expect(screen.getByText('NCT-2025-000005 · Nguyễn Văn An · Kết thúc lưu trú')).toBeTruthy()
    expect(new URL(api.fetchMock.mock.calls[0][0], 'http://x').searchParams.get('q')).toBe('012345678901')
    fireEvent.click(screen.getByRole('button', { name: 'Điền thông tin từ hồ sơ cũ' }))

    expect(screen.getByLabelText('Họ tên').value).toBe('Nguyễn Văn An')
    expect(screen.getByLabelText('Ngày sinh').value).toBe('1948-03-14')
    expect(screen.getByLabelText('Số điện thoại').value).toBe('0912000111')
  })

  it('DBR-01: CCCD đang dùng ở hồ sơ chưa kết thúc thì chặn tạo', async () => {
    api.on('GET', '/residents', json(200, { items: [profile(6, 'IN_RESIDENCE')], nextCursor: null }))
    renderForm()
    await checkCitizenId('012345678901')

    await screen.findByText('CCCD này đang dùng ở hồ sơ chưa kết thúc, không tạo được hồ sơ mới:')
    expect(screen.getByLabelText('Họ tên').matches(':disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Tạo hồ sơ' }).disabled).toBe(true)
  })

  it('hồ sơ gần nhất Qua đời thì cảnh báo, không liên kết', async () => {
    api.on(
      'GET',
      '/residents',
      json(200, { items: [profile(8, 'DECEASED'), profile(4, 'RESIDENCY_ENDED')], nextCursor: null }),
    )
    renderForm()
    await checkCitizenId('012345678901')

    await screen.findByText(/CCCD trùng hồ sơ đã qua đời, cần kiểm tra lại giấy tờ/)
    expect(screen.queryByRole('button', { name: 'Điền thông tin từ hồ sơ cũ' })).toBeNull()
  })

  it('đổi số CCCD sau khi tra thì phải tra lại', async () => {
    api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
    renderForm()
    await checkCitizenId('012345678901')
    await screen.findByText(/Chưa có hồ sơ nào mang CCCD này/)

    fireEvent.change(screen.getByLabelText('Số giấy tờ'), { target: { value: '012345678902' } })

    expect(screen.getByLabelText('Họ tên').matches(':disabled')).toBe(true)
  })
})

describe('CreateResident: kiểm tra định dạng', () => {
  it('họ tên có chữ số, số điện thoại, thư điện tử sai định dạng thì báo tại ô, không gọi backend', () => {
    renderForm()
    fill({ name: 'Nguyễn Văn 4n' })
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '09a12' } })
    fireEvent.change(screen.getByLabelText('Thư điện tử'), { target: { value: 'an@vidu' } })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Họ tên chỉ gồm chữ cái và khoảng trắng')).toBeTruthy()
    expect(screen.getByText('Số điện thoại gồm 8 đến 15 chữ số')).toBeTruthy()
    expect(screen.getByText('Thư điện tử không đúng định dạng, ví dụ ten@vidu.vn')).toBeTruthy()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('ngày sinh trước năm 1900 bị chặn', () => {
    renderForm()
    fill({ dob: '1899-12-31' })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Ngày sinh không trước năm 1900')).toBeTruthy()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })
})

describe('CreateResident', () => {
  it('BUG-07: họ tên quá 200 ký tự báo tại ô bằng tiếng Việt, không gọi backend', () => {
    renderForm()
    fill({ name: 'A'.repeat(201) })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Họ tên tối đa 200 ký tự')).toBeTruthy()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('chặn gửi khi thiếu họ tên, ngày sinh, giới tính', () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(screen.getByText('Chọn loại giấy tờ, hoặc "Không có giấy tờ"')).toBeTruthy()
    expect(screen.getByText('Nhập họ tên')).toBeTruthy()
    expect(screen.getByText('Chọn ngày sinh')).toBeTruthy()
    expect(screen.getByText('Chọn giới tính')).toBeTruthy()
    expect(api.fetchMock).not.toHaveBeenCalled()
  })

  it('gửi thông tin kèm Idempotency-Key và hiện mã hồ sơ đã cấp', async () => {
    api.on('POST', '/residents', json(201, created()))
    api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
    const onCreated = vi.fn()
    renderForm({ onCreated })
    await checkCitizenId('012345678901')
    await screen.findByText('Chưa có hồ sơ nào mang CCCD này. Nhập thông tin để tạo hồ sơ mới.')
    fill({ document: null })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText('NCT-2026-000007')).toBeTruthy())
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

  it('CCCD đang dùng: báo ngay ở ô số giấy tờ kèm mã hồ sơ đang mang CCCD', async () => {
    api.on('POST', '/residents', problem(409, 'CITIZEN_ID_IN_USE', { profileCode: 'NCT-2026-000001' }))
    api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
    renderForm()
    await checkCitizenId('012345678901')
    await screen.findByText(/Chưa có hồ sơ nào mang CCCD này/)
    fill({ document: null })

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText('CCCD đang dùng ở hồ sơ NCT-2026-000001')).toBeTruthy())
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
    fill()

    fireEvent.click(screen.getByRole('button', { name: 'Tạo hồ sơ' }))

    await waitFor(() => expect(screen.getByText(/đã qua đời, cần kiểm tra lại giấy tờ/)).toBeTruthy())
  })
})
