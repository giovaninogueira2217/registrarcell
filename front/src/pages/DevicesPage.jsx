import React, { useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '../api'

/* ---------- Toast simples ---------- */
function useToast() {
  const [toasts, setToasts] = useState([])
  const notify = (msg) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }
  const Toasts = () => (
    <div style={{
      position:'fixed', right:16, bottom:16, zIndex:99999,
      display:'grid', gap:8, pointerEvents:'none'
    }}>
      {toasts.map(t => (
        <div key={t.id}
          style={{
            pointerEvents:'auto',
            background:'var(--card)',
            border:'1px solid var(--border)',
            color:'var(--text)',
            padding:'10px 12px',
            borderRadius:10,
            boxShadow:'0 6px 24px rgba(0,0,0,.25)',
            fontSize:14,
          }}>
          {t.msg}
        </div>
      ))}
    </div>
  )
  return { notify, Toasts }
}

/* ---------- helpers de status ---------- */
const STATUS_LABEL = {
  ok: 'OK',
  banido: 'Banido',
  desconectado: 'Desconectado',
  livre: 'Livre',
}
const STATUS_COLOR = {
  ok: 'var(--ok, #10b981)',
  banido: 'var(--ban, #ef4444)',
  desconectado: '#f59e0b',
  livre: '#3b82f6',
}
function StatusChip({ status, small=false }) {
  const label = STATUS_LABEL[status] ?? status
  const color = STATUS_COLOR[status] ?? '#94a3b8'
  return (
    <span className="badge" style={{ fontSize: small?11:12, padding: small?'2px 6px':'4px 8px', gap:6 }}>
      <span style={{ width:8, height:8, borderRadius:999, background:color, display:'inline-block' }} />
      {label}
    </span>
  )
}

/* ---------- Modal simples ---------- */
function Modal({ open, title, onClose, children }) {
  if (!open) return null
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999
    }}>
      <div style={{
        width:'min(720px, 92vw)', maxHeight:'80vh', overflow:'auto',
        background:'var(--card)', border:'1px solid var(--border)',
        borderRadius:12, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,.35)'
      }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <h3 style={{margin:0}}>{title}</h3>
          <button className="btn" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ---------- Logs por número ---------- */
function NumberLogs({ numberId }) {
  const [logs, setLogs] = useState([])
  const [allOpen, setAllOpen] = useState(false)
  const [allLogs, setAllLogs] = useState([])

  useEffect(() => {
    (async()=> {
      try { setLogs(await apiGet(`/numbers/${numberId}/logs?limit=3`)) } catch {}
    })()
  }, [numberId])

  async function openAll() {
    setAllOpen(true)
    try { setAllLogs(await apiGet(`/numbers/${numberId}/logs?limit=1000`)) } catch {}
  }

  return (
    <>
      <div className="small-log" style={{marginTop:4}}>
        {logs.length === 0
          ? <span style={{opacity:.8}}>Sem logs.</span>
          : logs.map(l => (
              <div key={l.id}>• {l.message} <span style={{opacity:.7}}>({new Date(l.created_at+'Z').toLocaleString()})</span></div>
            ))
        }
        {logs.length >= 3 && (
          <div>
            <button className="btn" style={{marginTop:6}} onClick={openAll}>Ver todos</button>
          </div>
        )}
      </div>

      <Modal open={allOpen} title="Todos os logs do número" onClose={()=>setAllOpen(false)}>
        {allLogs.length === 0
          ? <div style={{color:'#aab6cf'}}>Sem logs.</div>
          : allLogs.map(l => (
              <div key={l.id} style={{padding:'6px 0', borderBottom:'1px dashed var(--border)'}}>
                <div style={{fontWeight:600}}>{l.type}</div>
                <div>{l.message}</div>
                <div className="small-log">{new Date(l.created_at+'Z').toLocaleString()}</div>
              </div>
            ))
        }
      </Modal>
    </>
  )
}

