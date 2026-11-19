# CLAUDE.md

Hướng dẫn cho Claude Code ở kho web Elder_Care_Frontend. Luật chung của dự án ở kho Elder_Care đặt cạnh; file này không chép lại.

- Đầu mỗi phiên đọc [AGENTS.md](AGENTS.md) của kho này, rồi `../Elder_Care/CLAUDE.md` và `../Elder_Care/AGENTS.md` (luật chung, thứ tự đọc khi làm task, quy định git). Khác nhau thì hai file ở kho Elder_Care thắng.
- Giao diện: [DESIGN.md](DESIGN.md) gốc kho này (từ 6.18.0, chủ dự án chuyển sang 2026-11-20), dùng cho cả web và app. Đọc mục 0 "Mẫu màn" trước khi sửa bố cục.
- Sửa bố cục một màn: gọi `/ui-redesign <tên màn>` (`.claude/skills/ui-redesign/`), không gọi thẳng `/frontend-design`. Skill `frontend-design`, `shadcn` ở `.claude/skills/` là bản tải nguyên, không sửa (DESIGN.md mục 12).
- Lệnh: `npm ci`, `npm run dev`, `npm test` (một file: `npx vitest run <đường dẫn>`), `npm run lint`, `npm run build`, `npm run gen:api` (đọc hợp đồng ở `../Elder_Care/specs`). Chi tiết ở [README.md](README.md).
- Spec, hợp đồng, nghiệp vụ: `../Elder_Care/specs/NNN-*/`, `../Elder_Care/docs/business/nghiep-vu.md`. Tiến độ ghi ở `../Elder_Care/docs/progress.md`.
