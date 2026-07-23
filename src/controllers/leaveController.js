import { db } from '../database.js'
import { sendMockSMS } from '../utils/sms.js'

function fmtDateTime(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day} ${d.toTimeString().slice(0, 5)}`
}

function calcDuration(startDate, endDate) {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.ceil((end - start) / 86400000) + 1
}

function calcApprovalSteps(duration) {
  if (duration < 14) return { steps: 1, approvers: ['tutor'] }
  if (duration < 28) return { steps: 2, approvers: ['tutor', 'counselor'] }
  if (duration < 57) return { steps: 3, approvers: ['tutor', 'counselor', 'college_leader'] }
  return { steps: 4, approvers: ['tutor', 'counselor', 'college_leader', 'party_secretary'] }
}

function getApproverByRole(role, department) {
  if (role === 'tutor') {
    return db.prepare("SELECT * FROM users WHERE role = 'tutor' AND department = ? LIMIT 1").get(department)
  }
  return db.prepare("SELECT * FROM users WHERE role = ? LIMIT 1").get(role)
}

function getLeaveDetail(leaveId) {
  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)
  if (!leave) return null

  const student = db.prepare('SELECT id, name, student_id, department, class_name, phone, parent_name, parent_phone FROM users WHERE id = ?').get(leave.student_id)
  const timeline = db.prepare('SELECT * FROM timeline WHERE leave_id = ? ORDER BY id ASC').all(leaveId)
  const attachments = db.prepare('SELECT * FROM attachments WHERE leave_id = ?').all(leaveId)

  let currentApprover = null
  if (leave.current_approver_id) {
    currentApprover = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(leave.current_approver_id)
  }

  return {
    ...leave,
    student,
    timeline,
    attachments,
    currentApprover: currentApprover ? currentApprover.name : null,
    currentApproverRole: currentApprover ? currentApprover.role : null
  }
}


export function getLeaves(req, res) {
  try {
    const { status, urgency, studentName, studentId, type, page = 1, pageSize = 20, role } = req.query

    let sql = 'SELECT l.*, u.name as student_name, u.student_id as sid, u.department, u.class_name FROM leaves l JOIN users u ON l.student_id = u.id WHERE 1=1'
    const params = []

    if (req.user.role === 'student') {
      sql += ' AND l.student_id = ?'
      params.push(req.user.id)
    }
    else if (req.user.role === 'tutor' && req.user.department) {
      sql += ' AND u.department = ?'
      params.push(req.user.department)
    }

    if (status) {
      sql += ' AND l.status = ?'
      params.push(status)
    }
    if (urgency) {
      sql += ' AND l.urgency = ?'
      params.push(urgency)
    }
    if (studentName) {
      sql += ' AND u.name LIKE ?'
      params.push(`%${studentName}%`)
    }
    if (studentId) {
      sql += ' AND u.student_id LIKE ?'
      params.push(`%${studentId}%`)
    }
    if (type) {
      sql += ' AND l.leave_type = ?'
      params.push(type)
    }

    if (req.query.pending === '1') {
      sql += ' AND (l.status IN ("pending","processing") OR (l.status="approved" AND l.stage="return" AND l.return_status="processing") OR (l.status="approved" AND l.stage="delay" AND l.delay_status="processing"))'
    }

    sql += ' ORDER BY l.created_at DESC'

    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    sql += ' LIMIT ? OFFSET ?'
    params.push(parseInt(pageSize), offset)

    const leaves = db.prepare(sql).all(...params)

    let countSql = 'SELECT COUNT(*) as total FROM leaves l JOIN users u ON l.student_id = u.id WHERE 1=1'
    const countParams = [...params.slice(0, -2)]
    const { total } = db.prepare(countSql).get(...countParams)

    res.json({
      code: 200,
      data: {
        list: leaves,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    })
  } catch (err) {
    console.error('[Leave] 获取列表失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function getLeaveById(req, res) {
  try {
    const leave = getLeaveDetail(parseInt(req.params.id))
    if (!leave) {
      return res.status(404).json({ code: 404, message: '请假记录不存在' })
    }

    if (req.user.role === 'student' && leave.student_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '权限不足' })
    }

    res.json({ code: 200, data: leave })
  } catch (err) {
    console.error('[Leave] 获取详情失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function submitLeave(req, res) {
  try {
    const {
      leaveType, startDate, endDate, reason, urgency,
      leavingCity, destinationProvince, destinationCity, destinationDetail,
      destinations, personalPhone, emergencyContactName, emergencyContactPhone,
      attachments
    } = req.body

    if (!leaveType || !startDate || !endDate || !reason) {
      return res.status(400).json({ code: 400, message: '请填写完整的请假信息' })
    }

    const duration = calcDuration(startDate, endDate)

    // 超过8周禁止提交
    if (duration > 56) {
      return res.status(400).json({
        code: 400,
        message: '请假时间超过8周上限（56天），请联系辅导员处理',
        canSubmit: false
      })
    }

    // 校验返校需提前1天
    const startDateObj = new Date(startDate)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    if (startDateObj < tomorrow) {
      return res.status(400).json({
        code: 400,
        message: '请假开始时间需至少提前1天',
        canSubmit: false
      })
    }

    const activeLeave = db.prepare(`
      SELECT id FROM leaves 
      WHERE student_id = ? AND status IN ('pending','processing')
    `).get(req.user.id)
    if (activeLeave) {
      return res.status(400).json({
        code: 400,
        message: '您有正在审批中的请假申请，请先完成或撤回后再提交新申请',
        activeLeaveId: activeLeave.id
      })
    }

    const needReturn = db.prepare(`
      SELECT id FROM leaves 
      WHERE student_id = ? AND status = 'approved' AND stage = 'initial'
    `).get(req.user.id)
    if (needReturn) {
      return res.status(400).json({
        code: 400,
        message: '您有已通过但尚未返校的请假记录，请先完成返校申请后再发起新请假',
        needReturnLeaveId: needReturn.id
      })
    }

    const { steps } = calcApprovalSteps(duration)

    const student = db.prepare('SELECT department FROM users WHERE id = ?').get(req.user.id)
    const firstApprover = getApproverByRole('tutor', student?.department)

    const now = new Date()

    const result = db.transaction(() => {
      const insertResult = db.prepare(`
        INSERT INTO leaves (
          student_id, leave_type, start_date, end_date, duration, reason, urgency,
          leaving_city, destination_province, destination_city, destination_detail,
          destinations_json,
          personal_phone, emergency_contact_name, emergency_contact_phone,
          status, stage, current_approver_id, current_step, total_steps
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        req.user.id, leaveType, startDate, endDate, duration,
        reason, urgency || 'normal',
        leavingCity ? 1 : 0, destinationProvince || null, destinationCity || null, destinationDetail || null,
        destinations ? JSON.stringify(destinations) : null,
        personalPhone || null, emergencyContactName || null, emergencyContactPhone || null,
        'processing', 'initial',
        firstApprover ? firstApprover.id : null, 1, steps
      )

      const leaveId = insertResult.lastInsertRowid

      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '提交申请', '请假申请已提交，进入审批流程', 'done')

      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '导师审批', firstApprover ? `待${firstApprover.name}审批` : '待审批', 'processing')

      if (attachments && Array.isArray(attachments)) {
        const insertAttach = db.prepare(`
          INSERT INTO attachments (leave_id, filename, original_name, file_path, file_size, mime_type)
          VALUES (?,?,?,?,?,?)
        `)
        for (const att of attachments) {
          insertAttach.run(leaveId, att.filename, att.originalName, att.filePath, att.fileSize, att.mimeType)
        }
      }

      return leaveId
    })()

    const leave = getLeaveDetail(result)

    res.json({
      code: 200,
      message: '请假申请提交成功',
      data: leave
    })
  } catch (err) {
    console.error('[Leave] 提交失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function approveLeave(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.status !== 'pending' && leave.status !== 'processing') {
      return res.status(400).json({ code: 400, message: '该申请当前状态不可审批' })
    }

    const now = new Date()
    const { steps, approvers } = calcApprovalSteps(leave.duration)
    const nextStep = leave.current_step + 1

    db.transaction(() => {
      if (nextStep > steps) {
        db.prepare(`UPDATE leaves SET status='approved', current_approver_id=NULL, current_step=0, total_steps=?, updated_at=datetime('now','localtime') WHERE id=?`)
          .run(steps, leaveId)
        db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
          .run(leaveId, fmtDateTime(now), '审批通过', '请假申请已审批通过，请按时返校', 'done')
      } else {
        const nextApproverRole = approvers[nextStep - 1]
        const student = db.prepare('SELECT department FROM users WHERE id = ?').get(leave.student_id)
        const nextApprover = getApproverByRole(nextApproverRole, student?.department)

        db.prepare(`UPDATE leaves SET current_approver_id=?, current_step=?, updated_at=datetime('now','localtime') WHERE id=?`)
          .run(nextApprover ? nextApprover.id : null, nextStep, leaveId)

        const approverTitles = { tutor: '导师审批', counselor: '辅导员审批', college_leader: '院领导审批', party_secretary: '副书记审批' }
        db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
          .run(leaveId, fmtDateTime(now), approverTitles[nextApproverRole] || '下一级审批', nextApprover ? `待${nextApprover.name}审批` : '待审批', 'processing')
      }

      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), `${req.user.name}审批通过`, '同意请假申请', 'done')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'approved')
      db.prepare("UPDATE leaves SET sms_sent=1 WHERE id=?").run(leaveId)
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '审批通过', data: updated })
  } catch (err) {
    console.error('[Leave] 审批失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function rejectLeave(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { reason, sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.status !== 'pending' && leave.status !== 'processing') {
      return res.status(400).json({ code: 400, message: '该申请当前状态不可审批' })
    }

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET status='rejected', reject_reason=?, current_approver_id=NULL, current_step=0, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(reason || '审批未通过', leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '审批拒绝', reason || '请假申请被拒绝', 'error')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'rejected', reason)
      db.prepare("UPDATE leaves SET sms_sent=1 WHERE id=?").run(leaveId)
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '已拒绝该请假申请', data: updated })
  } catch (err) {
    console.error('[Leave] 拒绝失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function returnBackLeave(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { reason, sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET status='pending', reject_reason=?, current_approver_id=NULL, current_step=0, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(reason || '请修改后重新提交', leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '驳回修改', reason || '申请被驳回，请修改后重新提交', 'error')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'returned', reason)
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '已驳回，等待学生修改', data: updated })
  } catch (err) {
    console.error('[Leave] 驳回失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function resubmitLeave(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.student_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '只能修改自己的请假申请' })
    }
    if (leave.status !== 'pending' && leave.status !== 'rejected') {
      return res.status(400).json({ code: 400, message: '当前状态不允许修改' })
    }

    const { leaveType, startDate, endDate, reason, urgency, leavingCity, destinationProvince, destinationCity, destinationDetail, personalPhone, emergencyContactName, emergencyContactPhone } = req.body
    const duration = calcDuration(startDate || leave.start_date, endDate || leave.end_date)

    if (duration > 56) {
      return res.status(400).json({ code: 400, message: '请假时间超过8周上限，请联系辅导员处理' })
    }

    const { steps } = calcApprovalSteps(duration)
    const student = db.prepare('SELECT department FROM users WHERE id = ?').get(req.user.id)
    const firstApprover = getApproverByRole('tutor', student?.department)
    const now = new Date()

    db.transaction(() => {
      db.prepare(`
        UPDATE leaves SET 
          leave_type=?, start_date=?, end_date=?, duration=?, reason=?, urgency=?,
          leaving_city=?, destination_province=?, destination_city=?, destination_detail=?,
          personal_phone=?, emergency_contact_name=?, emergency_contact_phone=?,
          status='processing', reject_reason='', current_approver_id=?, current_step=1, total_steps=?,
          updated_at=datetime('now','localtime')
        WHERE id=?
      `).run(
        leaveType || leave.leave_type, startDate || leave.start_date, endDate || leave.end_date,
        duration, reason || leave.reason, urgency || leave.urgency,
        leavingCity !== undefined ? (leavingCity ? 1 : 0) : leave.leaving_city,
        destinationProvince || leave.destination_province, destinationCity || leave.destination_city,
        destinationDetail || leave.destination_detail,
        personalPhone || leave.personal_phone, emergencyContactName || leave.emergency_contact_name,
        emergencyContactPhone || leave.emergency_contact_phone,
        firstApprover ? firstApprover.id : null, steps, leaveId
      )

      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '重新提交', '已修改并重新提交，等待审批', 'processing')
    })()

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '修改并重新提交成功', data: updated })
  } catch (err) {
    console.error('[Leave] 重新提交失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function applyReturn(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.student_id !== req.user.id) return res.status(403).json({ code: 403, message: '权限不足' })
    if (leave.status !== 'approved' || leave.stage !== 'initial') {
      return res.status(400).json({ code: 400, message: '当前状态不允许申请返校' })
    }

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET stage='return', return_status='processing', current_approver_id=NULL, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '申请返校', '返校申请已提交，等待确认', 'processing')
    })()

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '返校申请已提交', data: updated })
  } catch (err) {
    console.error('[Leave] 返校申请失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function approveReturn(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.return_status !== 'processing') {
      return res.status(400).json({ code: 400, message: '当前状态不允许审批返校' })
    }

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET return_status='approved', updated_at=datetime('now','localtime') WHERE id=?`).run(leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '返校审批通过', '返校申请已通过，欢迎回校', 'done')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'return_approved')
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '返校审批通过', data: updated })
  } catch (err) {
    console.error('[Leave] 返校审批失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function rejectReturn(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { reason, sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET return_status='rejected', reject_reason=?, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(reason || '返校申请未通过', leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '返校申请被拒', reason || '返校申请被拒绝', 'error')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'rejected', reason)
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '已拒绝返校申请', data: updated })
  } catch (err) {
    console.error('[Leave] 拒绝返校失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function applyDelay(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { delayDays, delayReason } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.student_id !== req.user.id) return res.status(403).json({ code: 403, message: '权限不足' })
    if (leave.status !== 'approved') {
      return res.status(400).json({ code: 400, message: '当前状态不允许申请延期' })
    }

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET stage='delay', delay_status='processing', delay_reason=?, delay_days=?, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(delayReason || null, delayDays || 0, leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '申请延期返校', `延期返校申请已提交（延期${delayDays || 0}天），等待审批`, 'processing')
    })()

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '延期返校申请已提交', data: updated })
  } catch (err) {
    console.error('[Leave] 延期申请失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function approveDelay(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })
    if (leave.delay_status !== 'processing') {
      return res.status(400).json({ code: 400, message: '当前状态不允许审批延期' })
    }

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET delay_status='approved', updated_at=datetime('now','localtime') WHERE id=?`).run(leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '延期审批通过', '延期返校申请已通过', 'done')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'delay_approved')
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '延期审批通过', data: updated })
  } catch (err) {
    console.error('[Leave] 延期审批失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function rejectDelay(req, res) {
  try {
    const leaveId = parseInt(req.params.id)
    const { reason, sendSMS } = req.body
    const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(leaveId)

    if (!leave) return res.status(404).json({ code: 404, message: '请假记录不存在' })

    const now = new Date()

    db.transaction(() => {
      db.prepare(`UPDATE leaves SET delay_status='rejected', reject_reason=?, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(reason || '延期申请未通过', leaveId)
      db.prepare(`INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)`)
        .run(leaveId, fmtDateTime(now), '延期申请驳回', reason || '延期申请被驳回，请按原计划返校', 'error')
    })()

    if (sendSMS && leave.personal_phone) {
      const student = db.prepare('SELECT name FROM users WHERE id = ?').get(leave.student_id)
      sendMockSMS(leave.personal_phone, student?.name || '学生', leave.duration, 'delay_rejected', reason)
    }

    const updated = getLeaveDetail(leaveId)
    res.json({ code: 200, message: '已驳回延期申请', data: updated })
  } catch (err) {
    console.error('[Leave] 驳回延期失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}


export function getStatistics(req, res) {
  try {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const overview = {
      totalLeaves: db.prepare('SELECT COUNT(*) as count FROM leaves').get().count,
      todayLeaves: db.prepare("SELECT COUNT(*) as count FROM leaves WHERE start_date <= ? AND end_date >= ?").get(today, today).count,
      pendingCount: db.prepare("SELECT COUNT(*) as count FROM leaves WHERE status IN ('pending','processing')").get().count,
      approvedCount: db.prepare("SELECT COUNT(*) as count FROM leaves WHERE status='approved'").get().count,
      rejectedCount: db.prepare("SELECT COUNT(*) as count FROM leaves WHERE status='rejected'").get().count,
      overdueCount: db.prepare("SELECT COUNT(*) as count FROM leaves WHERE status='approved' AND stage='initial' AND end_date < ?").get(today).count
    }

    const typeDistribution = db.prepare(`
      SELECT leave_type as name, COUNT(*) as value FROM leaves GROUP BY leave_type ORDER BY value DESC
    `).all()

    const durationDistribution = [
      { name: '< 2周', value: db.prepare('SELECT COUNT(*) as count FROM leaves WHERE duration < 14').get().count },
      { name: '2-4周', value: db.prepare('SELECT COUNT(*) as count FROM leaves WHERE duration >= 14 AND duration < 28').get().count },
      { name: '4-8周', value: db.prepare('SELECT COUNT(*) as count FROM leaves WHERE duration >= 28 AND duration < 57').get().count },
      { name: '> 8周', value: db.prepare('SELECT COUNT(*) as count FROM leaves WHERE duration >= 57').get().count }
    ]

    const departmentStats = db.prepare(`
      SELECT u.department as name, COUNT(*) as value 
      FROM leaves l JOIN users u ON l.student_id = u.id 
      WHERE u.department IS NOT NULL 
      GROUP BY u.department ORDER BY value DESC
    `).all()

    const destinationDistribution = db.prepare(`
      SELECT destination_province as name, COUNT(*) as value 
      FROM leaves WHERE leaving_city=1 AND destination_province IS NOT NULL 
      GROUP BY destination_province ORDER BY value DESC
    `).all()

    const stayLeaveRatio = {
      staying: db.prepare('SELECT COUNT(*) as count FROM leaves WHERE leaving_city=0').get().count,
      leaving: db.prepare('SELECT COUNT(*) as count FROM leaves WHERE leaving_city=1').get().count
    }

    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const monthlyRanking = db.prepare(`
      SELECT u.name, u.student_id, u.department, COUNT(*) as count 
      FROM leaves l JOIN users u ON l.student_id = u.id 
      WHERE l.created_at >= ? 
      GROUP BY l.student_id ORDER BY count DESC LIMIT 10
    `).all(monthStart)

    const overdueList = db.prepare(`
      SELECT l.*, u.name as student_name, u.student_id as sid, u.department, u.class_name
      FROM leaves l JOIN users u ON l.student_id = u.id
      WHERE l.status='approved' AND l.stage='initial' AND l.end_date < ?
    `).all(today)

    res.json({
      code: 200,
      data: {
        overview,
        typeDistribution,
        durationDistribution,
        departmentStats,
        destinationDistribution,
        stayLeaveRatio,
        monthlyRanking,
        overdueList
      }
    })
  } catch (err) {
    console.error('[Leave] 统计失败:', err)
    res.status(500).json({ code: 500, message: '服务器内部错误' })
  }
}
