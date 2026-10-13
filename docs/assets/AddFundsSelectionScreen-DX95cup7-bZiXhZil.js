import{d6 as t,d5 as e}from"./main-vDKXQX1b.js";import{db as b,dc as E,da as A,dd as L,de as k,df as x,dg as F}from"./PrivyHost-Djq9SuIw.js";import{n as G}from"./index-CWARkn2w-mI1at1P4.js";import{h as O,t as _}from"./GooglePay-B53WnudL-CJfLgMAN.js";import{e as R}from"./useAsyncValue-sCQ_EAT9-d0hRLVgF.js";import{n as D}from"./styles-DVyDvTdj-TCScfn6K.js";import{i as g,l as n,s as a}from"./styles-CIiQisHF-CUWGAmKA.js";import{C as T,L as Y}from"./landmark-DC5fWpE9.js";import{W as S}from"./wallet-C8d7e9SQ.js";import"./index-DdptKtOU.js";import"./createWalletClient-Cn7KNzLG.js";import"./ScreenLayout-CyLnlt7g-DV1Gt9Et.js";import"./ModalFooter-DDm8WjC0-LhNbL6Ma.js";import"./Screen-BWBDKsup-DP3TvEuQ.js";import"./createLucideIcon-DedljMmX.js";const ee={component:()=>{let r=b(),{onUserCloseViaDialogOrKeybindRef:d}=E(),w=A(),s=t.useRef(!1),h=L(),y=R(F),[P,v]=t.useState(!1),u=h?"APPLE_PAY":h===!1&&y?"GOOGLE_PAY":null,p=h===!0||h===!1&&y!==void 0,f=!r?.startFiat||p||P;t.useEffect((()=>{let j=window.setTimeout((()=>v(!0)),2e3);return()=>window.clearTimeout(j)}),[]),t.useEffect((()=>{r&&(s.current=!1)}),[r]);let C=t.useRef(null);t.useEffect((()=>{r&&!r.error&&f&&C.current!==r&&(C.current=r,r.recordRowsViewed?.({walletPay:r.startFiat?u:void 0,walletPayTimedOut:r.startFiat?!p:void 0}))}),[f,r,u,p]);let i=t.useCallback((async()=>{!s.current&&r&&(s.current=!0,k(),await r.onCancel())}),[r]);if(t.useEffect((()=>(d.current=i,()=>{d.current===i&&(d.current=null)})),[i,d]),!r)return null;if(r.error)return e.jsx(g,{title:"Unable to add funds",subtitle:r.error,showClose:!0,onClose:i,primaryCta:{label:"Close",onClick:i}});let m=async j=>{s.current||(s.current=!0,await r.startFiat?.(j))};return e.jsx(g,{title:"Pay with",subtitle:"Debit cards typically have higher success rates than credit cards, even with Apple Pay or Google Pay.",showClose:!0,onClose:i,children:f?e.jsxs(D,{style:{marginTop:"1rem"},$colorScheme:w.appearance.palette.colorScheme,children:[r.startFiat&&e.jsxs(n,{onClick:()=>m("CREDIT_DEBIT_CARD"),children:[e.jsx(l,{children:e.jsx(T,{})}),e.jsxs(o,{children:[e.jsx(a,{children:"Debit or credit card"}),e.jsx(c,{children:"Less than 10 minutes"})]})]}),r.startFiat&&u==="APPLE_PAY"&&e.jsxs(n,{onClick:()=>m("APPLE_PAY"),children:[e.jsx(l,{children:e.jsx(O,{width:18,height:18})}),e.jsxs(o,{children:[e.jsx(a,{children:"Apple Pay"}),e.jsx(c,{children:"Less than 10 minutes"})]})]}),r.startFiat&&u==="GOOGLE_PAY"&&e.jsxs(n,{onClick:()=>m("GOOGLE_PAY"),children:[e.jsx(l,{children:e.jsx(_,{width:18,height:18})}),e.jsxs(o,{children:[e.jsx(a,{children:"Google Pay"}),e.jsx(c,{children:"Less than 10 minutes"})]})]}),r.startFiat&&e.jsxs(n,{onClick:()=>m("BANK"),children:[e.jsx(l,{children:e.jsx(Y,{})}),e.jsxs(o,{children:[e.jsx(a,{children:"Bank account"}),e.jsx(c,{children:"1–2 days"})]})]}),r.startCrypto&&e.jsxs(n,{onClick:async()=>{s.current||(s.current=!0,await r.startCrypto?.())},children:[e.jsx(l,{children:e.jsx(S,{})}),e.jsxs(o,{children:[e.jsx(a,{children:"Crypto wallet or exchange"}),e.jsx(c,{children:"Instant"})]})]})]}):e.jsx(B,{children:e.jsx(G,{size:"50px"})})})}};let B=x.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 1rem;
  min-height: 8rem;
`,l=x.span`
  width: 2rem;
  height: 2rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-2);
  color: var(--privy-color-icon-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  svg {
    width: 1.125rem;
    height: 1.125rem;
  }
`,o=x.span`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,c=x.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--privy-color-foreground-3);
`;export{ee as AddFundsSelectionScreen,ee as default};
