const API = import.meta.env.VITE_API_BASE || (import.meta.env.BASE_URL + 'api');

export async function apiGet(p){ const r=await fetch(`${API}${p}`); if(!r.ok) throw new Error(await r.text()); return r.json() }

export async function apiPost(p,d){ const r=await fetch(`${API}${p}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}); if(!r.ok) throw new Error(await r.text()); return r.json() }

export async function apiPatch(p,d){ const r=await fetch(`${API}${p}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}); if(!r.ok) throw new Error(await r.text()); return r.json() }

export async function apiDelete(p){ const r=await fetch(`${API}${p}`,{method:'DELETE'}); if(!r.ok) throw new Error(await r.text()); return r.json() }
