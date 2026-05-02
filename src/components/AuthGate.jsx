import { SignIn, SignUp, useAuth } from '@clerk/clerk-react'
import { useState } from 'react'

const C = { bg:"#0a0d0f", gold:"#e8a020", goldDark:"#b87818", text:"#e8e4dc", muted:"#7a7570", surface:"rgba(255,255,255,0.04)", border:"rgba(255,255,255,0.08)" }

export default function AuthGate({ children }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [mode, setMode] = useState('signin')

  if (!isLoaded) return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:36,marginBottom:12}}>⚽</div>
        <div style={{fontSize:13,color:C.muted}}>Loading CoachKit…</div>
      </div>
    </div>
  )

  if (isSignedIn) return children

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a0d0f 0%,#0c1409 50%,#0a0d0f 100%)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 16px',fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif"}}>
      <div style={{textAlign:'center',marginBottom:32}}>
        <div style={{width:64,height:64,borderRadius:16,margin:'0 auto 16px',background:`linear-gradient(135deg,${C.gold},${C.goldDark})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,boxShadow:`0 8px 32px ${C.gold}44`}}>⚽</div>
        <div style={{fontSize:28,fontWeight:800,color:C.text,letterSpacing:'-0.02em'}}>CoachKit</div>
        <div style={{fontSize:12,color:C.muted,letterSpacing:'0.12em',textTransform:'uppercase',marginTop:4}}>SAY East Youth Soccer Manager</div>
      </div>
      <div style={{display:'flex',gap:0,marginBottom:24,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:4}}>
        {[['signin','Sign In'],['signup','Create Account']].map(([m,label])=>(
          <button key={m} onClick={()=>setMode(m)} style={{padding:'8px 20px',borderRadius:7,border:'none',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'inherit',background:mode===m?`linear-gradient(135deg,${C.gold},${C.goldDark})`:'transparent',color:mode===m?'#0a0d0f':C.muted,transition:'all 0.15s'}}>{label}</button>
        ))}
      </div>
      <div style={{width:'100%',maxWidth:420}}>
        {mode==='signin'?<SignIn routing="hash" appearance={appearance}/>:<SignUp routing="hash" appearance={appearance}/>}
      </div>
      <div style={{marginTop:24,fontSize:11,color:C.muted,textAlign:'center'}}>Your data stays on this device. No subscription required.</div>
    </div>
  )
}

const appearance = {
  variables:{colorPrimary:'#e8a020',colorBackground:'#111510',colorInputBackground:'rgba(255,255,255,0.06)',colorInputText:'#e8e4dc',colorText:'#e8e4dc',colorTextSecondary:'#7a7570',borderRadius:'8px',fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif"},
  elements:{card:{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',boxShadow:'0 8px 40px rgba(0,0,0,0.5)'},formButtonPrimary:{background:'linear-gradient(135deg,#e8a020,#b87818)',color:'#0a0d0f',fontWeight:700},footerActionLink:{color:'#e8a020'}}
}
