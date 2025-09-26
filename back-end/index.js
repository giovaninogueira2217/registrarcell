import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { db } from './db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const clientDist = process.env.CLIENT_DIST_PATH || path.resolve(__dirname, '../front/dist')

const PORT = Number(process.env.PORT || 5055)
const BIND = process.env.BIND || '127.0.0.1'

// status válidos POR NÚMERO
const VALID_STATUS = new Set(['ok','banido','desconectado','livre'])

/* ---------- Utils ---------- */
function norm(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function addLog({ device_id=null, number_id=null, client_id=null, type, message }) {
  db.prepare(
    `INSERT INTO logs (device_id, number_id, client_id, type, message)
     VALUES (?, ?, ?, ?, ?)`
  ).run(device_id, number_id, client_id, type, message)
}
function cmpNaturalName(a, b) {
  const ax = String(a || '').trim(), bx = String(b || '').trim()
  const an = ax.match(/^\d+$/) ? parseInt(ax, 10) : NaN
  const bn = bx.match(/^\d+$/) ? parseInt(bx, 10) : NaN
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
  return ax.localeCompare(bx, undefined, { numeric: true, sensitivity: 'base' })
}

/* ---------- Settings helpers (key/value)  ---------- */
function getSetting(key) {
  const row = db.prepare('SELECT value, updated_at FROM settings WHERE key=?').get(key)
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value)
    return { ...parsed, updated_at: row.updated_at }
  } catch {
    return { value: row.value, updated_at: row.updated_at }
  }
}
function setSetting(key, obj) {
  const value = JSON.stringify(obj ?? {})
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = datetime('now')
  `).run(key, value)
  return getSetting(key)
}

/* ---------- Busca números do aparelho APLICANDO filtros ---------- */
function getNumbersFiltered(deviceId, { status, client_id }) {
  const parts = ['n.device_id = ?']
  const vals  = [deviceId]

  if (status && VALID_STATUS.has(status)) {
    parts.push('n.status = ?'); vals.push(status)
  }
  if (client_id) {
    parts.push('n.client_id = ?'); vals.push(Number(client_id))
  }

  const sql = `
    SELECT n.id, n.phone, n.client_id, n.status,
           c.name AS client_name, c.color AS client_color
    FROM numbers n
    LEFT JOIN clients c ON c.id = n.client_id
    WHERE ${parts.join(' AND ')}
    ORDER BY n.id DESC
  `
  return db.prepare(sql).all(...vals)
}

/* ---------- Health ---------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Celulares API online' })
})

/* ---------- Devices (lista com filtros & ordenação) ---------- */
// ?q=texto&status=ok|banido|desconectado|livre&client_id=123&order=number|device
app.get('/api/devices', (req, res) => {
  const { q, status, client_id, order } = req.query || {}
  const where = []
  const params = []

  // por status do NÚMERO
  if (status && VALID_STATUS.has(status)) {
    where.push(`EXISTS (
      SELECT 1 FROM numbers nn
      WHERE nn.device_id = d.id AND nn.status = ?
    )`)
    params.push(status)
  }

  // por cliente
  if (client_id) {
    where.push(`EXISTS (
      SELECT 1 FROM numbers n2
      WHERE n2.device_id = d.id AND n2.client_id = ?
    )`)
    params.push(Number(client_id))
  }

  // busca livre: nome/brand/imei/número OU nome do cliente
  if (q && String(q).trim()) {
    const pat = `%${String(q).trim()}%`
    where.push(`(
      d.name LIKE ? OR d.brand LIKE ? OR d.imei LIKE ?
      OR EXISTS (
        SELECT 1
        FROM numbers n3
        LEFT JOIN clients c3 ON c3.id = n3.client_id
        WHERE n3.device_id = d.id
          AND (n3.phone LIKE ? OR c3.name LIKE ?)
      )
    )`)
    params.push(pat, pat, pat, pat, pat)
  }

  const baseSql = `
    SELECT d.id, d.name, d.brand, d.imei, d.status, d.is_disabled, d.note, d.created_at
    FROM devices d
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY d.id DESC
  `
  const devices = db.prepare(baseSql).all(...params)

  // aplica filtros de números por aparelho
  const withNums = devices
    .map(d => ({ ...d, numbers: getNumbersFiltered(d.id, { status, client_id }) }))
    .filter(d => d.numbers.length > 0 || (!status && !client_id))

  // ordenação no back-end
  let result
  if ((order || 'device') === 'number') {
    result = [...withNums].sort((a, b) => {
      const digits = s => String(s||'').replace(/\D+/g,'')
      const minOf = arr => arr.length
        ? arr.map(n=>digits(n.phone)).filter(Boolean).sort((x,y)=>{
            if (x.length !== y.length) return x.length - y.length
            return x.localeCompare(y)
          })[0]
        : ''
      const minA = minOf(a.numbers)
      const minB = minOf(b.numbers)
      if (minA && minB) {
        if (minA.length !== minB.length) return minA.length - minB.length
        const cmp = minA.localeCompare(minB)
        if (cmp !== 0) return cmp
      } else if (minA && !minB) return -1
      else if (!minA && minB) return 1
      return cmpNaturalName(a.name, b.name)
    })
  } else {
    result = [...withNums].sort((a, b) => cmpNaturalName(a.name, b.name))
  }

  res.json(result)
})

/* ---------- Devices CRUD ---------- */
app.post('/api/devices', (req, res) => {
  const { name, brand, imei, is_disabled = 0, note = null } = req.body || {}

  const nameN = norm(name)
  const brandN = norm(brand)
  const imeiN  = norm(imei)
  const noteN  = norm(note)

  if (!nameN) return res.status(400).json({ error: 'Campo "name" é obrigatório.' })

  // nome único (case-insensitive + trim)
  const dup = db.prepare(`
    SELECT id FROM devices
    WHERE lower(trim(name)) = lower(trim(?))
  `).get(nameN)
  if (dup) {
    return res.status(409).json({ error: 'Nome de celular já cadastrado.' })
  }

  try {
    const info = db.prepare(`
      INSERT INTO devices (name, brand, imei, is_disabled, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(nameN, brandN, imeiN, Number(!!is_disabled), noteN)

    addLog({ device_id: info.lastInsertRowid, type: 'device_created', message: `Aparelho criado: ${nameN}` })

    const row = db.prepare(`
      SELECT id, name, brand, imei, status, is_disabled, note, created_at
      FROM devices WHERE id=?
    `).get(info.lastInsertRowid)

    res.status(201).json(row)
  } catch (err) {
    if (String(err).includes('UNIQUE constraint failed: devices.imei')) {
      return res.status(409).json({ error: 'IMEI já cadastrado.' })
    }
    if (String(err).includes('UNIQUE constraint failed') &&
        (String(err).includes('devices.imei') || String(err).includes('uq_devices_name_norm'))) {
      const msg = String(err).includes('devices.imei')
        ? 'IMEI já cadastrado.'
        : 'Nome de celular já cadastrado.'
      return res.status(409).json({ error: msg })
    }
    console.error(err)
    res.status(500).json({ error: 'Erro ao criar dispositivo.' })
  }
})

