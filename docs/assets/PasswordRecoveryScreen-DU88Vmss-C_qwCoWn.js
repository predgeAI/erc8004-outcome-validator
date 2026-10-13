import{d5 as a,d6 as e}from"./main-DLwPFUAs.js";import{F as T}from"./ShieldCheckIcon-qlx-oupW.js";import{dJ as _,dh as E,dc as I,eR as F,eS as U,ez as W,df as u,e0 as N}from"./PrivyHost-s1lfYZVW.js";import{b as O}from"./ModalFooter-DDm8WjC0-Phd2bM4N.js";import{l as V}from"./Layouts-BMRfo5hw-DqrpfMQi.js";import{g as z,h as B,y as H,w as M,k as D}from"./shared-Dc_KFM2--BIn2174K.js";import{w as s}from"./Screen-BWBDKsup-CSzrUL-w.js";import"./index-CzLOIYTU.js";import"./createWalletClient-DMUdsE6Y.js";import"./index-CWARkn2w-BgmHoDgA.js";const ae={component:()=>{let[o,h]=a.useState(!0),{authenticated:p,user:g}=_(),{walletProxy:y,closePrivyModal:m,createAnalyticsEvent:v,client:j}=E(),{navigate:b,data:k,onUserCloseViaDialogOrKeybindRef:C}=I(),[l,A]=a.useState(void 0),[x,n]=a.useState(""),[d,f]=a.useState(!1),{entropyId:c,entropyIdVerifier:S,onCompleteNavigateTo:w,onSuccess:R,onFailure:$}=k.recoverWallet,i=(r="User exited before their wallet could be recovered")=>{m({shouldCallAuthOnSuccess:!1}),$(typeof r=="string"?new W(r):r)};return C.current=i,a.useEffect((()=>{if(!p)return i("User must be authenticated and have a Privy wallet before it can be recovered")}),[p]),e.jsxs(s,{children:[e.jsx(s.Header,{icon:T,title:"Enter your password",subtitle:"Please provision your account on this new device. To continue, enter your recovery password.",showClose:!0,onClose:i}),e.jsx(s.Body,{children:e.jsx(J,{children:e.jsxs("div",{children:[e.jsxs(z,{children:[e.jsx(B,{type:o?"password":"text",onChange:r=>(t=>{t&&A(t)})(r.target.value),disabled:d,style:{paddingRight:"2.3rem"}}),e.jsx(H,{style:{right:"0.75rem"},children:o?e.jsx(M,{onClick:()=>h(!1)}):e.jsx(D,{onClick:()=>h(!0)})})]}),!!x&&e.jsx(K,{children:x})]})})}),e.jsxs(s.Footer,{children:[e.jsx(s.HelpText,{children:e.jsxs(V,{children:[e.jsx("h4",{children:"Why is this necessary?"}),e.jsx("p",{children:"You previously set a password for this wallet. This helps ensure only you can access it"})]})}),e.jsx(s.Actions,{children:e.jsx(Y,{loading:d||!y,disabled:!l,onClick:async()=>{f(!0);let r=await j.getAccessToken(),t=F(g,c);if(!r||!t||l===null)return i("User must be authenticated and have a Privy wallet before it can be recovered");try{v({eventName:"embedded_wallet_recovery_started",payload:{walletAddress:t.address}}),await y?.recover({accessToken:r,entropyId:c,entropyIdVerifier:S,recoveryPassword:l}),n(""),w?b(w):m({shouldCallAuthOnSuccess:!1}),R?.(t),v({eventName:"embedded_wallet_recovery_completed",payload:{walletAddress:t.address}})}catch(P){U(P)?n("Invalid recovery password, please try again."):n("An error has occurred, please try again.")}finally{f(!1)}},$hideAnimations:!c&&d,children:"Recover your account"})}),e.jsx(s.Watermark,{})]})]})}};let J=u.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,K=u.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,Y=u(O)`
  ${({$hideAnimations:o})=>o&&N`
      && {
        /* Remove animations because the recoverWallet task on the iframe partially
           blocks the renderer, so the animation stutters and doesn't look good */
        transition: none;
      }
    `}
`;export{ae as PasswordRecoveryScreen,ae as default};
