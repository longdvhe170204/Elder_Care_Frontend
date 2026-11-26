import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { getAuthPasswordResetAvailability, postAuthLogin } from '@/api'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ProblemAlert } from '@/common/ProblemAlert'
import { formatDateTime } from '@/common/dateTime'
import { problemOf } from '@/common/problem'
import { deviceId, homeOf } from '@/common/session'
import { cn } from 'cn'
import illustration from '@/assets/login-illustration.svg'
import { ForgotPassword } from './ForgotPassword'

// Đăng nhập web cho nhân viên và người thân (002 T045; UC-70; FR-006, FR-008, FR-014, FR-014a; chủ dự án chọn một màn
// chung, 2026-10-20). Bố cục hai cột theo Figma "Đăng nhập · Web · Minh họa cắt giấy" của chủ dự án (2026-11-26):
// trái nền xanh có hình minh họa, phải form. Thông báo lỗi lấy từ máy chủ, không nói tên có tồn tại hay không.
// Tài khoản do viện cấp, không tự đăng ký (Q-341).

const goTo = (url) => window.location.assign(url)

// Form đăng nhập dùng chung cho màn đăng nhập và khung đăng nhập lại khi hết phiên (SessionGuard, 002 T047b).
// `large`: cỡ chữ, ô nhập của màn đăng nhập; `beforeSubmit`: nội dung đặt ngay trên nút (liên kết Quên mật khẩu).
export function LoginForm({ onLoggedIn, submitLabel = 'Đăng nhập', large = false, beforeSubmit = null }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [failure, setFailure] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setFailure(null)
    const next = {}
    if (!username.trim()) next.username = 'Nhập tên đăng nhập'
    if (!password) next.password = 'Nhập mật khẩu'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      const { data } = await postAuthLogin({
        headers: { 'X-Device-Id': deviceId() },
        body: { username: username.trim(), password, channel: 'WEB' },
      })
      onLoggedIn(data)
    } catch (error) {
      setPassword('')
      setFailure({ ...problemOf(error), unlocksAt: error?.problem?.unlocksAt })
    } finally {
      setSaving(false)
    }
  }

  const labelClass = large ? 'text-base font-semibold lg:text-lg' : undefined
  const inputClass = large ? 'h-12 rounded-[10px] px-3.5 text-base md:text-base lg:h-14' : 'h-11'

  return (
    <form onSubmit={submit} noValidate className={cn('flex flex-col', large ? 'gap-5' : 'gap-4')}>
      <FieldGroup className={large ? 'gap-6' : undefined}>
        <Field data-invalid={!!errors.username || undefined}>
          <FieldLabel htmlFor="login-user" className={labelClass}>
            Tên đăng nhập
          </FieldLabel>
          <Input
            id="login-user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!errors.username || undefined}
            className={inputClass}
          />
          {errors.username && <FieldError>{errors.username}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.password || undefined}>
          <FieldLabel htmlFor="login-password" className={labelClass}>
            Mật khẩu
          </FieldLabel>
          <div className="relative">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password || undefined}
              className={cn(inputClass, 'pr-12')}
            />
            {/* Nút ẩn hiện mật khẩu, vùng bấm 44 × 44 (DESIGN.md mục 9) */}
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
            </button>
          </div>
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>
      </FieldGroup>
      {beforeSubmit}
      <ProblemAlert problem={failure} title={failure?.status === 401 ? 'Chưa đăng nhập được' : undefined}>
        {failure?.unlocksAt && <p className="tabular-nums">Mở lại lúc {formatDateTime(failure.unlocksAt)}.</p>}
      </ProblemAlert>
      <Button
        type="submit"
        className={large ? 'h-14 rounded-lg text-lg font-semibold lg:h-[70px] lg:text-2xl' : 'h-11'}
        disabled={saving}
      >
        {submitLabel}
      </Button>
    </form>
  )
}

export function LoginPage({ onNavigate = goTo }) {
  // Tự đặt lại mật khẩu chỉ hiện khi kênh tin nhắn đã cấu hình (FR-052a, Q-06); không gọi được máy chủ thì ẩn
  const [resetAvailable, setResetAvailable] = useState(false)
  const [mode, setMode] = useState('login')
  const [resetDone, setResetDone] = useState(false)

  useEffect(() => {
    let alive = true
    getAuthPasswordResetAvailability()
      .then(({ data }) => alive && setResetAvailable(!!data?.available))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // Liên kết chỉ hiện khi kênh tin nhắn đã cấu hình (Q-06); chưa cấu hình thì cách lấy lại mật khẩu ghi ở chân form
  const forgotLink = resetAvailable ? (
    <div className="flex justify-end">
      <button
        type="button"
        className="min-h-11 rounded-md px-1 text-base font-semibold text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:text-xl"
        onClick={() => {
          setResetDone(false)
          setMode('forgot')
        }}
      >
        Quên mật khẩu?
      </button>
    </div>
  ) : null

  return (
    <div className="grid min-h-screen bg-card lg:grid-cols-[11fr_9fr]">
      {/* Cột minh họa: nền xanh giữ nguyên ở chế độ tối để hình nét trắng luôn đủ tương phản */}
      <div className="relative hidden overflow-hidden bg-sidebar-primary lg:block" aria-hidden>
        <img
          src={illustration}
          alt=""
          className="absolute bottom-0 left-1/2 h-[78%] max-w-none -translate-x-[51.5%] object-contain object-bottom"
        />
      </div>

      <main className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="flex w-full max-w-[508px] flex-col gap-8 lg:gap-9">
          <div className="flex flex-col items-center gap-4 text-center lg:gap-9">
            <span className="text-3xl leading-tight font-semibold text-primary lg:text-[39px]">
              Elder_Care
            </span>
            <h1 className="text-4xl leading-tight font-semibold text-foreground lg:text-[56px]">
              {mode === 'forgot' ? 'Quên mật khẩu' : 'Đăng nhập'}
            </h1>
          </div>

          {mode === 'forgot' ? (
            <ForgotPassword
              onDone={() => {
                setResetDone(true)
                setMode('login')
              }}
              onCancel={() => setMode('login')}
            />
          ) : (
            <>
              {resetDone && <p role="status">Đã đặt mật khẩu mới. Đăng nhập bằng mật khẩu mới.</p>}
              <LoginForm
                large
                beforeSubmit={forgotLink}
                onLoggedIn={(data) => {
                  const home = homeOf({ ...data.user, mustChangePassword: data.mustChangePassword })
                  // Màn đích (#…) mang theo từ đường dẫn đã mở trước khi đăng nhập
                  onNavigate(home === '/' ? `/${window.location.hash}` : home)
                }}
              />
              <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
                {!resetAvailable && (
                  <p>
                    Quên mật khẩu? Nhân viên liên hệ Quản lý viện; người thân liên hệ Hành chính của viện để được cấp
                    lại sau khi xác minh danh tính.
                  </p>
                )}
                <p>
                  Chưa có tài khoản? Viện cấp tài khoản cho nhân viên và cho người thân sau khi gia đình làm thủ tục
                  với viện.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
