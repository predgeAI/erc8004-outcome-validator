import{d4 as f,d3 as t}from"./index-CmfisL9g.js";import{dJ as D,dc as F,fu as P,d$ as S,fv as z,dH as V,df as v}from"./PrivyHost-CICqpIxO.js";import{h as H}from"./CopyableText-CQapvaMr-DCgnlUiC.js";import{n as C}from"./ScreenLayout-CyLnlt7g-DvlGxwMB.js";import{t as M}from"./InfoBanner-Cb3p1z12-B7DWkef7.js";import{w as R,c as Y,p as q}from"./SelectSourceAsset-_voBED1H-DspUfJeo.js";import{c as K}from"./createLucideIcon-BX3UOdeF.js";import{H as N}from"./hourglass-BLpz3kc-.js";import{C as O}from"./check-DZk3PhFk.js";import{C as B}from"./circle-x-DoZ0qZG3.js";import"./index-kE4R6bNC.js";import"./copy-Ba3mzo6X.js";import"./ModalFooter-DDm8WjC0-CvuhZdNO.js";import"./Screen-BWBDKsup-B8xExYtT.js";import"./index-CWARkn2w-DPaBgOF1.js";import"./chevron-down-B_2drjXI.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=[["path",{d:"m16 11 2 2 4-4",key:"9rsbq5"}],["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],J=K("user-check",X),G=e=>{try{return e.location.origin}catch{return}},Q=({data:e,onClose:a})=>t.jsx(C,{showClose:!0,onClose:a,title:"Initiate bank transfer",subtitle:"Use the details below to complete a bank transfer from your bank.",primaryCta:{label:"Done",onClick:a},watermark:!1,footerText:"Exchange rates and fees are set when you authorize and determine the amount you receive. You'll see the applicable rates and fees for your transaction separately",children:t.jsx(Z,{children:(z[e.deposit_instructions.asset]||[]).map((([l,y],h)=>{let m=e.deposit_instructions[l];if(!m||Array.isArray(m))return null;let d=l==="asset"?m.toUpperCase():m,i=d.length>100?`${d.slice(0,9)}...${d.slice(-9)}`:d;return t.jsxs(ee,{children:[t.jsx(te,{children:y}),t.jsx(H,{value:d,includeChildren:V.isMobile,children:t.jsx(se,{children:i})})]},h)}))})});let Z=v.ol`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;
  flex-direction: column;

  && {
    padding: 0 1rem;
  }
`,ee=v.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;

  &:not(:first-of-type) {
    border-top: 1px solid var(--privy-color-border-default);
  }

  & > {
    :nth-child(1) {
      flex-basis: 30%;
    }

    :nth-child(2) {
      flex-basis: 60%;
    }
  }
`,te=v.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-variant-numeric: lining-nums proportional-nums;
  font-feature-settings: 'calt' off;

  /* text-xs/font-regular */
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.125rem; /* 150% */

  text-align: left;
  flex-shrink: 0;
`,se=v.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;

  /* text-sm/font-medium */
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem; /* 157.143% */

  text-align: right;
  word-break: break-all;
