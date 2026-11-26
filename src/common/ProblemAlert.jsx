import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Báo lỗi lệnh trong khung đang thao tác (DESIGN.md 7.4; 000 T099). `problem` lấy từ problemOf; 412 thì màn truyền
// giá trị mới qua children vì cách hiển thị tùy tài nguyên. Điều kiện trùng câu detail không liệt kê lại (góp ý test BF-12
// 2026-11-25: nhiều lệnh của backend gửi cùng một câu ở cả hai chỗ).
export function ProblemAlert({ problem, title, children }) {
  if (!problem) return null
  const conditions = problem.unmetConditions.filter((c) => c.description !== problem.detail)
  const hasBody = problem.detail || conditions.length > 0 || children
  return (
    <Alert variant="attention">
      <AlertTitle>{title || problem.title}</AlertTitle>
      {hasBody && (
        <AlertDescription>
          {problem.detail && <p>{problem.detail}</p>}
          {conditions.length > 0 && (
            <ul className="ml-4 list-disc">
              {conditions.map((c) => (
                <li key={c.code}>{c.description}</li>
              ))}
            </ul>
          )}
          {children}
        </AlertDescription>
      )}
    </Alert>
  )
}
