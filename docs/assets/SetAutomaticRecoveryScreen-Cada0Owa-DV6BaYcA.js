import{d6 as y,d5 as e}from"./main-CBbADybU.js";import{F as E}from"./ExclamationTriangleIcon-BFM27uCS.js";import{F as U}from"./LockClosedIcon-C_rsmnsD.js";import{dJ as $,dh as k,dc as I,eq as g,eR as w,dF as P,df as W}from"./PrivyHost-BkthXyK4.js";import{L as x,u as v,h as j}from"./ModalFooter-DDm8WjC0-DP9DrnCY.js";import{r as A}from"./Subtitle-CV-2yKE4-CohipNuv.js";import{e as S}from"./Title-BnzYV3Is-lIzeLMP5.js";import"./index-Dr9A5A5I.js";import"./createWalletClient-1gkuE3OO.js";const M=W.div`
  && {
    border-width: 4px;
  }

  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  aspect-ratio: 1;
  border-style: solid;
  border-color: ${t=>t.$color??"var(--privy-color-accent)"};
  border-radius: 50%;
`,O={component:()=>{let{user:t}=$(),{client:b,walletProxy:u,refreshSessionAndUser:C,closePrivyModal:s}=k(),r=I(),{entropyId:m,entropyIdVerifier:F}=r.data?.recoverWallet??{},[a,f]=y.useState(!1),[i,R]=y.useState(null),[l,h]=y.useState(null);function n(){if(!a){if(l)return r.data?.setWalletPassword?.onFailure(l),void s();if(!i)return r.data?.setWalletPassword?.onFailure(Error("User exited set recovery flow")),void s()}}r.onUserCloseViaDialogOrKeybindRef.current=n;let T=!(!a&&!i);return e.jsxs(e.Fragment,l?{children:[e.jsx(x,{onClose:n},"header"),e.jsx(M,{$color:"var(--privy-color-error)",style:{alignSelf:"center"},children:e.jsx(E,{height:38,width:38,stroke:"var(--privy-color-error)"})}),e.jsx(S,{style:{marginTop:"0.5rem"},children:"Something went wrong"}),e.jsx(g,{style:{minHeight:"2rem"}}),e.jsx(v,{onClick:()=>h(null),children:"Try again"}),e.jsx(j,{})]}:{children:[e.jsx(x,{onClose:n},"header"),e.jsx(U,{style:{width:"3rem",height:"3rem",alignSelf:"center"}}),e.jsx(S,{style:{marginTop:"0.5rem"},children:"Automatically secure your account"}),e.jsx(A,{style:{marginTop:"1rem"},children:"When you log into a new device, you’ll only need to authenticate to access your account. Never get logged out if you forget your password."}),e.jsx(g,{style:{minHeight:"2rem"}}),e.jsx(v,{loading:a,disabled:T,onClick:()=>(async function(){f(!0);try{let o=await b.getAccessToken(),c=w(t,m);if(!o||!u||!c)return;if(!(await u.setRecovery({accessToken:o,entropyId:m,entropyIdVerifier:F,existingRecoveryMethod:c.recoveryMethod,recoveryMethod:"privy"})).entropyId)throw Error("Unable to set recovery on wallet");let d=await C();if(!d)throw Error("Unable to set recovery on wallet");let p=w(d,c.address);if(!p)throw Error("Unabled to set recovery on wallet");R(!!d),setTimeout((()=>{r.data?.setWalletPassword?.onSuccess(p),s()}),P)}catch(o){h(o)}finally{f(!1)}})(),children:i?"Success":"Confirm"}),e.jsx(j,{})]})}};export{O as SetAutomaticRecoveryScreen,O as default};