app.patch('/api/devices/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  const { name, brand, imei, status, is_disabled, note } = req.body || {}

  const nameN  = name  !== undefined ? norm(name)  : undefined
  const brandN = brand !== undefined ? norm(brand) : undefined
  const imeiN  = imei  !== undefined ? norm(imei)  : undefined
  const noteN  = note  !== undefined ? norm(note)  : undefined

  if (status && !VALID_STATUS.has(status)) {
    return res.status(400).json({ error: 'Status inválido. Use "ok", "banido", "desconectado" ou "livre".' })
  }

  const cur = db.prepare('SELECT id, status FROM devices WHERE id=?').get(id)
  if (!cur) return res.status(404).json({ error: 'Dispositivo não encontrado' })

  if (nameN !== undefined && nameN !== null) {
    const clash = db.prepare(`
      SELECT id FROM devices
      WHERE lower(trim(name)) = lower(trim(?)) AND id <> ?
    `).get(nameN, id)
    if (clash) {
      return res.status(409).json({ error: 'Nome de celular já cadastrado.' })
    }
  }

  try {
    const fields = []
    const values = []

    if (nameN !== undefined)       { fields.push('name=?');        values.push(nameN) }
    if (brandN !== undefined)      { fields.push('brand=?');       values.push(brandN) }
    if (imeiN !== undefined)       { fields.push('imei=?');        values.push(imeiN) }
    if (status !== undefined)      { fields.push('status=?');      values.push(status) } // legado
    if (is_disabled !== undefined) { fields.push('is_disabled=?'); values.push(Number(!!is_disabled)) }
    if (noteN !== undefined)       { fields.push('note=?');        values.push(noteN) }

    if (!fields.length) return res.status(400).json({ error: 'Nada para atualizar.' })

    values.push(id)
    db.prepare(`UPDATE devices SET ${fields.join(', ')} WHERE id=?`).run(...values)

    if (status !== undefined && status !== cur.status) {
      addLog({ device_id: id, type: 'device_status', message: `Status (LEGADO): ${cur.status} → ${status}` })
    }

    const row = db.prepare(`
      SELECT id, name, brand, imei, status, is_disabled, note, created_at
      FROM devices WHERE id=?
    `).get(id)

    // devolve com numbers (para refresh completo em algumas telas)
    res.json({ ...row, numbers: getNumbersFiltered(id, {}) })
  } catch (err) {
    if (String(err).includes('UNIQUE constraint failed') &&
        (String(err).includes('devices.imei') || String(err).includes('uq_devices_name_norm'))) {
      const msg = String(err).includes('devices.imei')
        ? 'IMEI já cadastrado.'
        : 'Nome de celular já cadastrado.'
      return res.status(409).json({ error: msg })
    }
    console.error(err)
    res.status(500).json({ error: 'Erro ao atualizar dispositivo.' })
  }
})

