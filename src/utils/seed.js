import bcrypt from 'bcryptjs'
import { db } from '../database.js'

export function seedDatabase() {
  console.log('[Seed] 开始填充测试数据...')

  const hashedPassword = bcrypt.hashSync('123456', 10)

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password, name, role, student_id, department, class_name, phone, parent_name, parent_phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const users = [
    ['student1', hashedPassword, '张明远', 'student', '202401001', '计算机科学', '2401班', '13800001001', '张父', '13900001001'],
    ['student2', hashedPassword, '李思远', 'student', '202401002', '软件工程', '2402班', '13800001002', '李母', '13900001002'],
    ['student3', hashedPassword, '王浩然', 'student', '202401003', '人工智能', '2401班', '13800001003', '王父', '13900001003'],
    ['student4', hashedPassword, '陈雨桐', 'student', '202402001', '计算机科学', '2301班', '13800001004', '陈母', '13900001004'],
    ['student5', hashedPassword, '刘子涵', 'student', '202402002', '数据科学', '2302班', '13800001005', '刘父', '13900001005'],
    ['student6', hashedPassword, '赵逸凡', 'student', '202403001', '网络工程', '2201班', '13800001006', '赵父', '13900001006'],
    ['tutor1', hashedPassword, '李教授', 'tutor', null, '计算机科学', null, '13800002001', null, null],
    ['tutor2', hashedPassword, '王教授', 'tutor', null, '软件工程', null, '13800002002', null, null],
    ['counselor1', hashedPassword, '张辅导员', 'counselor', null, null, null, '13800003001', null, null],
    ['college_leader1', hashedPassword, '刘主任', 'college_leader', null, null, null, '13800004001', null, null],
    ['party_secretary1', hashedPassword, '陈副书记', 'party_secretary', null, null, null, '13800005001', null, null],
    ['admin1', hashedPassword, '系统管理员', 'admin', null, null, null, '13800006001', null, null],
  ]

  const insertUsers = db.transaction(() => {
    for (const u of users) {
      insertUser.run(...u)
    }
  })
  insertUsers()

  const insertLeave = db.prepare(`
    INSERT INTO leaves (
      student_id, leave_type, start_date, end_date, duration, reason, urgency,
      leaving_city, destination_province, destination_city, destination_detail,
      personal_phone, emergency_contact_name, emergency_contact_phone,
      status, stage, return_status, delay_status,
      current_step, total_steps, reject_reason
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)

  const insertTimeline = db.prepare(`
    INSERT INTO timeline (leave_id, time, title, desc, status) VALUES (?,?,?,?,?)
  `)

  const now = new Date()
  const fmtDate = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const fmtDateTime = (d) => {
    return fmtDate(d) + ' ' + d.toTimeString().slice(0, 5)
  }

  const leaveData = [
    { sid: 1, type: '事假', start: -1, dur: 3, reason: '回家参加亲属婚礼', urgency: 'normal', leaving: 1, destProv: '陕西省', destCity: '西安市', destDetail: '碑林区咸宁西路28号', status: 'pending', step: 0, total: 2 },
    { sid: 2, type: '病假', start: -5, dur: 10, reason: '急性阑尾炎手术及术后恢复', urgency: 'urgent', leaving: 0, status: 'processing', step: 1, total: 2 },
    { sid: 3, type: '回家', start: -14, dur: 5, reason: '回家处理家庭事务', urgency: 'normal', leaving: 1, destProv: '湖南省', destCity: '长沙市', destDetail: '岳麓区麓山南路932号', status: 'approved', step: 2, total: 2 },
    { sid: 4, type: '事假', start: -21, dur: 7, reason: '参加ACM-ICPC区域赛', urgency: 'urgent', leaving: 1, destProv: '浙江省', destCity: '杭州市', destDetail: '西湖区浙大路38号', status: 'approved', stage: 'return', returnStatus: 'processing', step: 2, total: 2 },
    { sid: 5, type: '病假', start: -30, dur: 14, reason: '腿部骨折需进行手术及术后恢复', urgency: 'urgent', leaving: 0, status: 'approved', stage: 'return', returnStatus: 'approved', step: 3, total: 3 },
    { sid: 6, type: '其他', start: -10, dur: 60, reason: '参加国际学术会议', urgency: 'normal', leaving: 1, destProv: '广东省', destCity: '深圳市', destDetail: '南山区学苑大道1088号', status: 'rejected', rejectReason: '请假时间超过8周上限，请联系辅导员处理', step: 0, total: 4 },
  ]

  const insertAllLeaves = db.transaction(() => {
    for (const ld of leaveData) {
      const startDate = new Date(now.getTime() + ld.start * 86400000)
      const endDate = new Date(startDate.getTime() + (ld.dur - 1) * 86400000)
      
      const result = insertLeave.run(
        ld.sid, ld.type, fmtDate(startDate), fmtDate(endDate), ld.dur,
        ld.reason, ld.urgency,
        ld.leaving || 0, ld.destProv || null, ld.destCity || null, ld.destDetail || null,
        '138' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        ld.sid % 2 === 0 ? '父亲' : '母亲',
        '139' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
        ld.status, ld.stage || 'initial', ld.returnStatus || null, ld.delayStatus || null,
        ld.step, ld.total, ld.rejectReason || null
      )
      
      const leaveId = result.lastInsertRowid

      insertTimeline.run(leaveId, fmtDateTime(new Date(startDate.getTime() - 2 * 86400000)), '提交申请', '请假申请已提交', 'done')
      
      if (ld.status === 'processing' && ld.step >= 1) {
        insertTimeline.run(leaveId, fmtDateTime(new Date(startDate.getTime() - 1 * 86400000)), '导师审批', '导师-李教授已审批通过', 'done')
        insertTimeline.run(leaveId, fmtDateTime(new Date()), '辅导员审批', '待辅导员-张辅导员审批', 'processing')
      }
      
      if (ld.status === 'approved' && ld.step >= 2) {
        insertTimeline.run(leaveId, fmtDateTime(new Date(startDate.getTime() - 1 * 86400000)), '导师审批', '导师已审批通过', 'done')
        insertTimeline.run(leaveId, fmtDateTime(new Date(startDate.getTime() - 0.5 * 86400000)), '辅导员审批', '辅导员已审批通过', 'done')
        insertTimeline.run(leaveId, fmtDateTime(new Date()), '审批通过', '请假申请已审批通过，请按时返校', 'done')
      }
      
      if (ld.status === 'rejected') {
        insertTimeline.run(leaveId, fmtDateTime(new Date(startDate.getTime() - 1 * 86400000)), '导师审批', '导师已审批通过', 'done')
        insertTimeline.run(leaveId, fmtDateTime(new Date()), '审批拒绝', ld.rejectReason || '审批未通过', 'error')
      }
      
      if (ld.stage === 'return') {
        insertTimeline.run(leaveId, fmtDateTime(new Date(endDate.getTime() - 1 * 86400000)), '申请返校', '返校申请已提交', ld.returnStatus === 'processing' ? 'processing' : 'done')
        if (ld.returnStatus === 'approved') {
          insertTimeline.run(leaveId, fmtDateTime(new Date()), '返校审批通过', '返校申请已通过，欢迎回校', 'done')
        }
      }
    }
  })
  insertAllLeaves()

  console.log('[Seed] 测试数据填充完成')
  console.log('  - 学生账号: student1~student6 / 密码: 123456')
  console.log('  - 导师账号: tutor1~tutor2 / 密码: 123456')
  console.log('  - 辅导员账号: counselor1 / 密码: 123456')
  console.log('  - 院领导账号: college_leader1 / 密码: 123456')
  console.log('  - 副书记账号: party_secretary1 / 密码: 123456')
  console.log('  - 管理员账号: admin1 / 密码: 123456')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  import('../database.js').then(({ initDatabase }) => {
    initDatabase()
    seedDatabase()
    process.exit(0)
  })
}
