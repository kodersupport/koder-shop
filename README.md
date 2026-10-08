# KODER SHOP — Hướng dẫn đầy đủ (không cần sửa code)

Gồm:
- **Web Shop** (`/`) — bán hàng, mã giảm giá, thông báo, hết hàng
- **Web Admin** (`/admin`) — quản lý kho, mã, thông báo, STK/Zalo

**Dữ liệu lưu trên GitHub** → khi Render ngủ / restart **KHÔNG MẤT**.

---

## TÓM TẮT 4 BƯỚC

1. Tạo repo GitHub + upload toàn bộ file trong thư mục này  
2. Tạo GitHub Token (PAT)  
3. Deploy Render + dán biến môi trường  
4. Vào `/admin` và `/`

---

## BƯỚC 1 — Tạo repo GitHub

1. Mở: https://github.com/new  
2. **Repository name:** `koder-shop`  
3. Chọn **Public**  
4. **Không** tích Add README / .gitignore / license  
5. Bấm **Create repository**

### Upload file

1. Giải nén / mở thư mục `koder-shop` trên máy  
2. Vào repo vừa tạo trên GitHub  
3. Bấm **uploading an existing file**  
4. Kéo **tất cả** các mục sau vào (giữ nguyên cấu trúc thư mục):

```
package.json
server.js
README.md
FILES.txt
.gitignore
.env.example
data/          (cả thư mục JSON)
public/
  ├── shop.html      ← WEB SHOP (trang bán hàng)
  └── admin.html     ← WEB ADMIN (trang quản lý)
```

5. Bấm **Commit changes**

> Kiểm tra trên GitHub phải thấy: `server.js`, `package.json`, `public/shop.html`, `public/admin.html`.

---

## BƯỚC 2 — Tạo GitHub Token (để lưu dữ liệu vĩnh viễn)

1. Mở: https://github.com/settings/tokens  
2. Bấm **Generate new token** → **Generate new token (classic)**  
3. **Note:** `koder-shop`  
4. **Expiration:** chọn `No expiration` hoặc 1 năm  
5. Tích quyền: **`repo`** (full control of private repositories)  
   - Nếu repo Public vẫn tích `repo` cho đơn giản  
6. Bấm **Generate token**  
7. **Copy token** ngay (dạng `ghp_xxxx...`) — chỉ hiện 1 lần

Giữ token này để dán vào Render ở bước sau.

---

## BƯỚC 3 — Deploy lên Render

1. Mở: https://dashboard.render.com  
2. Đăng ký / đăng nhập bằng **GitHub**  
3. Bấm **New +** → **Web Service**  
4. Chọn repo **`koder-shop`** → **Connect**  
5. Điền đúng:

| Ô trên Render | Giá trị |
|---------------|---------|
| **Name** | `koder-shop` |
| **Region** | Singapore (hoặc gần bạn) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** |

6. Mở **Environment** → **Add Environment Variable**, thêm **đủ 6 dòng**:

| Key | Value | Ghi chú |
|-----|--------|---------|
| `ADMIN_PASSWORD` | *(mật khẩu bạn tự đặt)* | Dùng để đăng nhập /admin |
| `SESSION_SECRET` | *(chuỗi bất kỳ, dài)* | Ví dụ: `koder_secret_abc_999` |
| `GITHUB_TOKEN` | `ghp_xxxx...` | Token vừa tạo ở Bước 2 |
| `GITHUB_OWNER` | *(username GitHub của bạn)* | Ví dụ: `nguyenvana` |
| `GITHUB_REPO` | `koder-shop` | Tên repo |
| `GITHUB_BRANCH` | `main` | Nhánh mặc định |

7. Bấm **Create Web Service**  
8. Đợi **2–5 phút** đến khi status = **Live**  
9. Copy URL, ví dụ: `https://koder-shop.onrender.com`

---

## BƯỚC 4 — Sử dụng

### Shop (khách)

```
https://TEN-APP.onrender.com/
```

- Xem sản phẩm, lọc game, tìm kiếm  
- Bấm sản phẩm → chọn gói → áp mã giảm giá → copy tin nhắn / mở Zalo  

### Admin (bạn)

```
https://TEN-APP.onrender.com/admin
```

- Đăng nhập bằng `ADMIN_PASSWORD`  
- Badge **GITHUB** (xanh) = dữ liệu lưu GitHub, không mất khi ngủ  
- Badge **LOCAL** (vàng) = thiếu Token, cần kiểm tra lại Environment  

#### Trong Admin bạn làm được:

| Tab | Việc |
|-----|------|
| **Kho** | Sửa số lượng từng gói. `0` = hết hàng trên shop |
| **Mã giảm** | Tạo / sửa / bật-tắt / xóa mã (% hoặc số tiền K) |
| **Thông báo** | Tạo popup hiện khi khách vào shop |
| **Cài đặt** | Link Zalo, STK, tên ngân hàng, chủ TK |

Mỗi lần **Lưu**, server ghi file JSON lên GitHub → dữ liệu còn mãi.

---

## Kiểm tra dữ liệu đã lưu GitHub chưa

1. Vào repo `koder-shop` trên GitHub  
2. Mở thư mục `data/`  
3. Sau khi sửa kho / mã trên Admin, refresh trang GitHub  
4. File `products.json` / `coupons.json`… sẽ có commit mới (message kiểu `Update stock: ...`)

---

## Lưu ý Render Free

- Sau ~15 phút không ai vào, web **ngủ**. Lần mở sau có thể chậm 30–60 giây — bình thường.  
- **Dữ liệu không mất** vì đã lưu GitHub (nếu đã set đúng 4 biến `GITHUB_*`).  
- Không xóa Token trên GitHub nếu vẫn dùng shop.

---

## Đổi mật khẩu / token sau này

Vào Render → Web Service `koder-shop` → **Environment** → sửa value → **Save** → đợi redeploy.

---

## Cấu trúc project (không cần sửa)

```
koder-shop/
├── package.json
├── server.js
├── FILES.txt               ← Giải thích từng file
├── .env.example
├── .gitignore
├── README.md
├── data/
│   ├── products.json
│   ├── coupons.json
│   ├── notices.json
│   └── settings.json
└── public/
    ├── shop.html           ← WEB SHOP  (bán hàng)   → URL /
    └── admin.html          ← WEB ADMIN (quản lý)    → URL /admin
```

| File HTML | Là gì | URL sau deploy |
|-----------|--------|----------------|
| **`public/shop.html`** | Web shop — khách mua hàng | `https://...onrender.com/` |
| **`public/admin.html`** | Web admin — bạn quản lý | `https://...onrender.com/admin` |

---

## Gặp lỗi?

| Hiện tượng | Cách xử lý |
|------------|------------|
| Admin hiện badge **LOCAL** | Kiểm tra 4 biến `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` trên Render |
| Lỗi GitHub 401 | Token sai hoặc hết hạn → tạo token mới, cập nhật Render |
| Lỗi GitHub 404 | Sai `GITHUB_OWNER` hoặc `GITHUB_REPO` (đúng username + tên repo) |
| Shop không load | Đợi service **Live**, mở `/api/health` xem `{ "ok": true }` |
| Quên mật khẩu admin | Đổi `ADMIN_PASSWORD` trên Render Environment |

---

© Koder Shop