app.delete('/api/devices/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  const info = db.prepare('DELETE FROM devices WHERE id=?').run(id)
  if (!info.changes) return res.status(404).json({ error: 'Dispositivo não encontrado' })
  res.json({ success: true })
})

/* ---------- Numbers ---------- */
app.post('/api/devices/:id/numbers', (req, res) => {
  const deviceId = Number(req.params.id)
  if (!Number.isFinite(deviceId)) return res.status(400).json({ error: 'ID inválido' })

  let { phone, client_id } = req.body || {}
  if (!phone) return res.status(400).json({ error: 'Campo "phone" é obrigatório.' })

  const has = db.prepare('SELECT id FROM devices WHERE id=?').get(deviceId)
  if (!has) return res.status(404).json({ error: 'Dispositivo não encontrado' })

  if (client_id === '') client_id = null
  if (client_id != null) {
    const cli = db.prepare('SELECT id FROM clients WHERE id=?').get(Number(client_id))
    if (!cli) return res.status(400).json({ error: 'Cliente inválido.' })
  }

  try {
    const info = db.prepare(`
      INSERT INTO numbers (device_id, phone, client_id, status)
      VALUES (?, ?, ?, 'ok')
    `).run(deviceId, phone, client_id ?? null)

    const row = db.prepare(`
      SELECT n.id, n.phone, n.client_id, n.status,
             c.name AS client_name, c.color AS client_color
      FROM numbers n LEFT JOIN clients c ON c.id = n.client_id
      WHERE n.id = ?
    `).get(info.lastInsertRowid)

    addLog({
      device_id: deviceId, number_id: info.lastInsertRowid, client_id: client_id ?? null,
      type: 'number_added', message: `Número ${row.phone} adicionado`
    })

    res.status(201).json(row)
  } catch (err) {
    if (String(err).includes('UNIQUE constraint failed: numbers.phone')) {
      return res.status(409).json({ error: 'Número já cadastrado.' })
    }
    console.error(err)
    res.status(500).json({ error: 'Erro ao adicionar número.' })
  }
})