`;const re=({onClose:e})=>t.jsx(C,{showClose:!0,onClose:e,icon:B,iconVariant:"error",title:"Something went wrong",subtitle:"We couldn't complete account setup. This isn't caused by anything you did.",primaryCta:{label:"Close",onClick:e},watermark:!0}),oe=({onClose:e,reason:a})=>{let l=a?a.charAt(0).toLowerCase()+a.slice(1):void 0;return t.jsx(C,{showClose:!0,onClose:e,icon:B,iconVariant:"error",title:"Identity verification failed",subtitle:l?`We can't complete identity verification because ${l}. Please try again or contact support for assistance.`:"We couldn't verify your identity. Please try again or contact support for assistance.",primaryCta:{label:"Close",onClick:e},watermark:!0})},ae=({onClose:e,email:a})=>t.jsx(C,{showClose:!0,onClose:e,icon:N,title:"Identity verification in progress",subtitle:"We're waiting for Persona to approve your identity verification. This usually takes a few minutes, but may take up to 24 hours.",primaryCta:{label:"Done",onClick:e},watermark:!0,children:t.jsxs(M,{theme:"light",children:["You'll receive an email at ",a," once approved with instructions for completing your deposit."]})}),ne=({onClose:e,onAcceptTerms:a,isLoading:l})=>t.jsx(C,{showClose:!0,onClose:e,icon:J,title:"Verify your identity to continue",subtitle:"Finish verification with Persona — it takes just a few minutes and requires a government ID.",helpText:t.jsxs(t.Fragment,{children:[`This app uses Bridge to securely connect accounts and move funds. By clicking "Accept," you agree to Bridge's`," ",t.jsx("a",{href:"https://www.bridge.xyz/legal",target:"_blank",rel:"noopener noreferrer",children:"Terms of Service"})," ","and"," ",t.jsx("a",{href:"https://www.bridge.xyz/legal/row-privacy-policy/bridge-building-limited",target:"_blank",rel:"noopener noreferrer",children:"Privacy Policy"}),"."]}),primaryCta:{label:"Accept and continue",onClick:a,loading:l},watermark:!0}),ie=({onClose:e})=>t.jsx(C,{showClose:!0,onClose:e,icon:O,iconVariant:"success",title:"Identity verified successfully",subtitle:"We've successfully verified your identity. Now initiate a bank transfer to view instructions.",primaryCta:{label:"Initiate bank transfer",onClick:()=>{},loading:!0},watermark:!0}),le=({opts:e,onClose:a,onBack:l,onEditSourceAsset:y,onSelectAmount:h,isLoading:m})=>t.jsxs(C,{showClose:!0,onClose:a,showBack:!!l,onBack:l,headerTitle:`Buy ${e.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:"Continue",onClick:h,loading:m},watermark:!0,children:[t.jsx(Y,{currency:e.source.selectedAsset,inputMode:"decimal",autoFocus:!0}),t.jsx(q,{selectedAsset:e.source.selectedAsset,onEditSourceAsset:y})]}),ce=({onClose:e,onBack:a,onAcceptTerms:l,onSelectAmount:y,onSelectSource:h,onEditSourceAsset:m,opts:d,state:i,email:w,isLoading:n})=>i.status==="select-amount"?t.jsx(le,{onClose:e,onBack:a,onSelectAmount:y,onEditSourceAsset:m,opts:d,isLoading:n}):i.status==="select-source-asset"?t.jsx(R,{onSelectSource:h,opts:d,isLoading:n}):i.status==="kyc-prompt"?t.jsx(ne,{onClose:e,onAcceptTerms:l,opts:d,isLoading:n}):i.status==="kyc-incomplete"?t.jsx(ae,{onClose:e,email:w}):i.status==="kyc-success"?t.jsx(ie,{onClose:e}):i.status==="kyc-error"?t.jsx(oe,{onClose:e,reason:i.reason}):i.status==="account-details"?t.jsx(Q,{onClose:e,data:i.data}):i.status==="create-customer-error"||i.status==="get-customer-error"?t.jsx(re,{onClose:e}):null,Se={component:()=>{let{user:e}=D(),a=F().data;if(!a?.FundWithBankDepositScreen)throw Error("Missing data");let{onSuccess:l,onFailure:y,onBack:h,opts:m,createOrUpdateCustomer:d,getCustomer:i,getOrCreateVirtualAccount:w}=a.FundWithBankDepositScreen,[n,A]=f.useState(m),[g,s]=f.useState({status:"select-amount"}),[x,u]=f.useState(null),[E,o]=f.useState(!1),b=f.useRef(null),U=f.useCallback((async()=>{let r;o(!0),u(null);try{r=await i({kycRedirectUrl:window.location.origin})}catch(c){if(!c||typeof c!="object"||!("status"in c)||c.status!==404)return s({status:"get-customer-error"}),u(c),void o(!1)}if(!r)try{r=await d({hasAcceptedTerms:!1,kycRedirectUrl:window.location.origin})}catch(c){return s({status:"create-customer-error"}),u(c),void o(!1)}if(!r)return s({status:"create-customer-error"}),u(Error("Unable to create customer")),void o(!1);if(r.status==="not_started"&&r.kyc_url)return s({status:"kyc-prompt",kycUrl:r.kyc_url}),void o(!1);if(r.status==="not_started")return s({status:"get-customer-error"}),u(Error("Unexpected user state")),void o(!1);if(r.status==="rejected")return s({status:"kyc-error",reason:r.rejection_reasons?.[0]?.reason}),u(Error("User KYC rejected.")),void o(!1);if(r.status==="incomplete")return s({status:"kyc-incomplete"}),void o(!1);if(r.status!=="active")return s({status:"get-customer-error"}),u(Error("Unexpected user state")),void o(!1);r.status;try{let c=await w({destination:n.destination,provider:n.provider,source:{asset:n.source.selectedAsset}});s({status:"account-details",data:c})}catch(c){return s({status:"create-customer-error"}),u(c),void o(!1)}}),[n]),T=f.useCallback((async()=>{if(u(null),o(!0),g.status!=="kyc-prompt")return u(Error("Unexpected state")),void o(!1);let r=P({location:g.kycUrl});if(await d({hasAcceptedTerms:!0}),!r)return u(Error("Unable to begin kyc flow.")),o(!1),void s({status:"create-customer-error"});b.current=new AbortController;let c=await(async(p,W)=>{let j=await S({operation:async()=>({done:G(p)===window.location.origin,closed:p.closed}),until:({done:$,closed:I})=>$||I,delay:0,interval:500,attempts:360,signal:W});return j.status==="aborted"?(p.close(),{status:"aborted"}):j.status==="max_attempts"?{status:"timeout"}:j.result.done?(p.close(),{status:"redirected"}):{status:"closed"}})(r,b.current.signal);if(c.status==="aborted")return;if(c.status==="closed")return void o(!1);c.status;let k=await S({operation:()=>i({}),until:p=>p.status==="active"||p.status==="rejected",delay:0,interval:2e3,attempts:60,signal:b.current.signal});if(k.status!=="aborted"){if(k.status==="max_attempts")return s({status:"kyc-incomplete"}),void o(!1);if(k.status,k.result.status==="rejected")return s({status:"kyc-error",reason:k.result.rejection_reasons?.[0]?.reason}),u(Error("User KYC rejected.")),void o(!1);if(k.result.status!=="active")return s({status:"kyc-incomplete"}),void o(!1);r.closed||r.close(),k.result.status;try{s({status:"kyc-success"});let p=await w({destination:n.destination,provider:n.provider,source:{asset:n.source.selectedAsset}});s({status:"account-details",data:p})}catch(p){s({status:"create-customer-error"}),u(p)}finally{o(!1)}}}),[s,u,o,d,w,g,n,b]),_=f.useCallback((r=>{s({status:"select-amount"}),A({...n,source:{...n.source,selectedAsset:r}})}),[s,A]),L=f.useCallback((()=>{s({status:"select-source-asset"})}),[s]);return t.jsx(ce,{onClose:f.useCallback((async()=>{b.current?.abort(),!n.showBackButton||g.status!=="select-amount"&&g.status!=="select-source-asset"?x?y(x):await l():y(Error("User cancelled funding"))}),[x,b,y,l,n.showBackButton,g.status]),onBack:h,opts:n,state:g,isLoading:E,email:e.email.address,onAcceptTerms:T,onSelectAmount:U,onSelectSource:_,onEditSourceAsset:L})}};export{Se as FundWithBankDepositScreen,Se as default};
