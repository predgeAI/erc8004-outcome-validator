import{d5 as u,d6 as e}from"./main-DLwPFUAs.js";import{df as t,dr as k}from"./PrivyHost-s1lfYZVW.js";import{m as T,g as v,p as b,f as j,v as E,a as S,u as g,h as x,b as y,t as D}from"./styles-CIiQisHF-DWJfDlud.js";import{n as N}from"./ScreenLayout-CyLnlt7g-B197RJBC.js";import{b as I}from"./ModalFooter-DDm8WjC0-Phd2bM4N.js";import{x as F}from"./QrCode-Ddiv3lt7-CZzfBjAU.js";import{u as O,a as R,s as A,b as $,c as z,d as L,e as M,f as P,g as B,F as q}from"./floating-ui.react-C_CSfqfw.js";import{p as W}from"./CopyableText-CQapvaMr-ZG6E-aso.js";import{H}from"./hourglass-Bdciih4m.js";import{C as U}from"./check-owSbWkeW.js";import{c as C}from"./createLucideIcon-CDcZLHSF.js";import{C as V}from"./chevron-down-Dyksu63f.js";import{T as Y}from"./triangle-alert-B20_Pc1f.js";import{n as K,o as Q,p as X,s as G}from"./floating-ui.react-dom-EogIN5-3.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J=[["path",{d:"m18 15-6-6-6 6",key:"153udz"}]],Z=C("chevron-up",J);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ee=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],re=C("info",ee);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=[["rect",{width:"5",height:"5",x:"3",y:"3",rx:"1",key:"1tu5fj"}],["rect",{width:"5",height:"5",x:"16",y:"3",rx:"1",key:"1v8r4q"}],["rect",{width:"5",height:"5",x:"3",y:"16",rx:"1",key:"1x03jg"}],["path",{d:"M21 16h-3a2 2 0 0 0-2 2v3",key:"177gqh"}],["path",{d:"M21 21v.01",key:"ents32"}],["path",{d:"M12 7v3a2 2 0 0 1-2 2H7",key:"8crl2c"}],["path",{d:"M3 12h.01",key:"nlz23k"}],["path",{d:"M12 3h.01",key:"n36tog"}],["path",{d:"M12 16v.01",key:"133mhm"}],["path",{d:"M16 12h1",key:"1slzba"}],["path",{d:"M21 12v.01",key:"1lwtk9"}],["path",{d:"M12 21v-1",key:"1880an"}]],oe=C("qr-code",ne);class Ye extends u.Component{static getDerivedStateFromError(){return{hasError:!0}}componentDidCatch(n,i){this.props.onError(n)}componentDidUpdate(n){n.resetKey!==this.props.resetKey&&this.state.hasError&&this.setState({hasError:!1})}render(){return this.state.hasError?null:this.props.children}constructor(...n){super(...n),this.state={hasError:!1}}}function ie(r,n,i){let o=Number(r);return!Number.isFinite(o)||o===0?`1 ${n} ≈ ${r} ${i}`:o>=.01?`1 ${n} ≈ ${w(o)} ${i}`:`${w(1/o)} ${n} ≈ 1 ${i}`}function w(r){return r>=1e3?new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Math.round(r)):r>=100?new Intl.NumberFormat("en-US",{maximumFractionDigits:1}).format(r):r>=1?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(r):new Intl.NumberFormat("en-US",{maximumFractionDigits:4}).format(r)}function Ke(r,n){let i=Number(r);if(!Number.isFinite(i)||i===0)return r;let o=n!=null?i/10**n:i;return o>=1e3?new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(o):o>=1?new Intl.NumberFormat("en-US",{maximumFractionDigits:4}).format(o):o>=1e-4?new Intl.NumberFormat("en-US",{maximumFractionDigits:6}).format(o):new Intl.NumberFormat("en-US",{maximumSignificantDigits:4}).format(o)}function Qe({address:r,caip2:n,config:i}){for(let o of i.currencies){let a=o.chains.find((s=>s.caip2===n&&s.address.toLowerCase()===r.toLowerCase()));if(a)return{symbol:o.symbol.toUpperCase(),decimals:a.decimals}}return{symbol:r,decimals:void 0}}function Xe(r,n){let i=n[r];return i?.displayName??i?.display_name??r}function Ge(r,n){return r.chains.filter((i=>i.can_be_relay_deposit_source===!0)).map((i=>{let o=n.chains[i.caip2];return o?{caip2:i.caip2,displayName:o.displayName,iconUrl:o.iconUrl,vmType:o.vmType,currencyAddress:i.address,currencyDecimals:i.decimals}:null})).filter((i=>i!==null))}function Je(r,n){if(!r.chains[n.destinationChain])return`Unsupported destination chain: "${n.destinationChain}". Check that the chain is in CAIP-2 format (e.g. "eip155:8453") and is supported for deposit addresses.`;let i=n.destinationCurrency.toLowerCase();return r.currencies.some((o=>o.chains.some((a=>a.caip2===n.destinationChain&&a.address.toLowerCase()===i))))?null:`Unsupported destination currency "${n.destinationCurrency}" on chain "${n.destinationChain}". Check that this token address is supported on the specified chain.`}let te=new Set(["ROUTE_UNAVAILABLE","UNEXPECTED_STATE","TIMEOUT_WAITING_FOR_NEXT_ORDER","TIMEOUT_ORDER_COMPLETION","DEPOSIT_FAILED","DEPOSIT_REFUNDED","USER_EXITED","AMOUNT_TOO_LOW","INSUFFICIENT_LIQUIDITY","UNSUPPORTED_CHAIN","UNSUPPORTED_CURRENCY","UNSUPPORTED_ROUTE","NO_SWAP_ROUTES_FOUND","NO_INTERNAL_SWAP_ROUTES_FOUND","NO_QUOTES","SANCTIONED_WALLET_ADDRESS","REFUND_WALLET_CREATION_FAILED","DEPOSIT_ADDRESSES_NOT_ENABLED","NOT_AUTHENTICATED"]);function se(r){return te.has(r)}function Ze(r){return se(r)?r:"UNKNOWN_ERROR"}const er=({trackingUrl:r,onViewBlockExplorer:n,onClose:i})=>{let o=r&&n?()=>{n(),window.open(r,"_blank","noopener,noreferrer")}:void 0;return e.jsx(N,{icon:H,iconVariant:"subtle",title:"Transfer in progress",subtitle:"Your deposit was received and the transfer is now processing.",showClose:!0,onClose:i,secondaryCta:o?{label:"View on block explorer ↗",onClick:o}:void 0,watermark:!1,children:e.jsxs(T,{children:[e.jsxs(v,{children:[e.jsx(b,{$status:"done",children:e.jsx(U,{size:14,color:"var(--privy-color-icon-success)",strokeWidth:2})}),e.jsx(j,{children:"Deposit received"})]}),e.jsx(E,{}),e.jsxs(v,{children:[e.jsx(b,{$status:"active",children:e.jsx(ae,{})}),e.jsx(j,{children:"Bridging"})]}),e.jsx(E,{}),e.jsxs(v,{children:[e.jsx(b,{$status:"pending"}),e.jsx(j,{children:"Funds arrived"})]})]})})};let ae=t.span`
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--privy-color-foreground-3);
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;function de({address:r,onClick:n}){let[i,o]=u.useState(!1);return e.jsx(e.Fragment,{children:i?e.jsx(le,{onClick:()=>o(!1),style:{marginTop:"1.5rem"},children:e.jsx(F,{url:r,size:312,hideLogo:!0})}):e.jsxs(ce,{title:"Click to copy address",onClick:n,style:{marginTop:"1.5rem"},children:[e.jsxs(me,{children:[e.jsx(ue,{children:"Deposit address"}),e.jsx(pe,{children:r})]}),e.jsx(he,{children:e.jsx(fe,{type:"button",onClick:a=>{a.stopPropagation(),o(!0)},children:e.jsx(oe,{size:16,color:"var(--privy-color-icon-muted)"})})})]})})}let le=t.div`
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: hidden;
`,ce=t.div`
  display: flex;
  border-radius: var(--privy-border-radius-md);
  background: var(--privy-color-background-clicked);
  padding: 1rem;
  cursor: pointer;
  gap: 0.5rem;
`,me=t.div`
  flex: 1;
  min-width: 0;
  text-align: left;
`,ue=t.div`
  font-size: 0.75rem;
  color: var(--privy-color-icon-muted);
  line-height: 1rem;
  margin-bottom: 0.25rem;
`,pe=t.div`
  word-break: break-all;
  font-size: 0.875rem;
  font-family: ui-monospace, monospace;
  font-weight: 500;
  line-height: 1.375rem;
  color: var(--privy-color-foreground);
`,he=t.div`
  width: 1.5rem;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  padding-top: 0.25rem;
`,fe=t.button`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    outline: none;
    box-shadow: none;
    border-radius: var(--privy-border-radius-xs);

    &:hover {
      background: var(--privy-color-background);
    }

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`,_=r=>/^0x/i.test(r)||r.length>16;function ge({quote:r,selectedCurrency:n,selectedChain:i,destinationSymbol:o,destinationChainName:a,destinationAsset:s}){let[p,h]=u.useState(!1),d=n.symbol.toUpperCase(),l=i.displayName,c=u.useRef(null);return e.jsxs(xe,{children:[e.jsxs(ye,{onClick:u.useCallback((()=>{let m=document.getElementById("privy-modal-content");m&&(c.current&&clearTimeout(c.current),m.style.transition="none",c.current=setTimeout((()=>{m.style.transition="",c.current=null}),160)),h((f=>!f))}),[]),children:[e.jsxs(ve,{children:[n.logoURI&&e.jsx(S,{src:n.logoURI,alt:d,style:{width:"2rem",height:"2rem"}}),i.iconUrl&&e.jsx(be,{src:i.iconUrl,alt:l})]}),e.jsxs(je,{children:[e.jsx(Ce,{children:"You send"}),e.jsxs(ke,{children:[d," on ",l]})]}),e.jsx(Ee,{children:e.jsx(p?Z:V,{size:16})})]}),e.jsx(Ue,{$expanded:p,children:e.jsx(Te,{children:e.jsxs(we,{children:[r.indicative_rate&&e.jsxs(g,{children:[e.jsx(x,{children:"Conversion rate"}),e.jsxs(y,{style:{display:"flex",alignItems:"center",gap:"0.25rem"},children:[ie(r.indicative_rate,d,o.toUpperCase()),e.jsx(Se,{content:"Estimated rate based on current market conditions. Final execution price may vary depending on transfer size and routing."})]})]}),e.jsxs(g,{children:[e.jsx(x,{children:"Receive"}),e.jsxs(y,{children:[o&&!_(o)?o.toUpperCase():_(s)?k(s):s.toUpperCase(),a?` on ${a}`:""]})]}),r.slippage_bps!=null&&e.jsxs(g,{children:[e.jsx(x,{children:"Max slippage"}),e.jsxs(y,{children:[(r.slippage_bps/100).toFixed(1),"%"]})]}),r.refund_address&&e.jsxs(g,{children:[e.jsx(x,{children:"Refund address"}),e.jsx(y,{children:e.jsx(W,{value:r.refund_address,iconOnly:!0,iconSize:11,children:k(r.refund_address,4,4)})})]})]})})}),e.jsxs(_e,{children:[e.jsx(Y,{size:16,color:"var(--privy-color-icon-muted)",style:{flexShrink:0}}),e.jsxs(Ne,{children:["Only send ",e.jsx("strong",{children:d})," on ",e.jsx("strong",{children:l}),". Other assets may be lost."]})]})]})}let xe=t.div`
  border-radius: var(--privy-border-radius-md);
  border: 1px solid var(--privy-color-foreground-4);
  overflow: hidden;
`,ye=t.button`
  && {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--privy-color-foreground);
    outline: none;
    box-shadow: none;

    &:focus,
    &:focus-visible {
      outline: none;
      box-shadow: none;
    }
  }
`,ve=t.span`
  position: relative;
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
`,be=t(D)`
  && {
    position: absolute;
    top: -0.125rem;
    right: -0.25rem;
    width: 0.75rem;
    height: 0.75rem;
    box-sizing: content-box;
    border: 1.5px solid var(--privy-color-background);
    background-color: var(--privy-color-background);
  }
`,je=t.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`,Ce=t.span`
  font-size: 0.75rem;
  color: var(--privy-color-foreground-3);
  line-height: 1rem;
