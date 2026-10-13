import{d5 as n,d6 as r}from"./main-bVH1qqnY.js";import{dJ as I,dc as U,da as M,dh as D,dk as d,dR as B,dF as A,dH as F,dC as W,df as s}from"./PrivyHost-VX4ZgYKh.js";import{n as z}from"./OpenLink-CUpJ1mOr-BO3JgM3F.js";import{x as q}from"./QrCode-Ddiv3lt7-mVSsvFHJ.js";import{f as V}from"./ModalFooter-DDm8WjC0-DYwPewuc.js";import{r as H}from"./LabelXs-oqZNqbm_-DHa3Lurd.js";import{a as P}from"./shouldProceedtoEmbeddedWalletCreationFlow-u-KXjlTz-DvLsgZBi.js";import{n as J}from"./ScreenLayout-CyLnlt7g-D8CGsAfc.js";import{l as R}from"./farcaster-DPlSjvF5-tdG2cI7n.js";import{C as Q}from"./check-CbWOK0yA.js";import{C as K}from"./copy-t8w4n_9U.js";import"./index-CdtIYe98.js";import"./createWalletClient-BEt3UjEG.js";import"./browser-BsMalIFR.js";import"./dijkstra-DorMYy3g.js";import"./Screen-BWBDKsup-B_x6myem.js";import"./index-CWARkn2w-Z8-Ia1XD.js";import"./createLucideIcon-CyGgy47p.js";let X=s.div`
  width: 100%;
`,Y=s.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem;
  height: 56px;
  background: ${e=>e.$disabled?"var(--privy-color-background-2)":"var(--privy-color-background)"};
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-md);

  &:hover {
    border-color: ${e=>e.$disabled?"var(--privy-color-foreground-4)":"var(--privy-color-foreground-3)"};
  }