app.patch('/api/numbers/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  let { client_id, status } = req.body || {}
  if (client_id === '') client_id = null

  if (status !== undefined && !VALID_STATUS.has(status)) {
    return res.status(400).json({ error: 'Status inválido. Use "ok", "banido", "desconectado" ou "livre".' })
  }
  if (client_id != null) {
    const cli = db.prepare('SELECT id FROM clients WHERE id=?').get(Number(client_id))
    if (!cli) return res.status(400).json({ error: 'Cliente inválido.' })
  }

  const before = db.prepare(`
    SELECT n.id, n.phone, n.device_id, n.client_id, n.status, c.name AS client_name
    FROM numbers n LEFT JOIN clients c ON c.id = n.client_id
    WHERE n.id=?
  `).get(id)
  if (!before) return res.status(404).json({ error: 'Número não encontrado' })

  const fields = [], values = []
  if (client_id !== undefined) { fields.push('client_id=?'); values.push(client_id ?? null) }
  if (status    !== undefined) { fields.push('status=?');    values.push(status) }
  if (!fields.length) return res.status(400).json({ error: 'Nada para atualizar.' })

  values.push(id)
  db.prepare(`UPDATE numbers SET ${fields.join(', ')} WHERE id=?`).run(...values)

  const after = db.prepare(`
    SELECT n.id, n.phone, n.device_id, n.client_id, n.status, c.name AS client_name
    FROM numbers n LEFT JOIN clients c ON c.id = n.client_id
    WHERE n.id=?
  `).get(id)

  if (client_id !== undefined) {
    let msg
    if (!before.client_id && after.client_id) msg = `Número ${after.phone} → cliente ${after.client_name}`
    else if (before.client_id && !after.client_id) msg = `Número ${after.phone} desvinculado de cliente`
    else if (before.client_id !== after.client_id) msg = `Número ${after.phone} → cliente ${after.client_name}`
    if (msg) addLog({ device_id: after.device_id, number_id: after.id, client_id: after.client_id ?? null, type: 'number_client_set', message: msg })
  }
  if (status !== undefined && status !== before.status) {
    addLog({ device_id: after.device_id, number_id: after.id, type: 'number_status', message: `Status: ${before.status} → ${status}` })
  }

  res.json(after)
})

app.delete('/api/numbers/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  const prev = db.prepare('SELECT id, device_id, phone FROM numbers WHERE id=?').get(id)
  const info = db.prepare('DELETE FROM numbers WHERE id=?').run(id)
  if (!info.changes) return res.status(404).json({ error: 'Número não encontrado' })

  if (prev) addLog({ device_id: prev.device_id, number_id: prev.id, type: 'number_deleted', message: `Número ${prev.phone} removido` })
  res.json({ success: true })
})

/* ---------- Logs por número ---------- */
app.get('/api/numbers/:id/logs', (req, res) => {
  const id = Number(req.params.id)
  const limit = Math.min(1000, Number(req.query.limit) || 3)

  const exists = db.prepare('SELECT id FROM numbers WHERE id=?').get(id)
  if (!exists) return res.status(404).json({ error: 'Número não encontrado' })

  const rows = db.prepare(`
    SELECT id, type, message, created_at
    FROM logs
    WHERE number_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(id, limit)

  res.json(rows)
})

/* ---------- Clients ---------- */
app.get('/api/clients', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, color, created_at, COALESCE(updated_at, created_at) AS updated_at
    FROM clients
    ORDER BY id DESC
  `).all()
  res.json(rows)
})