`,ke=t.span`
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
`,Ee=t.span`
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: var(--privy-border-radius-full);
  background-color: var(--privy-color-background-clicked);
  color: var(--privy-color-foreground-3);
`,we=t.div`
  display: flex;
  flex-direction: column;
  padding: 0 1rem 0.75rem;

  & > * {
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--privy-color-foreground-4);
  }

  & > *:last-child {
    border-bottom: none;
  }
`,_e=t.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0.75rem 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--privy-border-radius-sm);
  background: var(--privy-color-background-2);
`,Ne=t.span`
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: var(--privy-color-icon-muted);
  text-align: left;
`,Ue=t.div`
  display: grid;
  grid-template-rows: ${({$expanded:r})=>r?"1fr":"0fr"};
  transition: grid-template-rows 150ms ease-out;
`,Te=t.div`
  overflow: hidden;
`;function Se({content:r}){let[n,i]=u.useState(!1),{refs:o,floatingStyles:a,context:s}=O({open:n,onOpenChange:i,placement:"top",whileElementsMounted:K,middleware:[Q(6),X(),G({padding:8})]}),p=R(s,{move:!1,handleClose:A()}),h=$(s),{getReferenceProps:d,getFloatingProps:l}=z([p,h,L(s),M(s),P(s,{role:"tooltip"})]),{isMounted:c,styles:m}=B(s,{duration:150});return e.jsxs(e.Fragment,{children:[e.jsx("button",{ref:o.setReference,type:"button","aria-label":"More information about conversion rate",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0,border:"none",background:"none",color:"var(--privy-color-icon-muted)",cursor:"pointer"},...d(),children:e.jsx(re,{size:14})}),c&&e.jsx(q,{root:document.getElementById("privy-modal-content")??void 0,children:e.jsx(De,{ref:o.setFloating,style:{...a,...m},...l(),children:r})})]})}let De=t.div`
  max-width: 13rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--privy-border-radius-sm, 0.375rem);
  background: var(--privy-color-foreground);
  color: var(--privy-color-background);
  font-size: 0.6875rem;
  line-height: 1rem;
  font-weight: 400;
  text-align: left;
  z-index: 10;
`;const rr=({quote:r,selectedCurrency:n,selectedChain:i,destinationSymbol:o,destinationChainName:a,destinationAsset:s,onBack:p,onClose:h})=>{let[d,l]=u.useState(!1),c=n?.symbol?.toUpperCase()??"funds",m=i?.displayName??"",f=async()=>{d||(await navigator.clipboard.writeText(r.deposit_address),l(!0),setTimeout((()=>l(!1)),2e3))};return e.jsxs(N,{title:`Send ${c}${m?` on ${m}`:""}`,subtitle:"Send funds to the address below. Conversion and routing handled by Relay.",showBack:!0,onBack:p,showClose:!0,onClose:h,watermark:!1,children:[e.jsx(ge,{quote:r,selectedCurrency:n,selectedChain:i,destinationSymbol:o,destinationChainName:a,destinationAsset:s}),e.jsx(de,{address:r.deposit_address,onClick:f}),e.jsx(I,{style:{marginTop:"1rem",marginBottom:"0.5rem",...d?{backgroundColor:"var(--privy-color-icon-success)",borderColor:"var(--privy-color-icon-success)"}:{}},onClick:f,children:d?e.jsxs(e.Fragment,{children:["Copied ",e.jsx(U,{size:16,style:{marginLeft:"0.25rem"}})]}):"Copy address"}),e.jsx(Ie,{children:"Routing and bridging are handled by Relay. Privy does not control execution timing, liquidity, or transaction outcomes."})]})};let Ie=t.p`
  && {
    margin: 0.5rem 0 0;
    font-size: 0.6875rem;
    line-height: 1.125rem;
    color: var(--privy-color-icon-muted);
    text-align: center;
  }
`;export{Je as G,Xe as H,Ge as K,Ye as Q,rr as T,Ke as X,Qe as Y,oe as a,Ze as e,er as r};