`,G=s.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
`,O=s.span`
  display: block;
  font-size: 16px;
  line-height: 24px;
  color: ${e=>e.$disabled?"var(--privy-color-foreground-2)":"var(--privy-color-foreground)"};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Single-line truncation: as a flex item this would otherwise be floored at its
     min-content width, so min-width: 0 lets it shrink and the ellipsis land at the
     container edge. */
  min-width: 0;

  @media (min-width: 441px) {
    font-size: 14px;
    line-height: 20px;
  }
`,Z=s(O)`
  color: var(--privy-color-foreground-3);
  font-style: italic;
`,ee=s(H)`
  margin-bottom: 0.5rem;
`,re=s(V)`
  && {
    gap: 0.375rem;
    font-size: 14px;
    flex-shrink: 0;
  }
`;const te=({value:e,title:u,placeholder:l,className:t,showCopyButton:c=!0,truncate:i,maxLength:p=40,disabled:m=!1})=>{let[h,x]=n.useState(!1),w=i&&e?((a,S,f)=>{if((a=a.startsWith("https://")?a.slice(8):a).length<=f)return a;if(S==="middle"){let y=Math.ceil(f/2)-2,C=Math.floor(f/2)-1;return`${a.slice(0,y)}...${a.slice(-C)}`}return`${a.slice(0,f-3)}...`})(e,i,p):e;return n.useEffect((()=>{if(h){let a=setTimeout((()=>x(!1)),3e3);return()=>clearTimeout(a)}}),[h]),r.jsxs(X,{className:t,children:[u&&r.jsx(ee,{children:u}),r.jsxs(Y,{$disabled:m,children:[r.jsx(G,{children:e?r.jsx(O,{$disabled:m,title:e,children:w}):r.jsx(Z,{$disabled:m,children:l||"No value"})}),c&&e&&r.jsx(re,{onClick:function(a){a.stopPropagation(),navigator.clipboard.writeText(e).then((()=>x(!0))).catch(console.error)},size:"sm",children:r.jsxs(r.Fragment,h?{children:["Copied",r.jsx(Q,{size:14})]}:{children:["Copy",r.jsx(K,{size:14})]})})]})]})},ae=({connectUri:e,loading:u,success:l,errorMessage:t,onBack:c,onClose:i,onOpenFarcaster:p})=>r.jsx(J,F.isMobile||u?F.isIOS?{title:t?t.message:"Sign in with Farcaster",subtitle:t?t.detail:"To sign in with Farcaster, please open the Farcaster app.",icon:R,iconVariant:"loading",iconLoadingStatus:{success:l,fail:!!t},primaryCta:e&&p?{label:"Open Farcaster app",onClick:p}:void 0,onBack:c,onClose:i,watermark:!0}:{title:t?t.message:"Signing in with Farcaster",subtitle:t?t.detail:"This should only take a moment",icon:R,iconVariant:"loading",iconLoadingStatus:{success:l,fail:!!t},onBack:c,onClose:i,watermark:!0,children:e&&F.isMobile&&r.jsx(oe,{children:r.jsx(z,{text:"Take me to Farcaster",url:e,color:"#8a63d2"})})}:{title:"Sign in with Farcaster",subtitle:"Scan with your phone's camera to continue.",onBack:c,onClose:i,watermark:!0,children:r.jsxs(ie,{children:[r.jsx(se,{children:e?r.jsx(q,{url:e,size:275,squareLogoElement:R}):r.jsx(ce,{children:r.jsx(W,{})})}),r.jsxs(ne,{children:[r.jsx(le,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),e&&r.jsx(te,{value:e,truncate:"end",maxLength:30,showCopyButton:!0,disabled:!0})]})]})}),Ae={component:()=>{let{authenticated:e,logout:u,ready:l,user:t}=I(),{lastScreen:c,navigate:i,navigateBack:p,setModalData:m}=U(),h=M(),{getAuthFlow:x,loginWithFarcaster:w,closePrivyModal:a,createAnalyticsEvent:S}=D(),[f,y]=n.useState(void 0),[C,$]=n.useState(!1),[b,L]=n.useState(!1),E=n.useRef([]),_=x(),T=_?.meta.connectUri;return n.useEffect((()=>{let g=Date.now(),j=setInterval((async()=>{let k=await _.pollForReady.execute(),N=Date.now()-g;if(k){clearInterval(j),$(!0);try{await w(),L(!0)}catch(o){let v={retryable:!1,message:"Authentication failed"};if(o?.privyErrorCode===d.ALLOWLIST_REJECTED)return void i("AllowlistRejectionScreen");if(o?.privyErrorCode===d.USER_LIMIT_REACHED)return console.error(new B(o).toString()),void i("UserLimitReachedScreen");if(o?.privyErrorCode===d.USER_DOES_NOT_EXIST)return void i("AccountNotFoundScreen");if(o?.privyErrorCode===d.LINKED_TO_ANOTHER_USER)v.detail=o.message??"This account has already been linked to another user.";else{if(o?.privyErrorCode===d.ACCOUNT_TRANSFER_REQUIRED&&o.data?.data?.nonce)return m({accountTransfer:{nonce:o.data?.data?.nonce,account:o.data?.data?.subject,displayName:o.data?.data?.account?.displayName,linkMethod:"farcaster",embeddedWalletAddress:o.data?.data?.otherUser?.embeddedWalletAddress,farcasterEmbeddedAddress:o.data?.data?.otherUser?.farcasterEmbeddedAddress}}),void i("LinkConflictScreen");o?.privyErrorCode===d.INVALID_CREDENTIALS?(v.retryable=!0,v.detail="Something went wrong. Try again."):o?.privyErrorCode===d.TOO_MANY_REQUESTS&&(v.detail="Too many requests. Please wait before trying again.")}y(v)}}else N>12e4&&(clearInterval(j),y({retryable:!0,message:"Authentication failed",detail:"The request timed out. Try again."}))}),2e3);return()=>{clearInterval(j),E.current.forEach((k=>clearTimeout(k)))}}),[]),n.useEffect((()=>{if(l&&e&&b&&t){if(h?.legal.requireUsersAcceptTerms&&!t.hasAcceptedTerms){let g=setTimeout((()=>{i("AffirmativeConsentScreen")}),A);return()=>clearTimeout(g)}b&&(P(t,h.embeddedWallets)?E.current.push(setTimeout((()=>{m({createWallet:{onSuccess:()=>{},onFailure:g=>{console.error(g),S({eventName:"embedded_wallet_creation_failure_logout",payload:{error:g,screen:"FarcasterConnectStatusScreen"}}),u()},callAuthOnSuccessOnClose:!0}}),i("EmbeddedWalletOnAccountCreateScreen")}),A)):E.current.push(setTimeout((()=>a({shouldCallAuthOnSuccess:!0,isSuccess:!0})),A)))}}),[b,l,e,t]),r.jsx(ae,{connectUri:T,loading:C,success:b,errorMessage:f,onBack:c?p:void 0,onClose:a,onOpenFarcaster:()=>{T&&(window.location.href=T)}})}};let oe=s.div`
  margin-top: 24px;
`,ie=s.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,se=s.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,ne=s.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,le=s.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,ce=s.div`
  position: relative;
  width: 82px;
  height: 82px;
`;export{Ae as FarcasterConnectStatusScreen,ae as FarcasterConnectStatusView,Ae as default};