app.post('/api/clients', (req, res) => {
  const { name, color = '#64748b' } = req.body || {}
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Campo "name" é obrigatório.' })

  const info = db.prepare(`
    INSERT INTO clients (name, color, updated_at)
    VALUES (?, ?, datetime('now'))
  `).run(String(name).trim(), String(color).trim())

  addLog({ client_id: info.lastInsertRowid, type: 'client_created', message: `Cliente criado: ${String(name).trim()}` })

  const row = db.prepare(`
    SELECT id, name, color, created_at, updated_at
    FROM clients WHERE id=?
  `).get(info.lastInsertRowid)

  res.status(201).json(row)
})

app.patch('/api/clients/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  const { name, color } = req.body || {}
  const fields = [], values = []

  if (name !== undefined)  { fields.push('name=?');  values.push(String(name).trim() || null) }
  if (color !== undefined) { fields.push('color=?'); values.push(String(color).trim() || '#64748b') }
  if (!fields.length) return res.status(400).json({ error: 'Nada para atualizar.' })

  const cur = db.prepare('SELECT id, name FROM clients WHERE id=?').get(id)
  if (!cur) return res.status(404).json({ error: 'Cliente não encontrado' })

  fields.push(`updated_at = datetime('now')`)
  values.push(id)
  db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id=?`).run(...values)

  addLog({ client_id: id, type: 'client_updated', message: `Cliente atualizado: ${name ?? cur.name}` })

  const row = db.prepare(`
    SELECT id, name, color, created_at, updated_at
    FROM clients WHERE id=?
  `).get(id)

  res.json(row)
})

app.delete('/api/clients/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' })

  const cur = db.prepare('SELECT id, name FROM clients WHERE id=?').get(id)
  if (!cur) return res.status(404).json({ error: 'Cliente não encontrado' })

  db.prepare('UPDATE numbers SET client_id=NULL WHERE client_id=?').run(id)
  db.prepare('DELETE FROM clients WHERE id=?').run(id)

  addLog({ client_id: id, type: 'client_deleted', message: `Cliente removido: ${cur.name}` })

  res.json({ success: true })
})

/* ---------- Stats (por NÚMERO) ---------- */
app.get('/api/stats', (req, res) => {
  const rows = db.prepare('SELECT status, COUNT(*) as c FROM numbers GROUP BY status').all()
  const map = Object.fromEntries(rows.map(r => [r.status, r.c]))
  const ok = map.ok ?? 0
  const banido = map.banido ?? 0
  const desconectado = map.desconectado ?? 0
  const livre = map.livre ?? 0
  res.json({ ok, banido, desconectado, livre, total: ok + banido + desconectado + livre })
})

/* ---------- Última atualização (data + comentário) ---------- */
app.get('/api/last-update', (req, res) => {
  try {
    const s = getSetting('last_update')
    if (!s) return res.json({ note: '', date: null, updated_at: null })
    res.json(s)
  } catch (e) {
    console.error('GET /api/last-update:', e)
    res.status(500).json({ error: 'Falha ao ler última atualização.' })
  }
})

app.post('/api/last-update', (req, res) => {
  try {
    let { note = '', date = null } = req.body || {}
    note = String(note || '').trim()
    if (date != null) {
      date = String(date).trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Formato de data inválido. Use YYYY-MM-DD.' })
      }
    }
    const saved = setSetting('last_update', { note, date })
    res.json(saved)
  } catch (e) {
    console.error('POST /api/last-update:', e)
    res.status(500).json({ error: 'Falha ao salvar última atualização.' })
  }
})

/* ---------- Fallback dev (opcional) ---------- */
if (process.env.NODE_ENV === 'production') {
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).end()
      res.sendFile(path.join(clientDist, 'index.html'))
    })
  } else {
    console.warn('⚠️  Build não encontrado em', clientDist)
  }
}

/* ---------- Start ---------- */
app.listen(PORT, BIND, () => {
  console.log(`✅ API HTTP em http://${BIND}:${PORT}`)
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 (Front estático em: ${clientDist})`)
  }
})
