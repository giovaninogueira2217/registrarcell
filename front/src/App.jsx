// src/App.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { DevicesPage } from './pages/DevicesPage'
import ManagePage from './pages/ManagePage'
import { ReportPage } from './pages/ReportPage'
import { apiGet } from './api'
import { Sun, Moon, Search, Filter } from 'lucide-react'
import LastUpdateControl from './components/LastUpdateControl' // ✅ usa o componente

export default function App() {
  const [tab, setTab] = useState('devices')

  // tema
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark'
  })
  useEffect(() => {
    document.body.classList.toggle('light', theme === 'light')
    localStorage.setItem('theme', theme)
  }, [theme])

  // stats (relatório)
  const [stats, setStats] = useState({ ok: 0, banido: 0, desconectado: 0, livre: 0, total: 0 })
  const [refreshFlag, setRefreshFlag] = useState(0)
  useEffect(() => {
    (async () => {
      try { setStats(await apiGet('/stats')) } catch (e) { console.error(e) }
    })()
  }, [refreshFlag])

  // ===== Filtros globais (no header) =====
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [clientId, setClientId] = useState('')
  const [sort, setSort] = useState(() => localStorage.getItem('sortOrder') || 'device') // mantém escolha
  const [clients, setClients] = useState([])
  const [filtersKey, setFiltersKey] = useState(0) // força reload quando status/cliente/clear mudarem

  useEffect(() => { (async () => { try { setClients(await apiGet('/clients')) } catch {} })() }, [])
  useEffect(() => { localStorage.setItem('sortOrder', sort) }, [sort])

  const filters = useMemo(
    () => ({ q, status, clientId, sort, key: filtersKey }),
    [q, status, clientId, sort, filtersKey]
  )

  // não reseta ordenação
  function clearFilters() {
    setQ('')
    setStatus('')
    setClientId('')
    setFiltersKey(k => k + 1)
  }

  return (
    <>
      <header className="header">
        <div className="header-left">
          <img src={`${import.meta.env.BASE_URL}ip.ico`} alt="logo" />
          <h1>Atualizar Celulares</h1>
        </div>

        {/* ===== Filtros no cabeçalho ===== */}
        <div className="header-filters">
          <div className="field with-icon hf-search">
            <Search size={16} className="field-icon" />
            <input
              className="input"
              placeholder="Buscar (nome, IMEI, número… ou cliente)"
              value={q}
              onChange={e=>setQ(e.target.value)}
            />
          </div>

          <div className="field with-icon hf-status" title="Status">
            <Filter size={16} className="field-icon" />
            <select className="select" value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ok">OK</option>
              <option value="banido">Ban.</option>
              <option value="desconectado">Desc.</option>
              <option value="livre">Livre</option>
            </select>
          </div>

          <select
            className="select hf-client"
            value={clientId}
            onChange={e=>setClientId(e.target.value)}
            title="Cliente"
          >
            <option value="">Todos clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className="select hf-order"
            value={sort}
            onChange={e => setSort(e.target.value)}
            title="Ordenar por"
          >
            <option value="number">Ordenar: Número</option>
            <option value="device">Ordenar: Celular</option>
          </select>

          <button className="btn btn-clear" onClick={clearFilters} title="Limpar filtros">Limpar</button>
        </div>

        {/* ===== À direita: botão do "Última atualização" (abre modal global) + tema ===== */}
        <div className="header-right">
          <LastUpdateControl />
          <button
            className={`theme-toggle ${theme === 'light' ? 'light' : 'dark'}`}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="Alternar tema"
          >
            <span className="toggle-track">
              <span className="toggle-icons">
                <Sun size={14} />
                <Moon size={14} />
              </span>
              <span className="toggle-knob" />
            </span>
          </button>
        </div>
      </header>

      <div className="container">
        <div className="tabs">
          <button className={"tab-btn " + (tab==='devices'?'active':'')} onClick={() => setTab('devices')}>Celulares</button>
          <button className={"tab-btn " + (tab==='manage'?'active':'')} onClick={() => setTab('manage')}>Gerenciar</button>
          <button className={"tab-btn " + (tab==='report'?'active':'')} onClick={() => setTab('report')}>Relatório</button>
        </div>

        {tab === 'devices' && <DevicesPage filters={filters} onChanged={() => setRefreshFlag(x => x + 1)} />}
        {tab === 'manage'  && <ManagePage />}
        {tab === 'report'  && <ReportPage stats={stats} />}

        <div className="footer-note">IPSolution • Vínculo de números por celular</div>
      </div>
    </>
  )
}
