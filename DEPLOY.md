# TEBAK ANGKA — PRODUCTION

Versi ini memakai:
- akun pemain (daftar/login)
- password di-hash dengan bcrypt
- JWT httpOnly cookie
- PostgreSQL
- game session ditandatangani server
- angka rahasia dibuat server
- skor dihitung server
- timer dan jumlah kesempatan diverifikasi server
- admin login dengan cookie httpOnly
- pengaturan game + leaderboard
- health check `/health`

## Environment variables

`DATABASE_URL` = connection string PostgreSQL

`ADMIN_PASSWORD` = password admin yang kuat

`JWT_SECRET` = secret acak panjang (Render bisa generate otomatis dari render.yaml)

`NODE_ENV=production`

## Local

Node.js 18+ direkomendasikan.

```bash
npm install
npm start
```

Untuk lokal, PostgreSQL harus tersedia dan `DATABASE_URL` diarahkan ke database lokal.

## Deploy

1. Buat PostgreSQL database (misalnya dari provider hosting pilihanmu).
2. Buat Web Service Node.js.
3. Upload repository project ini ke GitHub.
4. Set environment variables `DATABASE_URL`, `ADMIN_PASSWORD`, dan `JWT_SECRET`.
5. Build command: `npm install`
6. Start command: `npm start`
7. Health check: `/health`

`render.yaml` disediakan sebagai template deployment Render. Jika menggunakan provider lain, masukkan environment variables dan command yang sama.

## URL

Game: `https://DOMAIN-KAMU/`

Admin: `https://DOMAIN-KAMU/admin`

## Keamanan

Jangan memakai `admin123`. Jangan menaruh password database di source code.

Versi ini jauh lebih aman daripada versi SQLite/header-password sebelumnya, tetapi untuk skala besar masih disarankan menambah rate limiting, email verification/reset password, audit log admin, dan monitoring.