/* ---------- Lista de números (cliente + status + logs) ---------- */
function NumberList({ deviceId, numbers, onChanged, onLocalChange, notify }) {
  const [list, setList] = useState(numbers || [])
  const [clients, setClients] = useState([])

  // UI do "adicionar"
  const [showAdd, setShowAdd] = useState(false)
  const [phone, setPhone] = useState('')
  const [clientForNew, setClientForNew] = useState('')

  // edição de cliente por item
  const [editing, setEditing] = useState(null)

  // confirmar exclusão
  const [confirmDel, setConfirmDel] = useState(null)

  useEffect(() => { setList(numbers || []) }, [numbers])
  useEffect(() => { (async()=>{ try{ setClients(await apiGet('/clients')) }catch{} })() }, [])

  async function add() {
    const tel = phone.trim()
    if (!tel) return
    try {
      const newRow = await apiPost(`/devices/${deviceId}/numbers`, { phone: tel, client_id: clientForNew || null })
      // limpa e fecha o form
      setPhone(''); setClientForNew(''); setShowAdd(false)
      // atualiza local sem mexer no restante
      setList(prev => [newRow, ...prev])
      onLocalChange?.(prev => [newRow, ...prev])
      notify?.(`Número ${newRow.phone} adicionado ao ${deviceId}.`)
      // se quiser atualizar o restante da página (stats), descomente:
      // onChanged?.()
    } catch (err) {
      alert('Erro ao adicionar número: ' + (err.message || err))
    }
  }

 async function remove(id) {
    if (confirmDel !== id) {
      setConfirmDel(id)
      setTimeout(() => setConfirmDel(null), 5000)
      return
    }
    try {
      const removed = list.find(n => n.id === id)
      await apiDelete(`/numbers/${id}`)
      setConfirmDel(null)
      setList(prev => prev.filter(n => n.id !== id))
      onLocalChange?.(prev => prev.filter(n => n.id !== id))
      onChanged?.()
      notify?.(`Número ${removed?.phone || ''} removido.`)
    } catch (err) {
      alert('Erro ao remover: ' + (err.message || err))
    }
  }

   async function setClient(id, cid) {
    try {
      const updated = await apiPatch(`/numbers/${id}`, { client_id: cid || null })
      setEditing(null)
      setList(prev => prev.map(n => n.id === id
        ? { ...n, client_id: updated.client_id, client_name: updated.client_name, client_color: updated.client_color }
        : n))
      onLocalChange?.(prev => prev.map(n => n.id === id
        ? { ...n, client_id: updated.client_id, client_name: updated.client_name, client_color: updated.client_color }
        : n))
      onChanged?.()
      notify?.(`Cliente ${updated.client_name || 'removido'} para ${updated.phone}.`)
    } catch (err) {
      alert('Erro ao vincular cliente: ' + (err.message || err))
    }
  }


    return (
    <div className="numbers-wrap">
      {/* Cabeçalho da seção de números */}
      <div className="numbers-header">
        <span className="badge">Números: {list.length}</span>
        <div className="actions">
          <button
            className={'btn ' + (showAdd ? '' : 'primary') + ' sm'}
            onClick={() => setShowAdd(v => !v)}
          >
            {showAdd ? 'Cancelar' : 'Adicionar número'}
          </button>
        </div>
      </div>

      {/* Mini-form de adicionar */}
      {showAdd && (
        <div className="numbers-add row">
          <input
            className="input sm"
            placeholder="Ex.: +55 11 90000-0000"
            value={phone}
            onChange={e=>setPhone(e.target.value)}
            onKeyDown={e => (e.key === 'Enter') && add()}
          />
          <div className="actions">
            <select
              className="select sm"
              value={clientForNew}
              onChange={e=>setClientForNew(e.target.value)}
            >
              <option value="">Sem cliente</option>
              {clients.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn primary sm" onClick={add}>Salvar</button>
          </div>
        </div>
      )}

      {/* Lista compacta */}
      <div className="numbers-list">
        {list.map(n => (
          <div key={n.id} className="number-item">
            <div className="ni-left">
              <span className="dot" style={{background: n.client_color || '#64748b'}} />
              <strong className="ni-phone">{n.phone}</strong>
              <span className={'mini-tag ' + (n.client_name ? '' : 'muted')}>
                {n.client_name || 'Sem cliente'}
              </span>
            </div>

            <div className="ni-right">
              <span className="ni-status"><StatusChip status={n.status} small /></span>

              {/* Editar cliente inline */}
              <button
                className="btn icon sm"
                title="Vincular/editar cliente"
                onClick={()=> setEditing(n.id)}
              >✎</button>

              {/* Remover */}
              <button
                title={confirmDel===n.id?'Confirmar excluir':'Remover número'}
                onClick={()=>remove(n.id)}
                className={'btn icon sm ' + (confirmDel===n.id?'danger':'')}
              >
                {confirmDel===n.id?'Confirmar':'✕'}
              </button>
            </div>

            {/* Se estiver editando, mostra seletor abaixo do item */}
            {editing === n.id && (
              <div className="number-edit">
                <select
                  className="select sm"
                  defaultValue={n.client_id || ''}
                  onChange={e=>setClient(n.id, e.target.value)}
                >
                  <option value="">Sem cliente</option>
                  {clients.map(c=> <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button className="btn sm" onClick={()=> setEditing(null)}>OK</button>
              </div>
            )}

            {/* Logs compactos + botão “ver todos” (mantém seu comportamento) */}
            <div className="number-logs">
              <NumberLogs numberId={n.id} />
            </div>
          </div>
        ))}
        {list.length === 0 && <span style={{color:'#aab6cf'}}>Sem números</span>}
      </div>
    </div>
  )
}

/* ---------- Linha de aparelho ---------- */
function DeviceRow({ d, onAnyChange, notify }) {
  const [note, setNote] = useState(d.note || '')
  const [noteOpen, setNoteOpen] = useState(false)
  const [numbers, setNumbers] = useState(d.numbers || [])
  const [confirmDel, setConfirmDel] = useState(false)

  // Popover para alterar status por número
  const [statusOpen, setStatusOpen] = useState(false)
  const [selNumberId, setSelNumberId] = useState('')
  const [selStatus, setSelStatus] = useState('ok')

  useEffect(() => { setNumbers(d.numbers || []) }, [d.numbers])
  useEffect(() => { setNote(d.note || '') }, [d.note])

  async function saveNoteModal() {
    try {
      await apiPatch(`/devices/${d.id}`, { note })
      setNoteOpen(false)
      notify?.(`Comentário salvo em ${d.name}.`)
      await onAnyChange?.()
    } catch (err) { alert('Erro ao salvar comentário: ' + (err.message || err)) }
  }

  async function toggleDisabled() {
    try { await apiPatch(`/devices/${d.id}`, { is_disabled: d.is_disabled ? 0 : 1 }); await onAnyChange?.() }
    catch (err) { alert('Erro ao atualizar: ' + (err.message || err)) }
  }

  async function removeDevice() {
    if (!confirmDel) { setConfirmDel(true); setTimeout(()=>setConfirmDel(false), 5000); return }
    try { await apiDelete(`/devices/${d.id}`); await onAnyChange?.() }
    catch (err) { alert('Erro ao apagar: ' + (err.message || err)) }
  }

  async function applyNumberStatus() {
    if (!selNumberId) { alert('Selecione um número.'); return }
    try {
      const updated = await apiPatch(`/numbers/${selNumberId}`, { status: selStatus })
      setNumbers(prev => prev.map(n => n.id === updated.id ? { ...n, status: updated.status } : n))
      setStatusOpen(false); setSelNumberId(''); setSelStatus('ok')
      notify?.(`Status do número ${updated.phone} no ${d.name} alterado para ${STATUS_LABEL[updated.status] ?? updated.status}.`)
      await onAnyChange?.()
    } catch (e) {
      alert('Erro ao alterar status do número: ' + (e.message || e))
    }
  }

  const notePreview = (note || '').trim()

  return (
    <>
      <tr className={d.is_disabled ? 'disabled-row' : ''}>
        <td>
          <div style={{fontWeight:600, display:'flex', alignItems:'center', gap:8}}>
            {d.name}
            {d.is_disabled ? <span className="badge disabled">Desativado</span> : null}
          </div>
          <div style={{fontSize:12, color:'#aab6cf'}}>{d.brand || '—'}</div>
        </td>
        <td>{d.imei || '—'}</td>

        <td style={{minWidth:420}}>
          <NumberList
            deviceId={d.id}
            numbers={numbers}
            onChanged={onAnyChange}
            onLocalChange={(fn) => setNumbers(prev => fn(prev))}
            notify={notify}
          />
        </td>

        <td style={{minWidth:260}}>
          <div className="actions" style={{gap:6}}>
            <button className="btn" onClick={()=> setStatusOpen(v=>!v)}>
              {statusOpen ? 'Fechar' : 'Alterar status'}
            </button>
          </div>
          {statusOpen && (
            <div className="card" style={{marginTop:8}}>
              <div style={{display:'grid', gap:8}}>
                <select className="select" value={selNumberId} onChange={e=>setSelNumberId(e.target.value)}>
                  <option value="">Selecione o número…</option>
                  {numbers.map(n => (
                    <option key={n.id} value={n.id}>
                      {n.phone} — {STATUS_LABEL[n.status] ?? n.status}
                    </option>
                  ))}
                </select>
                <select className="select" value={selStatus} onChange={e=>setSelStatus(e.target.value)}>
                  <option value="ok">OK</option>
                  <option value="banido">Banido</option>
                  <option value="desconectado">Desconectado</option>
                  <option value="livre">Livre</option>
                </select>
                <div className="actions" style={{justifyContent:'flex-end'}}>
                  <button className="btn primary" onClick={applyNumberStatus}>Aplicar</button>
                </div>
              </div>
            </div>
          )}
        </td>

        <td style={{minWidth:260}}>
          <div className="actions" style={{gap:6, marginBottom:8}}>
            <button
              className={'btn ' + (d.is_disabled ? 'success' : '')}
              onClick={toggleDisabled}
              title={d.is_disabled ? 'Reativar celular' : 'Desativar celular'}
            >
              {d.is_disabled ? 'Reativar' : 'Desativar'}
            </button>
            <button className="btn" onClick={()=>setNoteOpen(true)}>
              {notePreview ? '💬 Comentário' : '📝 Adicionar comentário'}
            </button>
          </div>

          {notePreview ? (
            <div className="small-log" title={notePreview}
                style={{maxWidth:240, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
              {notePreview}
            </div>
          ) : null}
        </td>

        <td style={{width:60}}>
          <button className={'btn ' + (confirmDel?'danger':'')} onClick={removeDevice}>
            {confirmDel ? 'Confirmar excluir' : 'Excluir'}
          </button>
        </td>
      </tr>

      {/* Modal de comentário */}
      <Modal open={noteOpen} title={`Comentário de ${d.name}`} onClose={()=>setNoteOpen(false)}>
        <textarea
          className="input"
          rows={5}
          placeholder="Ex.: Celular sem Wi-Fi, revisar amanhã…"
          value={note}
          onChange={e=>setNote(e.target.value)}
          style={{width:'100%', resize:'vertical'}}
        />
        <div className="actions" style={{marginTop:10, justifyContent:'flex-end'}}>
          <button className="btn primary" onClick={saveNoteModal}>Salvar</button>
        </div>
      </Modal>
    </>
  )
}

/* ---------- Página com filtros recebidos do Header ---------- */
export function DevicesPage({ filters, onChanged }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const { notify, Toasts } = useToast()

  // Sorteio persistente (mantém escolha ao recarregar)
  const getSavedSort = () => {
    const val = (filters?.sort) || localStorage.getItem('sortOrder') || 'device'
    return (val === 'number' ? 'number' : 'device')
  }
  const [currentSort, setCurrentSort] = useState(getSavedSort())

  // quando header mudar a escolha, atualiza e persiste
  useEffect(() => {
    if (filters?.sort && filters.sort !== currentSort) {
      setCurrentSort(filters.sort)
    }
  }, [filters?.sort])
  useEffect(() => {
    localStorage.setItem('sortOrder', currentSort)
  }, [currentSort])

  // debounce de busca ao digitar
  const searchRef = useRef(null)

  async function load(paramsObj) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (paramsObj?.q?.trim()) params.set('q', paramsObj.q.trim())
      if (paramsObj?.status)     params.set('status', paramsObj.status)
      if (paramsObj?.clientId)   params.set('client_id', paramsObj.clientId)
      // ✅ usa sempre a escolha persistida
      params.set('order', currentSort)

      const rows = await apiGet(`/devices?${params.toString()}`)
      setList(rows)
    } catch (err) {
      alert('Erro ao carregar: ' + (err.message || err))
    } finally {
      setLoading(false)
      onChanged?.()
    }
  }

  // 1ª carga
  useEffect(() => { load(filters || {}) }, []) // eslint-disable-line

  // Busca ao digitar (debounce)
  useEffect(() => {
    if (!filters) return
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => load(filters), 300)
    return () => searchRef.current && clearTimeout(searchRef.current)
  }, [filters?.q]) // eslint-disable-line

  // Troca imediata quando muda status/cliente ou a escolha corrente de sort
  useEffect(() => { if (filters) load(filters) }, [filters?.status, filters?.clientId, filters?.key, currentSort]) // eslint-disable-line

  // --------- ORDENAR também no front como segurança (espelha back) ----------
  const viewList = useMemo(() => {
    const arr = [...list]
    const sortKey = currentSort

    const digits = s => String(s||'').replace(/\D+/g,'')
    const cmpNumStr = (a, b) => {
      if (a.length !== b.length) return a.length - b.length
      return a.localeCompare(b)
    }
    const firstPhone = d => {
      if (!d.numbers || d.numbers.length === 0) return ''
      const ds = d.numbers.map(n => digits(n.phone)).filter(Boolean)
      if (ds.length === 0) return ''
      ds.sort(cmpNumStr)
      return ds[0]
    }
    const cmpDeviceName = (a, b) => {
      const ax = String(a.name||'').trim(), bx = String(b.name||'').trim()
      const an = ax.match(/^\d+$/) ? parseInt(ax,10) : NaN
      const bn = bx.match(/^\d+$/) ? parseInt(bx,10) : NaN
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
      return ax.localeCompare(bx, undefined, { numeric:true, sensitivity:'base' })
    }

    if (sortKey === 'number') {
      arr.sort((d1, d2) => {
        const p1 = firstPhone(d1), p2 = firstPhone(d2)
        if (p1 && p2) return cmpNumStr(p1, p2)
        if (p1 && !p2) return -1
        if (!p1 && p2) return 1
        return cmpDeviceName(d1, d2)
      })
    } else {
      arr.sort(cmpDeviceName)
    }
    return arr
  }, [list, currentSort])

  return (
    <div className="stack">
      <div className="card">
        <h3 style={{marginTop:0}}>Lista de Celulares</h3>
        <div style={{overflowX:'auto'}}>
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>IMEI</th>
                <th>Números (cliente e status)</th>
                <th>Alterar status</th>
                <th>Comentário</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {viewList.map(d => (
                <DeviceRow
                  key={d.id}
                  d={d}
                  onAnyChange={()=>load(filters)}
                  notify={notify}
                />
              ))}
            </tbody>
          </table>
          {loading && <div style={{padding:12, color:'#aab6cf'}}>Carregando…</div>}
          {!loading && viewList.length === 0 && <div style={{padding:12, color:'#aab6cf'}}>Nenhum celular encontrado.</div>}
        </div>
      </div>

      {/* Toasts */}
      <Toasts />
    </div>
  )
}
