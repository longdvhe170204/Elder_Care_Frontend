# AGENTS.md: luật cho mọi công cụ AI ở kho web

Kho Elder_Care_Frontend (web React của hệ thống quản lý viện dưỡng lão). Luật chung của cả dự án ở kho Elder_Care đặt cạnh; file này chỉ trỏ tới, không chép lại. Ba kho phải clone cạnh nhau trong cùng thư mục cha (README mục "Ba kho của hệ thống").

Nếu công cụ của bạn không tự đọc file này, dán câu sau vào đầu cuộc trò chuyện:

> Đọc AGENTS.md, README.md và DESIGN.md (mục 0 trước) của kho web, rồi ../Elder_Care/AGENTS.md, ../Elder_Care/CLAUDE.md và ../Elder_Care/docs/team-plan.md. Tôi là <A/B/C/D/E>, đang làm <feature NNN hoặc màn> trên nhánh <tên nhánh>.

## Đọc gì

1. [README.md](README.md): cấu trúc `src/`, luật viết mã web, lệnh.
2. [DESIGN.md](DESIGN.md): nguồn quy tắc giao diện duy nhất cho web và app (từ 6.18.0 nằm ở kho này). Sửa bố cục một màn thì đọc mục 0 "Mẫu màn" trước.
3. `../Elder_Care/AGENTS.md`, `../Elder_Care/CLAUDE.md`: luật chung (nghiệp vụ, hợp đồng API, test trước, git). Khi khác file này thì hai file đó thắng.
4. Khi làm một màn: `../Elder_Care/specs/NNN-*/` (tasks, spec, `contracts/api-NNN.yaml`) và `../Elder_Care/docs/business/nghiep-vu.md`.

## Giao diện

- Mỗi màn theo một mẫu trong bảng "Mẫu màn" (DESIGN.md mục 0), dùng component chung ở `src/common` của mẫu đó, ghi tên mẫu trong mô tả PR. Không mẫu nào hợp thì đề xuất phương án, chờ chủ dự án duyệt và thêm vào bảng rồi mới sửa mã.
- Đổi bố cục thì đưa 2–3 phương án trên một trang so sánh, đề xuất chọn một kèm lý do, chờ chủ dự án chọn (DESIGN.md mục 13 điều 2); sửa lỗi không đổi bố cục thì không cần.
- Không tự đặt phong cách riêng cho một màn; skill thẩm mỹ (`frontend-design` hay tương tự) chỉ dùng cho cách xếp bên trong một mẫu.
- Dùng Claude Code thì gọi `/ui-redesign <tên màn>`; công cụ khác làm theo ba bước trong [.claude/skills/ui-redesign/SKILL.md](.claude/skills/ui-redesign/SKILL.md) (đánh giá, phương án, làm sau khi duyệt).
- Đổi quy định giao diện: sửa DESIGN.md, `src/index.css` trong cùng PR với mã, tăng `version`, ghi mục 16 (DESIGN.md mục 13 điều 5).

## Dùng Codex (hoặc công cụ khác không phải Claude Code)

Nhóm dùng Codex cùng Claude Code (chủ dự án báo 2026-11-20). Codex tự đọc file này khi chạy trong kho web; không có lệnh `/ui-redesign`, skill `frontend-design`, trang Artifact hay trình duyệt trong app như Claude Code, nên làm như sau:

- **Chạy ở đâu:** mở Codex trong thư mục `Elder_Care_Frontend` (để Codex nạp file này). Agent phải đọc được kho bên cạnh `../Elder_Care` (spec, hợp đồng, nghiệp vụ, luật chung); nếu chế độ sandbox của Codex chặn đọc ngoài thư mục đang mở thì cho phép thư mục đó (theo tài liệu của bản Codex đang dùng) hoặc dán nội dung cần đọc vào cuộc trò chuyện. Không để agent đoán spec khi không đọc được.
- **Sửa bố cục:** bảo Codex đọc và làm đúng ba bước trong [.claude/skills/ui-redesign/SKILL.md](.claude/skills/ui-redesign/SKILL.md), hết mỗi bước dừng lại. Bỏ qua câu "nạp `frontend-design`": phương án bám DESIGN.md và mẫu màn ở mục 0.
- **Trang so sánh thay cho Artifact:** xuất thành một file HTML tự chứa (màu theo token DESIGN.md, không tải gì từ mạng) đặt ngoài kho, ví dụ thư mục tạm của máy; không commit. Mở bằng trình duyệt để xem, gửi file hoặc ảnh chụp cho chủ dự án chọn.
- **Xem màn thay cho trình duyệt trong app:** người dùng tự mở `http://localhost:8081` (bản Docker) hoặc `npm run dev` (backend chạy trên máy), đăng nhập tài khoản demo, chụp màn và chép lỗi console gửi lại cho Codex. Không báo "đã xem trên trình duyệt" khi chưa ai mở.
- **Giới hạn như Claude Code:** chỉ sửa trong kho web (sửa `../Elder_Care` chỉ khi người dùng yêu cầu, ví dụ ghi `docs/progress.md`), không commit, push; chạy `npm test`, `npm run lint`, `npm run build` trước khi báo xong.

## Không được làm

- Không commit, push, merge khi người dùng chưa đồng ý; không push thẳng `develop`.
- Không sửa `src/api/` (sinh từ hợp đồng, chạy `npm run gen:api`), không đổi `package.json`, `src/components/ui/`, `src/common/` khi không phải A.
- Không thêm trường, endpoint ngoài hợp đồng; không đoán nghiệp vụ, chưa rõ thì tra Q-xx ở `../Elder_Care/docs/business/nghiep-vu.md` mục 24 và hỏi chủ dự án.
