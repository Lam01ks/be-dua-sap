import 'dotenv/config'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import mysql from 'mysql2/promise'

const requiredDatabaseSettings = ['DB_HOST', 'DB_USER', 'DB_NAME']
const missingSettings = requiredDatabaseSettings.filter((setting) => !process.env[setting])

if (missingSettings.length > 0) {
  throw new Error(`Missing database configuration: ${missingSettings.join(', ')}`)
}

const app = express()
const port = Number(process.env.PORT) || 3000
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
})

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '10kb' }))

app.get('/api/health', async (_request, response, next) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok' })
  } catch (error) {
    next(error)
  }
})

app.post('/api/register', async (request, response, next) => {
  const { fullName, email, password } = request.body ?? {}
  const normalizedName = typeof fullName === 'string' ? fullName.trim() : ''
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''

  if (
    normalizedName.length < 2 ||
    normalizedName.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    response.status(400).json({
      message: 'Vui lòng nhập họ tên hợp lệ, email hợp lệ và mật khẩu từ 8 đến 72 ký tự.',
    })
    return
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [normalizedName, normalizedEmail, passwordHash],
    )

    response.status(201).json({
      message: 'Đăng ký thành công.',
      user: { id: result.insertId, fullName: normalizedName, email: normalizedEmail },
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      response.status(409).json({ message: 'Email này đã được đăng ký.' })
      return
    }

    next(error)
  }
})

app.use((error, _request, response, _next) => {
  console.error('API request failed:', error)
  const status = error.status === 400 ? 400 : 500
  response.status(status).json({
    message: status === 400 ? 'Dữ liệu JSON không hợp lệ.' : 'Lỗi máy chủ.',
  })
})

const server = app.listen(port, () => {
  console.log(`Dừa Sáp API đang chạy tại http://localhost:${port}`)
})

const shutdown = async () => {
  server.close(async () => {
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
