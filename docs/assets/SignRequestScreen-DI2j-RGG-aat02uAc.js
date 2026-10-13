import{d6 as o,d5 as t}from"./main-CBbADybU.js";import{b as A}from"./index-Dr9A5A5I.js";import{dJ as M,dh as N,dc as O,fA as k,dO as E,f0 as b,f1 as w,dF as z,df as u,cp as q,cl as F}from"./PrivyHost-BkthXyK4.js";import{h as I}from"./CopyToClipboard-i_OQSBJr-CiqsozbK.js";import{d as P}from"./Layouts-BMRfo5hw-D_d_tdXp.js";import{a as $,i as J}from"./JsonTree-BHzNC-ic-D_BstYLD.js";import{n as V}from"./ScreenLayout-CyLnlt7g-nvJ7pi0q.js";import{c as B}from"./createLucideIcon-DXkD8Gdx.js";import"./createWalletClient-1gkuE3OO.js";import"./ModalFooter-DDm8WjC0-DP9DrnCY.js";import"./Screen-BWBDKsup-uY1B7xsE.js";import"./index-CWARkn2w-DgbJHXFk.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",key:"ohrbg2"}]],K=B("square-pen",H),Q=u.img`
  && {
    height: ${e=>e.size==="sm"?"65px":"140px"};
    width: ${e=>e.size==="sm"?"65px":"140px"};
    border-radius: 16px;
    margin-bottom: 12px;
  }
`;let W=e=>{if(!q(e))return e;try{let a=F(e);return a.includes("�")?e:a}catch{return e}},G=e=>{try{let a=A.decode(e),s=new TextDecoder().decode(a);return s.includes("�")?e:s}catch{return e}},X=e=>{let{types:a,primaryType:s,...l}=e.typedData;return t.jsxs(t.Fragment,{children:[t.jsx(te,{data:l}),t.jsx(I,{text:(n=e.typedData,JSON.stringify(n,null,2)),itemName:"full payload to clipboard"})," "]});var n};const Y=({method:e,messageData:a,copy:s,iconUrl:l,isLoading:n,success:m,walletProxyIsLoading:g,errorMessage:h,isCancellable:d,onSign:c,onCancel:f,onClose:p})=>t.jsx(V,{title:s.title,subtitle:s.description,showClose:!0,onClose:p,icon:K,iconVariant:"subtle",helpText:h?t.jsx(ee,{children:h}):void 0,primaryCta:{label:s.buttonText,onClick:c,disabled:n||m||g,loading:n},secondaryCta:d?{label:"Not now",onClick:f,disabled:n||m||g}:void 0,watermark:!0,children:t.jsxs(P,{children:[l?t.jsx(Q,{style:{alignSelf:"center"},size:"sm",src:l,alt:"app image"}):null,t.jsxs(Z,{children:[e==="personal_sign"&&t.jsx(R,{children:W(a)}),e==="eth_signTypedData_v4"&&t.jsx(X,{typedData:a}),e==="solana_signMessage"&&t.jsx(R,{children:G(a)})]})]})}),ge={component:()=>{let{authenticated:e}=M(),{initializeWalletProxy:a,closePrivyModal:s}=N(),{navigate:l,data:n,onUserCloseViaDialogOrKeybindRef:m}=O(),[g,h]=o.useState(!0),[d,c]=o.useState(""),[f,p]=o.useState(),[y,C]=o.useState(null),[T,S]=o.useState(!1);o.useEffect((()=>{e||l("LandingScreen")}),[e]),o.useEffect((()=>{a(k).then((i=>{h(!1),i||(c("An error has occurred, please try again."),p(new E(new b(d,w.E32603_DEFAULT_INTERNAL_ERROR.eipCode))))}))}),[]);let{method:j,data:v,confirmAndSign:_,onSuccess:D,onFailure:L,uiOptions:r}=n.signMessage,U={title:r?.title||"Sign message",description:r?.description||"Signing this message will not cost you any fees.",buttonText:r?.buttonText||"Sign and continue"},x=i=>{i?D(i):L(f||new E(new b("The user rejected the request.",w.E4001_USER_REJECTED_REQUEST.eipCode))),s({shouldCallAuthOnSuccess:!1}),setTimeout((()=>{C(null),c(""),p(void 0)}),200)};return m.current=()=>{x(y)},t.jsx(Y,{method:j,messageData:v,copy:U,iconUrl:r?.iconUrl&&typeof r.iconUrl=="string"?r.iconUrl:void 0,isLoading:T,success:y!==null,walletProxyIsLoading:g,errorMessage:d,isCancellable:r?.isCancellable,onSign:async()=>{S(!0),c("");try{let i=await _();C(i),S(!1),setTimeout((()=>{x(i)}),z)}catch(i){console.error(i),c("An error has occurred, please try again."),p(new E(new b(d,w.E32603_DEFAULT_INTERNAL_ERROR.eipCode))),S(!1)}},onCancel:()=>x(null),onClose:()=>x(y)})}};let Z=u.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`,ee=u.p`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-error-dark);
    font-size: 14px;
    line-height: 22px;
  }
`,te=u($)`
  margin-top: 0;
`,R=u(J)`
  margin-top: 0;
`;export{ge as SignRequestScreen,Y as SignRequestView,ge as default};
