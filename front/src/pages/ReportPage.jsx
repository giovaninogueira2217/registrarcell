import React, { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'

export function ReportPage({ stats }) {
  const [data, setData] = useState([
    { name: 'OK', value: 0 },
    { name: 'Banido', value: 0 },
    { name: 'Desconectado', value: 0 },
    { name: 'Livre', value: 0 },
  ])

  useEffect(() => {
    setData([
      { name: 'OK', value: stats.ok || 0 },
      { name: 'Banido', value: stats.banido || 0 },
      { name: 'Desconectado', value: stats.desconectado || 0 },
      { name: 'Livre', value: stats.livre || 0 },
    ])
  }, [stats])

  const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6']

  return (
    <div className="card" style={{height:420}}>
      <h3 style={{marginTop:0}}>Status geral</h3>
      <div style={{width: '100%', height: 320}}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{display:'flex', gap:12, flexWrap:'wrap'}}>
        <span className="badge ok"><b>OK:</b> {stats.ok ?? 0}</span>
        <span className="badge ban"><b>Banido:</b> {stats.banido ?? 0}</span>
        <span className="badge" style={{borderColor:'#f59e0b'}}><b>Desconectado:</b> {stats.desconectado ?? 0}</span>
        <span className="badge" style={{borderColor:'#3b82f6'}}><b>Livre:</b> {stats.livre ?? 0}</span>
        <span className="badge"><b>Total:</b> {stats.total ?? 0}</span>
      </div>
    </div>
  )
}
