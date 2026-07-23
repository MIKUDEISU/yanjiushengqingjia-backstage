import bcrypt from 'bcryptjs'
import { db } from '../database.js'
import { generateToken } from '../middleware/auth.js'

export function login(req, res) {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '请输入用户名和密码' })
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)

    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }

    const isValid = bcrypt.compareSync(password, user.password)
    if (!isValid) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' })
    }

    const token = generateToken(user)

    res.json({
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          studentId: user.student_id,
          department: user.department,
          className: user.class_name,
          phone: user.phone,
          parentName: user.parent_name,
          parentPhone: user.parent_phone
        }
      }
    })
  } catch (err) {
    console.error('[Auth] 登录失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}

export function getProfile(req, res) {
  try {
    const user = db.prepare(`
      SELECT id, username, name, role, student_id, department, class_name, phone, parent_name, parent_phone, avatar_url, created_at
      FROM users WHERE id = ?
    `).get(req.user.id)

    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' })
    }

    res.json({
      code: 200,
      data: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        studentId: user.student_id,
        department: user.department,
        className: user.class_name,
        phone: user.phone,
        parentName: user.parent_name,
        parentPhone: user.parent_phone,
        avatarUrl: user.avatar_url,
        createdAt: user.created_at
      }
    })
  } catch (err) {
    console.error('[Auth] 获取用户信息失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}

export function changePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '请输入旧密码和新密码' })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ code: 400, message: '新密码长度不能少于6位' })
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
    const isValid = bcrypt.compareSync(oldPassword, user.password)

    if (!isValid) {
      return res.status(400).json({ code: 400, message: '旧密码错误' })
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10)
    db.prepare('UPDATE users SET password = ?, updated_at = datetime("now","localtime") WHERE id = ?')
      .run(hashedPassword, req.user.id)

    res.json({ code: 200, message: '密码修改成功' })
  } catch (err) {
    console.error('[Auth] 修改密码失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}
