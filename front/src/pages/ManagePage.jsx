import React, { useEffect, useState } from 'react'
import { apiGet, apiPost, apiPatch, apiDelete } from '../api'

function ClientForm({ onCreated }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#64748b')
  async function submit(e) {
    e.preventDefault()
    try {
      await apiPost('/clients', { name, color })
      setName(''); setColor('#64748b'); onCreated?.()
    } catch (e) { alert('Erro ao salvar cliente: ' + (e.message || e)) }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{marginTop:0}}>Cadastrar Cliente</h3>
      <div className="row">
        <input className="input" placeholder="Nome do cliente" value={name} onChange={e=>setName(e.target.value)} required />
        <div style={{display:'flex', gap:8}}>
          <input className="input" type="color" value={color} onChange={e=>setColor(e.target.value)} style={{padding:0}} />
          <input className="input" value={color} onChange={e=>setColor(e.target.value)} />
        </div>
      </div>
      <div className="actions" style={{marginTop:12}}>
        <button className="btn primary" type="submit">Salvar</button>
      </div>
    </form>
  )
}

function ClientsList({ refreshKey }) {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#64748b')
  const [confirmDel, setConfirmDel] = useState(null)

  async function load(){ try { setList(await apiGet('/clients')) } catch{} }
  useEffect(()=>{ load() }, [refreshKey])

  function startEdit(c) {
    setEditing(c.id); setEditName(c.name); setEditColor(c.color)
  }
  async function saveEdit(id) {
    try { await apiPatch(`/clients/${id}`, { name: editName, color: editColor }); setEditing(null); load() }
    catch (e) { alert('Erro ao editar cliente: ' + (e.message || e)) }
  }
  async function delClient(id) {
    if (confirmDel !== id) { setConfirmDel(id); setTimeout(()=>setConfirmDel(null), 5000); return }
    try { await apiDelete(`/clients/${id}`); setConfirmDel(null); load() }
    catch (e) { alert('Erro ao excluir: ' + (e.message || e)) }
  }

  return (
    <div className="card">
      <h3 style={{marginTop:0}}>Clientes</h3>
      <div style={{display:'grid', gap:10}}>
        {list.map(c => (
          <div key={c.id} style={{display:'flex', alignItems:'center', gap:10, justifyContent:'space-between'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span className="dot" style={{background:c.color}}></span>
              {editing === c.id ? (
                <>
                  <input className="input" value={editName} onChange={e=>setEditName(e.target.value)} style={{minWidth:200}} />
                  <input className="input" type="color" value={editColor} onChange={e=>setEditColor(e.target.value)} style={{padding:0}} />
                  <input className="input" value={editColor} onChange={e=>setEditColor(e.target.value)} style={{width:120}} />
                </>
              ) : (
                <div>
                  <div style={{fontWeight:600}}>{c.name}</div>
                  <div className="small-log">
                    Adicionado: {new Date((c.created_at)+'Z').toLocaleString()}
                    {c.updated_at ? <> • Editado: {new Date((c.updated_at)+'Z').toLocaleString()}</> : null}
                  </div>
                </div>
              )}
            </div>
            <div style={{display:'flex', gap:6}}>
              {editing === c.id ? (
                <>
                  <button className="btn" onClick={()=>saveEdit(c.id)}>Salvar</button>
                  <button className="btn" onClick={()=>setEditing(null)}>Cancelar</button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={()=>startEdit(c)}>Editar</button>
                  <button className={'btn ' + (confirmDel===c.id?'danger':'')} onClick={()=>delClient(c.id)}>
                    {confirmDel===c.id ? 'Confirmar excluir' : 'Excluir'}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {list.length===0 && <div style={{color:'#aab6cf'}}>Nenhum cliente ainda.</div>}
      </div>
    </div>
  )
}

function DeviceForm({ onCreated }) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [imei, setImei] = useState('')
  async function submit(e) {
    e.preventDefault()
    try { await apiPost('/devices', { name, brand, imei }); setName(''); setBrand(''); setImei(''); onCreated?.() }
    catch (e) { alert('Erro ao criar celular: ' + (e.message || e)) }
  }
  return (
    <form className="card" onSubmit={submit}>
      <h3 style={{marginTop:0}}>Cadastrar Celular</h3>
      <div className="row3">
        <input className="input" placeholder="Nome do aparelho (ex: 01, 02...)" value={name} onChange={e=>setName(e.target.value)} required />
        <input className="input" placeholder="Marca (opcional)" value={brand} onChange={e=>setBrand(e.target.value)} />
        <input className="input" placeholder="IMEI (opcional)" value={imei} onChange={e=>setImei(e.target.value)} />
      </div>
      <div className="actions" style={{marginTop:12}}>
        <button className="btn primary" type="submit">Salvar</button>
      </div>
    </form>
  )
}

export default function ManagePage() {
  const [refresh, setRefresh] = useState(0)
  return (
    <div className="stack">
      <DeviceForm onCreated={()=>setRefresh(x=>x+1)} />
      <ClientForm onCreated={()=>setRefresh(x=>x+1)} />
      <ClientsList refreshKey={refresh} />
    </div>
  )
}
