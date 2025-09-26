import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, NotebookPen } from 'lucide-react'
import { apiGet, apiPost } from '../../api'

function fmtBR(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return '—'
  return `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`
}

export default function LastUpdateControl() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState({ note: '', date: null, updated_at: null })
  const [tmpNote, setTmpNote] = useState('')
  const [tmpDate, setTmpDate] = useState('')

  // carrega ao montar
  useEffect(() => {
    (async () => {
      try { setValue(await apiGet('/last-update')) } catch {}
    })()
  }, [])

  // permite abrir de QUALQUER lugar com: window.dispatchEvent(new CustomEvent('open-last-update'))
  useEffect(() => {
    const handler = () => openModal()
    window.addEventListener('open-last-update', handler)
    return () => window.removeEventListener('open-last-update', handler)
  }, [])

  function openModal() {
    setTmpNote(value.note || '')
    setTmpDate(value.date || new Date().toISOString().slice(0,10)) // YYYY-MM-DD
    setOpen(true)
  }

  async function save() {
    try {
      const saved = await apiPost('/last-update', { note: tmpNote, date: tmpDate })
      setValue(saved)
      setOpen(false)
    } catch (e) {
      alert('Erro ao salvar: ' + (e.message || e))
    }
  }

  // trava o scroll e fecha com ESC
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => (e.key === 'Escape') && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label   = value.date ? fmtBR(value.date) : '—'
  const tooltip = value.note ? `Última atualização: ${label}\n${value.note}` : `Última atualização: ${label}`

  return (
    <>
      {/* Botão gatilho (posicione onde quiser) */}
      <button
        className="btn"
        onClick={openModal}
        title={tooltip}
        style={{
          display:'inline-flex', alignItems:'center', gap:8,
          whiteSpace:'nowrap', maxWidth:300, overflow:'hidden', textOverflow:'ellipsis'
        }}
      >
        <CalendarDays size={16} />
        <span style={{fontWeight:600}}>Últ. atualização:</span>
        <span>{label}</span>
        {value.note ? <span style={{opacity:.8}}>• {value.note}</span> : null}
        <NotebookPen size={14} style={{opacity:.7}} />
      </button>

      {/* Modal GLOBAL via portal (renderiza no <body>, centralizado e sobre TODAS as páginas) */}
      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{
            position:'fixed', inset:0, zIndex:10000,
            background:'rgba(0,0,0,.45)',
            display:'grid', placeItems:'center',
            padding:24
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog" aria-modal="true"
            style={{
              width:'min(560px, 92vw)', maxHeight:'85vh', overflow:'auto',
              background:'var(--card)', border:'1px solid var(--border)',
              borderRadius:12, padding:16, boxShadow:'0 10px 40px rgba(0,0,0,.35)'
            }}
          >
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
              <h3 style={{margin:0}}>Última atualização</h3>
              <button className="btn" onClick={()=>setOpen(false)}>Fechar</button>
            </div>

            <div style={{display:'grid', gap:10}}>
              <label style={{display:'grid', gap:6}}>
                <span style={{fontSize:12, opacity:.8}}>Data</span>
                <input type="date" className="input" value={tmpDate} onChange={e=>setTmpDate(e.target.value)} />
              </label>

              <label style={{display:'grid', gap:6}}>
                <span style={{fontSize:12, opacity:.8}}>Anotação</span>
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Ex.: chips atualizados, conferir amanhã…"
                  value={tmpNote}
                  onChange={e=>setTmpNote(e.target.value)}
                  style={{resize:'vertical'}}
                />
              </label>

              <div className="actions" style={{justifyContent:'flex-end'}}>
                <button className="btn primary" onClick={save}>Salvar</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
