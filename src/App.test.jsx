import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { json, mockRoutes, problem } from '@/test/fetchRoutes'
import App from './App'

// 002 T045 (hướng A, chủ dự án chọn 2026-10-20): có phiên thật thì khung nhân viên theo vai trò của tài khoản và có
// nút Đăng xuất; chưa đăng nhập (401) thì sang /login; chạy không có backend thì giữ bản mẫu đổi vai trò.

let api

beforeEach(() => {
  api = mockRoutes()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('App', () => {
  it('ẩn mục Kế hoạch chăm sóc và chuyển khỏi đường dẫn cũ của Điều dưỡng', async () => {
    window.history.replaceState(null, '', '/#care-plans?residentId=77')
    api.on('GET', '/me', json(200, { accountId: 5, type: 'STAFF', roles: ['AC-04'] }))
    api.on(
      'GET',
      '/me/permissions',
      json(200, [
        { function: 'CARE_PLAN', operation: 'VIEW' },
        { function: 'TASK_CHECKLIST', operation: 'VIEW' },
      ]),
    )
    render(<App />)

    await waitFor(() => expect(window.location.hash).toBe('#care-tasks'))
    expect(screen.getByRole('button', { name: 'Checklist ca' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kế hoạch chăm sóc' })).toBeNull()
    expect(api.calls('GET', '/residents/77/care-plans')).toHaveLength(0)
  })

  it('coPhien_vaiTroThat_khongCoODoiVaiTro_dangXuatGoiApi', async () => {
    api.on(
      'GET',
      '/me',
      json(200, {
        accountId: 5,
        type: 'STAFF',
        fullName: 'Lê Văn Trưởng Tầng',
        roles: ['AC-02'],
        mustChangePassword: false,
      }),
    )
    // Menu theo quyền thật (002 FR-042): chỉ có Checklist ca, không có Tổng quan nên mở mục đầu tiên được phép
    api.on('GET', '/me/permissions', json(200, [{ function: 'TASK_CHECKLIST', operation: 'VIEW' }]))
    api.on('POST', '/auth/logout', new Response(null, { status: 204 }))
    render(<App />)

    expect(await screen.findByText('Lê Văn Trưởng Tầng')).toBeInTheDocument()
    expect(screen.getByText('Trưởng tầng')).toBeInTheDocument()
    expect(screen.queryByLabelText('Xem với vai trò')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Thuốc và sức khỏe' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Chăm sóc hằng ngày' }))
    expect(screen.getByRole('button', { name: 'Checklist ca' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tổng quan' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Phát thuốc' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }))
    await waitFor(() => expect(api.calls('POST', '/auth/logout')).toHaveLength(1))
  })

  it('chuaDangNhap_chuyenSangManDangNhap', async () => {
    window.history.replaceState(null, '', '/')
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    api.on('GET', '/me', problem(401, 'UNAUTHORIZED'))
    render(<App />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(screen.queryByLabelText('Xem với vai trò')).toBeNull()
  })

  it('chuaDangNhap_moDuongDanCoHash_mangHashSangManDangNhap', async () => {
    window.history.replaceState(null, '', '/#residents')
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    api.on('GET', '/me', problem(401, 'UNAUTHORIZED'))
    render(<App />)

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login#residents'))
    window.history.replaceState(null, '', '/')
  })

  it('dangMoApp_doiHashTrenThanhDiaChi_moManDich', async () => {
    api.on('GET', '/me', new Response(null, { status: 500 }))
    api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
    window.history.replaceState(null, '', '/')
    render(<App />)
    await screen.findByRole('button', { name: 'Người cao tuổi, lưu trú' })

    // Dán đường dẫn #… vào thanh địa chỉ khi app đang mở: trình duyệt chỉ đổi hash, không tải lại trang
    window.location.hash = '#residents'
    expect(await screen.findByRole('heading', { name: 'Người cao tuổi' })).toBeInTheDocument()
    window.history.replaceState(null, '', '/')
  })

  it('BUG-UI-002: tải lại trang giữ màn đang mở theo hash', async () => {
    api.on('GET', '/me', new Response(null, { status: 500 }))
    api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
    window.history.replaceState(null, '', '/')
    const first = render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Người cao tuổi, lưu trú' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Người cao tuổi' }))
    await waitFor(() => expect(window.location.hash).toBe('#residents'))
    first.unmount()

    // Mô phỏng F5: App dựng lại từ đầu, URL còn nguyên
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Người cao tuổi' })).toBeInTheDocument()
    window.history.replaceState(null, '', '/')
  })

  it('016_Q12_duongDanCoId_moThangBanGhi', async () => {
    api.on('GET', '/me', new Response(null, { status: 500 }))
    api.on(
      'GET',
      '/incidents',
      json(200, [
        {
          id: 12,
          status: 'NEW',
          level: 'MINOR',
          content: { discoveredAt: '2026-11-08T02:00:00Z', description: 'Ngã', level: 'MINOR' },
          allowedCommands: [],
          progressions: [],
        },
      ]),
    )
    api.on(
      'GET',
      '/incidents/12',
      json(200, {
        id: 12,
        status: 'NEW',
        level: 'MINOR',
        content: { discoveredAt: '2026-11-08T02:00:00Z', description: 'Ngã', level: 'MINOR' },
        allowedCommands: [],
        progressions: [],
      }),
    )
    api.on('GET', '/incident-types', json(200, []))
    api.on('GET', '/progression-types', json(200, []))
    window.history.replaceState(null, '', '/#incidents?incidentId=12')
    render(<App />)

    expect(await screen.findByRole('region', { name: 'Chi tiết sự cố' })).toBeInTheDocument()
    window.history.replaceState(null, '', '/')
  })

  it('nút Quay lại về đúng màn trước, màn đầu tiên không có nút', async () => {
    api.on('GET', '/me', new Response(null, { status: 500 }))
    api.on('GET', '/residents', json(200, { items: [], nextCursor: null }))
    window.history.replaceState(null, '', '/#dashboard')
    render(<App />)

    expect(await screen.findByLabelText('Xem với vai trò')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Quay lại/ })).toBeNull()
    // nhóm menu mở, đóng được nhớ trong localStorage từ test trước: chỉ mở khi đang đóng
    if (!screen.queryByRole('button', { name: 'Người cao tuổi' })) {
      fireEvent.click(screen.getByRole('button', { name: 'Người cao tuổi, lưu trú' }))
    }
    fireEvent.click(await screen.findByRole('button', { name: 'Người cao tuổi' }))
    await waitFor(() => expect(window.location.hash).toBe('#residents'))

    fireEvent.click(await screen.findByRole('button', { name: 'Quay lại Tổng quan' }))
    await waitFor(() => expect(window.location.hash).toBe('#dashboard'))
    expect(screen.queryByRole('button', { name: /^Quay lại/ })).toBeNull()
    window.history.replaceState(null, '', '/')
  })

  it('khongCoBackend_giuBanMauDoiVaiTro', async () => {
    api.on('GET', '/me', new Response(null, { status: 500 }))
    render(<App />)

    expect(await screen.findByLabelText('Xem với vai trò')).toBeInTheDocument()
    expect(api.calls('GET', '/me')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Đăng xuất' })).toBeNull()
  })
})
