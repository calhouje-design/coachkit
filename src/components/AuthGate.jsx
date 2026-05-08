import { SignIn, SignUp, useAuth } from '@clerk/clerk-react'
import { useState } from 'react'

const C = {
  bg:"#1a2332", bgLight:"#243447", gold:"#f4b942", goldDark:"#d99820",
  text:"#ffffff", muted:"#b8c2cf",
  surface:"rgba(255,255,255,0.10)", border:"rgba(255,255,255,0.20)",
}

const LOGO_URL = "https://raw.githubusercontent.com/calhouje-design/coachkit/main/logo.png"

const localization = {
  signIn: { start: { title: 'Sign in to CoachKit', subtitle: 'Welcome back! Please sign in to continue' } },
  signUp: { start: { title: 'Create your CoachKit account', subtitle: 'Welcome! Fill in the details to get started' } },
}

const appearance = {
  variables: {
    colorPrimary:'#f4b942', colorBackground:'#243447',
    colorInputBackground:'rgba(255,255,255,0.95)', colorInputText:'#1a2332',
    colorText:'#ffffff', colorTextSecondary:'#b8c2cf',
    borderRadius:'8px',
    fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
  },
  elements: {
    card:{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.18)',boxShadow:'0 12px 48px rgba(0,0,0,0.4)',backdropFilter:'blur(12px)'},
    headerTitle:{color:'#ffffff'},
    headerSubtitle:{color:'#b8c2cf'},
    socialButtonsBlockButton:{background:'rgba(255,255,255,0.95)',border:'1px solid rgba(255,255,255,0.3)',color:'#1a2332'},
    socialButtonsBlockButtonText:{color:'#1a2332',fontWeight:600},
    dividerText:{color:'#b8c2cf'},
    dividerLine:{background:'rgba(255,255,255,0.2)'},
    formFieldLabel:{color:'#ffffff',fontWeight:600},
    formFieldInput:{background:'rgba(255,255,255,0.95)',color:'#1a2332',border:'1px solid rgba(255,255,255,0.3)'},
    formButtonPrimary:{background:'linear-gradient(135deg,#f4b942,#d99820)',color:'#1a2332',fontWeight:700,boxShadow:'0 4px 14px rgba(244,185,66,0.4)'},
    footerActionText:{color:'#b8c2cf'},
    footerActionLink:{color:'#f4b942',fontWeight:700},
    identityPreviewText:{color:'#ffffff'},
    identityPreviewEditButton:{color:'#f4b942'},
    formFieldAction:{color:'#f4b942'},
    formFieldHintText:{color:'#b8c2cf'},
  },
}

export default function AuthGate({ children }) {
  const { isLoaded, isSignedIn } = useAuth()
  const [mode, setMode] = useState('signin')

  if (!isLoaded) return (
    <div style={{minHeight:'100vh',background:`linear-gradient(160deg,${C.bg} 0%,${C.bgLight} 50%,${C.bg} 100%)`,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <img src={LOGO_URL} alt="CoachKit" style={{width:80,height:80,borderRadius:18,marginBottom:16,boxShadow:`0 8px 32px ${C.gold}55`}}/>
        <div style={{fontSize:14,color:C.muted,fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif"}}>Loading CoachKit</div>
      </div>
    </div>
  )

  if (isSignedIn) return children

  return (
    <div style={{minHeight:'100vh',background:`linear-gradient(160deg,${C.bg} 0%,${C.bgLight} 50%,${C.bg} 100%)`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px 16px',fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif"}}>
      <div style={{textAlign:'center',marginBottom:28}}>
        <img src={LOGO_URL} alt="CoachKit"
          style={{width:96,height:96,borderRadius:20,margin:'0 auto 18px',display:'block',boxShadow:`0 12px 40px ${C.gold}66, 0 0 0 1px ${C.border}`}}
          onError={e=>{e.target.style.display='none'}}/>
        <div style={{fontSize:32,fontWeight:800,color:C.text,letterSpacing:'-0.02em',textShadow:'0 2px 8px rgba(0,0,0,0.5)'}}>CoachKit</div>
        <div style={{fontSize:12,color:C.gold,letterSpacing:'0.14em',textTransform:'uppercase',marginTop:6,fontWeight:600}}>SAY East Youth Soccer Manager</div>
      </div>
      <div style={{display:'flex',gap:0,marginBottom:20,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:4,backdropFilter:'blur(10px)'}}>
        {[['signin','Sign In'],['signup','Create Account']].map(([m,label])=>(
          <button key={m} onClick={()=>setMode(m)} style={{padding:'9px 22px',borderRadius:7,border:'none',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'inherit',background:mode===m?`linear-gradient(135deg,${C.gold},${C.goldDark})`:'transparent',color:mode===m?'#1a2332':C.text,transition:'all 0.15s',boxShadow:mode===m?`0 4px 12px ${C.gold}55`:'none'}}>{label}</button>
        ))}
      </div>
      <div style={{width:'100%',maxWidth:420}}>
        {mode==='signin'?<SignIn routing="hash" appearance={appearance} localization={localization}/>:<SignUp routing="hash" appearance={appearance} localization={localization}/>}
      </div>
      <div style={{marginTop:22,fontSize:12,color:C.muted,textAlign:'center'}}>Your data stays on this device. No subscription required.</div>
    </div>
  )
}
