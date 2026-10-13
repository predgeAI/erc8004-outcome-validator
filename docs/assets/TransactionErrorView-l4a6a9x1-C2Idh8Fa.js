import{d5 as g,d6 as e}from"./main-Dh3KuUbK.js";import{df as c,dh as Le,da as te,eM as _,ee as oe,g4 as De,cm as Me}from"./PrivyHost-C4vJ8oT4.js";import{L as Q,i as Re,b as X,h as ae,w as Pe}from"./ModalFooter-DDm8WjC0-CW9Do4Nb.js";import{e as n,t as B,s,n as i,a as ze}from"./Value-DTgR824E-DHDi8pTq.js";import{e as z}from"./ErrorMessage-D8VaAP5m-CN34GBCH.js";import{r as T}from"./LabelXs-oqZNqbm_-dtN_Hud7.js";import{r as le}from"./Subtitle-CV-2yKE4-DkvINDgv.js";import{e as de}from"./Title-BnzYV3Is-Cd7sUcHj.js";import{d}from"./Address-CgVXNQ2s-BMHwKSij.js";import{j as Be}from"./WalletInfoCard-DDtrzp4v-DVdph0Mt.js";import{i as ce}from"./LoadingSkeleton-BMsgO5PV-CzbwyJ-Z.js";import{d as Ve}from"./shared-FM0rljBt-KZTRcmlo.js";import{o as He,F as We}from"./Checkbox-D1EDeo41-CRARdde9.js";import{i as Ue}from"./ErrorBanner-BcpGRt0h-EiYCYoL7.js";import{t as qe}from"./WarningBanner-ZZqCEtZK-Di1VhHUP.js";import{F as Je}from"./ExclamationCircleIcon-DLu3JABq.js";import{F as xe}from"./ChevronDownIcon-BXpVqdJB.js";function Qe({title:a,titleId:l,...o},x){return g.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:x,"aria-labelledby":l},o),a?g.createElement("title",{id:l},a):null,g.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"}))}const Xe=g.forwardRef(Qe);function Ze({title:a,titleId:l,...o},x){return g.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:x,"aria-labelledby":l},o),a?g.createElement("title",{id:l},a):null,g.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"}))}const he=g.forwardRef(Ze);function Ke({title:a,titleId:l,...o},x){return g.createElement("svg",Object.assign({xmlns:"http://www.w3.org/2000/svg",fill:"none",viewBox:"0 0 24 24",strokeWidth:1.5,stroke:"currentColor","aria-hidden":"true","data-slot":"icon",ref:x,"aria-labelledby":l},o),a?g.createElement("title",{id:l},a):null,g.createElement("path",{strokeLinecap:"round",strokeLinejoin:"round",d:"M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z"}))}const Ye=g.forwardRef(Ke),je=c(n)`
  cursor: pointer;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  color: var(--privy-color-accent);
  svg {
    fill: var(--privy-color-accent);
  }
`;var G=({iconUrl:a,value:l,symbol:o,usdValue:x,nftName:b,nftCount:u,decimals:t,$isLoading:m})=>{if(m)return e.jsx($,{$isLoading:m});let f=l&&x&&t?(function(I,F,E){let A=parseFloat(I),j=parseFloat(E);if(A===0||j===0||Number.isNaN(A)||Number.isNaN(j))return I;let v=Math.ceil(-Math.log10(.01/(j/A))),y=Math.pow(10,v=Math.max(v=Math.min(v,F),1)),S=+(Math.floor(A*y)/y).toFixed(v).replace(/\.?0+$/,"");return Intl.NumberFormat(void 0,{maximumFractionDigits:F}).format(S)})(l,t,x):l;return e.jsxs("div",{children:[e.jsxs($,{$isLoading:m,children:[a&&e.jsx(Ge,{src:a,alt:"Token icon"}),u&&u>1?u+"x":void 0," ",b,f," ",o]}),x&&e.jsxs(_e,{$isLoading:m,children:["$",x]})]})};let $=c.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.375rem;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  /**
   * @NOTE This is a code smell anti-pattern for styling components.
   * We are mixing JSX definitions with styled-components CSS definitions.
   * This is not ideal and should be refactored in the future to separate concerns.
   * This is also hard to read, as it makes it difficult to understand the structure
   * of the component and its styles by viewing the JSX.
   */

  ${ce}
`;const _e=c.span`
  color: var(--privy-color-foreground-2);
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  word-break: break-all;
  text-align: right;
  display: flex;
  justify-content: flex-end;

  ${ce}
`;let Ge=c.img`
  height: 14px;
  width: 14px;
  margin-right: 4px;
  object-fit: contain;
`;const $e=a=>{let{chain:l,transactionDetails:o,isTokenContractInfoLoading:x,symbol:b}=a,{action:u,functionName:t}=o;return e.jsx(Ve,{children:e.jsxs(B,{children:[u!=="transaction"&&e.jsxs(s,{children:[e.jsx(n,{children:"Action"}),e.jsx(i,{children:t})]}),t==="mint"&&"args"in o&&o.args.filter((m=>m)).map(((m,f)=>e.jsxs(s,{children:[e.jsx(n,{children:`Param ${f}`}),e.jsx(i,{children:typeof m=="string"&&Me(m)?e.jsx(d,{address:m,url:l?.blockExplorers?.default?.url,showCopyIcon:!1}):m?.toString()})]},f))),t==="setApprovalForAll"&&o.operator&&e.jsxs(s,{children:[e.jsx(n,{children:"Operator"}),e.jsx(i,{children:e.jsx(d,{address:o.operator,url:l?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),t==="setApprovalForAll"&&o.approved!==void 0&&e.jsxs(s,{children:[e.jsx(n,{children:"Set approval to"}),e.jsx(i,{children:o.approved?"true":"false"})]}),t==="transfer"||t==="transferWithMemo"||t==="transferFrom"||t==="safeTransferFrom"||t==="approve"?e.jsxs(e.Fragment,{children:["formattedAmount"in o&&o.formattedAmount&&e.jsxs(s,{children:[e.jsx(n,{children:"Amount"}),e.jsxs(i,{$isLoading:x,children:[o.formattedAmount," ",b]})]}),"tokenId"in o&&o.tokenId&&e.jsxs(s,{children:[e.jsx(n,{children:"Token ID"}),e.jsx(i,{children:o.tokenId.toString()})]})]}):null,t==="safeBatchTransferFrom"&&e.jsxs(e.Fragment,{children:["amounts"in o&&o.amounts&&e.jsxs(s,{children:[e.jsx(n,{children:"Amounts"}),e.jsx(i,{children:o.amounts.join(", ")})]}),"tokenIds"in o&&o.tokenIds&&e.jsxs(s,{children:[e.jsx(n,{children:"Token IDs"}),e.jsx(i,{children:o.tokenIds.join(", ")})]})]}),t==="approve"&&o.spender&&e.jsxs(s,{children:[e.jsx(n,{children:"Spender"}),e.jsx(i,{children:e.jsx(d,{address:o.spender,url:l?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),(t==="transferFrom"||t==="safeTransferFrom"||t==="safeBatchTransferFrom")&&o.transferFrom&&e.jsxs(s,{children:[e.jsx(n,{children:"Transferring from"}),e.jsx(i,{children:e.jsx(d,{address:o.transferFrom,url:l?.blockExplorers?.default?.url,showCopyIcon:!1})})]}),(t==="transferFrom"||t==="safeTransferFrom"||t==="safeBatchTransferFrom")&&o.transferTo&&e.jsxs(s,{children:[e.jsx(n,{children:"Transferring to"}),e.jsx(i,{children:e.jsx(d,{address:o.transferTo,url:l?.blockExplorers?.default?.url,showCopyIcon:!1})})]})]})})},er=({variant:a,setPreventMaliciousTransaction:l,colorScheme:o="light",preventMaliciousTransaction:x})=>a==="warn"?e.jsx(ee,{children:e.jsxs(qe,{theme:o,children:[e.jsx("span",{style:{fontWeight:"500"},children:"Warning: Suspicious transaction"}),e.jsx("br",{}),"This has been flagged as a potentially deceptive request. Approving could put your assets or funds at risk."]})}):a==="error"?e.jsx(e.Fragment,{children:e.jsxs(ee,{children:[e.jsx(Ue,{theme:o,children:e.jsxs("div",{children:[e.jsx("strong",{children:"This is a malicious transaction"}),e.jsx("br",{}),"This transaction transfers tokens to a known malicious address. Proceeding may result in the loss of valuable assets."]})}),e.jsxs(rr,{children:[e.jsx(He,{color:"var(--privy-color-error)",checked:!x,readOnly:!0,onClick:()=>l(!x)}),e.jsx("span",{children:"I understand and want to proceed anyways."})]})]})}):null;let ee=c.div`
  margin-top: 1.5rem;
`,rr=c.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
`;const sr=({transactionIndex:a,maxIndex:l})=>typeof a!="number"||l===0?"":` (${a+1} / ${l+1})`,Nr=({img:a,submitError:l,prepareError:o,onClose:x,action:b,title:u,subtitle:t,to:m,tokenAddress:f,network:I,missingFunds:F,fee:E,from:A,cta:j,disabled:v,chain:y,isSubmitting:S,isPreparing:p,isTokenPriceLoading:O,isTokenContractInfoLoading:D,isSponsored:M,symbol:V,balance:R,onClick:N,transactionDetails:C,transactionIndex:P,maxIndex:H,onBack:r,chainName:k,validation:W,hasScanDetails:Z,setIsScanDetailsOpen:ye,preventMaliciousTransaction:ke,setPreventMaliciousTransaction:ve,tokensSent:K,tokensReceived:U,isScanning:we,isCancellable:be,functionName:Te})=>{let{showTransactionDetails:q,setShowTransactionDetails:Ie,hasMoreDetails:Ae,isErc20Ish:Se}=(h=>{let[L,Ee]=g.useState(!1),J=!0,Y=!1;return(!h||h.isErc20Ish||h.action==="transaction")&&(J=!1),J&&(Y=Object.entries(h||{}).some((([Oe,Ne])=>Ne&&!["action","isErc20Ish","isNFTIsh"].includes(Oe)))),{showTransactionDetails:L,setShowTransactionDetails:Ee,hasMoreDetails:J&&Y,isErc20Ish:h?.isErc20Ish}})(C),Ce=te(),Fe=Se&&D||p||O||we;return e.jsxs(e.Fragment,{children:[e.jsx(Q,{onClose:x,backFn:r}),a&&e.jsx(pe,{children:a}),e.jsxs(de,{style:{marginTop:a?"1.5rem":0},children:[u,e.jsx(sr,{maxIndex:H,transactionIndex:P})]}),e.jsx(le,{children:t}),e.jsxs(B,{style:{marginTop:"2rem"},children:[(!!K[0]||Fe)&&e.jsxs(s,{children:[U.length>0?e.jsx(n,{children:"Send"}):e.jsx(n,{children:b==="approve"?"Approval amount":"Amount"}),e.jsx("div",{className:"flex flex-col",children:K.map(((h,L)=>e.jsx(G,{iconUrl:h.iconUrl,value:Te==="setApprovalForAll"?"All":h.value,usdValue:h.usdValue,symbol:h.symbol,nftName:h.nftName,nftCount:h.nftCount,decimals:h.decimals},L)))})]}),U.length>0&&e.jsxs(s,{children:[e.jsx(n,{children:"Receive"}),e.jsx("div",{className:"flex flex-col",children:U.map(((h,L)=>e.jsx(G,{iconUrl:h.iconUrl,value:h.value,usdValue:h.usdValue,symbol:h.symbol,nftName:h.nftName,nftCount:h.nftCount,decimals:h.decimals},L)))})]}),C&&"spender"in C&&C?.spender?e.jsxs(s,{children:[e.jsx(n,{children:"Spender"}),e.jsx(i,{children:e.jsx(d,{address:C.spender,url:y?.blockExplorers?.default?.url})})]}):null,m&&e.jsxs(s,{children:[e.jsx(n,{children:"To"}),e.jsx(i,{children:e.jsx(d,{address:m,url:y?.blockExplorers?.default?.url,showCopyIcon:!0})})]}),f&&e.jsxs(s,{children:[e.jsx(n,{children:"Token address"}),e.jsx(i,{children:e.jsx(d,{address:f,url:y?.blockExplorers?.default?.url})})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Network"}),e.jsx(i,{children:I})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Estimated fee"}),e.jsx(i,{$isLoading:p||O||M===void 0,children:M?e.jsxs(ge,{children:[e.jsxs(fe,{children:["Sponsored by ",Ce.name]}),e.jsx(he,{height:16,width:16})]}):E})]}),Ae&&!Z&&e.jsxs(e.Fragment,{children:[e.jsx(s,{className:"cursor-pointer",onClick:()=>Ie(!q),children:e.jsxs(ze,{className:"flex items-center gap-x-1",children:["Details"," ",e.jsx(xe,{style:{width:"0.75rem",marginLeft:"0.25rem",transform:q?"rotate(180deg)":void 0}})]})}),q&&C&&e.jsx($e,{action:b,chain:y,transactionDetails:C,isTokenContractInfoLoading:D,symbol:V})]}),Z&&e.jsx(s,{children:e.jsxs(je,{onClick:()=>ye(!0),children:[e.jsx("span",{className:"text-color-primary",children:"Details"}),e.jsx(Xe,{height:"14px",width:"14px",strokeWidth:"2"})]})})]}),e.jsx(oe,{}),l?e.jsx(z,{style:{marginTop:"2rem"},children:l.message}):o&&P===0?e.jsx(z,{style:{marginTop:"2rem"},children:o.shortMessage??ue}):null,e.jsx(er,{variant:W,preventMaliciousTransaction:ke,setPreventMaliciousTransaction:ve}),e.jsx(me,{$useSmallMargins:!(!o&&!l&&W!=="warn"&&W!=="error"),address:A,balance:R,errMsg:p||o||l||!F?void 0:`Add funds on ${y?.name??k} to complete transaction.`}),e.jsx(X,{style:{marginTop:"1rem"},loading:S,disabled:v||p,onClick:N,children:j}),be&&e.jsx(Pe,{style:{marginTop:"1rem"},onClick:x,isSubmitting:!1,children:"Not now"}),e.jsx(ae,{})]})},Lr=({img:a,title:l,subtitle:o,cta:x,instructions:b,network:u,blockExplorerUrl:t,isMissingFunds:m,submitError:f,parseError:I,total:F,swap:E,transactingWalletAddress:A,fee:j,balance:v,disabled:y,isSubmitting:S,isPreparing:p,isTokenPriceLoading:O,onClick:D,onClose:M,onBack:V,isSponsored:R})=>{let N=p||O,[C,P]=g.useState(!1),H=te();return e.jsxs(e.Fragment,{children:[e.jsx(Q,{onClose:M,backFn:V}),a&&e.jsx(pe,{children:a}),e.jsx(de,{style:{marginTop:a?"1.5rem":0},children:l}),e.jsx(le,{children:o}),e.jsxs(B,{style:{marginTop:"2rem",marginBottom:".5rem"},children:[(F||N)&&e.jsxs(s,{children:[e.jsx(n,{children:"Amount"}),e.jsx(i,{$isLoading:N,children:F})]}),E&&e.jsxs(s,{children:[e.jsx(n,{children:"Swap"}),e.jsx(i,{children:E})]}),u&&e.jsxs(s,{children:[e.jsx(n,{children:"Network"}),e.jsx(i,{children:u})]}),(j||N||R!==void 0)&&e.jsxs(s,{children:[e.jsx(n,{children:"Estimated fee"}),e.jsx(i,{$isLoading:N,children:R&&!N?e.jsxs(ge,{children:[e.jsxs(fe,{children:["Sponsored by ",H.name]}),e.jsx(he,{height:16,width:16})]}):j})]})]}),e.jsx(s,{children:e.jsxs(je,{onClick:()=>P((r=>!r)),children:[e.jsx("span",{children:"Advanced"}),e.jsx(xe,{height:"16px",width:"16px",strokeWidth:"2",style:{transition:"all 300ms",transform:C?"rotate(180deg)":void 0}})]})}),C&&e.jsx(e.Fragment,{children:b.map(((r,k)=>r.type==="sol-transfer"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Transfer ",r.withSeed?"with seed":""]})}),e.jsxs(s,{children:[e.jsx(n,{children:"Amount"}),e.jsxs(i,{children:[_({amount:r.value,decimals:r.token.decimals})," ",r.token.symbol]})]}),!!r.toAccount&&e.jsxs(s,{children:[e.jsx(n,{children:"Destination"}),e.jsx(i,{children:e.jsx(d,{address:r.toAccount,url:t})})]})]},k):r.type==="spl-transfer"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Transfer ",r.token.symbol]})}),e.jsxs(s,{children:[e.jsx(n,{children:"Amount"}),e.jsx(i,{children:r.value.toString()})]}),!!r.fromAta&&e.jsxs(s,{children:[e.jsx(n,{children:"Source"}),e.jsx(i,{children:e.jsx(d,{address:r.fromAta,url:t})})]}),!!r.toAta&&e.jsxs(s,{children:[e.jsx(n,{children:"Destination"}),e.jsx(i,{children:e.jsx(d,{address:r.toAta,url:t})})]}),!!r.token.address&&e.jsxs(s,{children:[e.jsx(n,{children:"Token"}),e.jsx(i,{children:e.jsx(d,{address:r.token.address,url:t})})]})]},k):r.type==="ata-creation"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsx(T,{children:"Create token account"})}),e.jsxs(s,{children:[e.jsx(n,{children:"Program ID"}),e.jsx(i,{children:e.jsx(d,{address:r.program,url:t})})]}),!!r.owner&&e.jsxs(s,{children:[e.jsx(n,{children:"Owner"}),e.jsx(i,{children:e.jsx(d,{address:r.owner,url:t})})]})]},k):r.type==="create-account"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Create account ",r.withSeed?"with seed":""]})}),!!r.account&&e.jsxs(s,{children:[e.jsx(n,{children:"Account"}),e.jsx(i,{children:e.jsx(d,{address:r.account,url:t})})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Amount"}),e.jsxs(i,{children:[_({amount:r.value,decimals:9})," SOL"]})]})]},k):r.type==="spl-init-account"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsx(T,{children:"Initialize token account"})}),!!r.account&&e.jsxs(s,{children:[e.jsx(n,{children:"Account"}),e.jsx(i,{children:e.jsx(d,{address:r.account,url:t})})]}),!!r.mint&&e.jsxs(s,{children:[e.jsx(n,{children:"Mint"}),e.jsx(i,{children:e.jsx(d,{address:r.mint,url:t})})]}),!!r.owner&&e.jsxs(s,{children:[e.jsx(n,{children:"Owner"}),e.jsx(i,{children:e.jsx(d,{address:r.owner,url:t})})]})]},k):r.type==="spl-close-account"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsx(T,{children:"Close token account"})}),!!r.source&&e.jsxs(s,{children:[e.jsx(n,{children:"Source"}),e.jsx(i,{children:e.jsx(d,{address:r.source,url:t})})]}),!!r.destination&&e.jsxs(s,{children:[e.jsx(n,{children:"Destination"}),e.jsx(i,{children:e.jsx(d,{address:r.destination,url:t})})]}),!!r.owner&&e.jsxs(s,{children:[e.jsx(n,{children:"Owner"}),e.jsx(i,{children:e.jsx(d,{address:r.owner,url:t})})]})]},k):r.type==="spl-sync-native"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsx(T,{children:"Sync native"})}),e.jsxs(s,{children:[e.jsx(n,{children:"Program ID"}),e.jsx(i,{children:e.jsx(d,{address:r.program,url:t})})]})]},k):r.type==="raydium-swap-base-input"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Raydium swap"," ",r.tokenIn&&r.tokenOut?`${r.tokenIn.symbol} → ${r.tokenOut.symbol}`:""]})}),e.jsxs(s,{children:[e.jsx(n,{children:"Amount in"}),e.jsx(i,{children:r.amountIn.toString()})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Minimum amount out"}),e.jsx(i,{children:r.minimumAmountOut.toString()})]}),r.mintIn&&e.jsxs(s,{children:[e.jsx(n,{children:"Token in"}),e.jsx(i,{children:e.jsx(d,{address:r.mintIn,url:t})})]}),r.mintOut&&e.jsxs(s,{children:[e.jsx(n,{children:"Token out"}),e.jsx(i,{children:e.jsx(d,{address:r.mintOut,url:t})})]})]},k):r.type==="raydium-swap-base-output"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Raydium swap"," ",r.tokenIn&&r.tokenOut?`${r.tokenIn.symbol} → ${r.tokenOut.symbol}`:""]})}),e.jsxs(s,{children:[e.jsx(n,{children:"Max amount in"}),e.jsx(i,{children:r.maxAmountIn.toString()})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Amount out"}),e.jsx(i,{children:r.amountOut.toString()})]}),r.mintIn&&e.jsxs(s,{children:[e.jsx(n,{children:"Token in"}),e.jsx(i,{children:e.jsx(d,{address:r.mintIn,url:t})})]}),r.mintOut&&e.jsxs(s,{children:[e.jsx(n,{children:"Token out"}),e.jsx(i,{children:e.jsx(d,{address:r.mintOut,url:t})})]})]},k):r.type==="jupiter-swap-shared-accounts-route"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Jupiter swap"," ",r.tokenIn&&r.tokenOut?`${r.tokenIn.symbol} → ${r.tokenOut.symbol}`:""]})}),e.jsxs(s,{children:[e.jsx(n,{children:"In amount"}),e.jsx(i,{children:r.inAmount.toString()})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Quoted out amount"}),e.jsx(i,{children:r.quotedOutAmount.toString()})]}),r.mintIn&&e.jsxs(s,{children:[e.jsx(n,{children:"Token in"}),e.jsx(i,{children:e.jsx(d,{address:r.mintIn,url:t})})]}),r.mintOut&&e.jsxs(s,{children:[e.jsx(n,{children:"Token out"}),e.jsx(i,{children:e.jsx(d,{address:r.mintOut,url:t})})]})]},k):r.type==="jupiter-swap-exact-out-route"?e.jsxs(w,{children:[e.jsx(s,{children:e.jsxs(T,{children:["Jupiter swap"," ",r.tokenIn&&r.tokenOut?`${r.tokenIn.symbol} → ${r.tokenOut.symbol}`:""]})}),e.jsxs(s,{children:[e.jsx(n,{children:"Quoted in amount"}),e.jsx(i,{children:r.quotedInAmount.toString()})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Amount out"}),e.jsx(i,{children:r.outAmount.toString()})]}),r.mintIn&&e.jsxs(s,{children:[e.jsx(n,{children:"Token in"}),e.jsx(i,{children:e.jsx(d,{address:r.mintIn,url:t})})]}),r.mintOut&&e.jsxs(s,{children:[e.jsx(n,{children:"Token out"}),e.jsx(i,{children:e.jsx(d,{address:r.mintOut,url:t})})]})]},k):e.jsxs(w,{children:[e.jsxs(s,{children:[e.jsx(n,{children:"Program ID"}),e.jsx(i,{children:e.jsx(d,{address:r.program,url:t})})]}),e.jsxs(s,{children:[e.jsx(n,{children:"Data"}),e.jsx(i,{children:r.discriminator})]})]},k)))}),e.jsx(oe,{}),f?e.jsx(z,{style:{marginTop:"2rem"},children:f.message}):I?e.jsx(z,{style:{marginTop:"2rem"},children:ue}):null,e.jsx(me,{$useSmallMargins:!(!I&&!f),title:"",address:A,balance:v,errMsg:p||I||f||!m?void 0:"Add funds on Solana to complete transaction."}),e.jsx(X,{style:{marginTop:"1rem"},loading:S,disabled:y||p,onClick:D,children:x}),e.jsx(ae,{})]})};let me=c(Be)`
  ${a=>a.$useSmallMargins?"margin-top: 0.5rem;":"margin-top: 2rem;"}
`,w=c(B)`
  margin-top: 0.5rem;
  border: 1px solid var(--privy-color-foreground-4);
  border-radius: var(--privy-border-radius-sm);
  padding: 0.5rem;
`,ue="There was an error preparing your transaction. Your transaction request will likely fail.",pe=c.div`
  display: flex;
  width: 100%;
  justify-content: center;
  max-height: 40px;

  > img {
    object-fit: contain;
    border-radius: var(--privy-border-radius-sm);
  }
`,ge=c.span`
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
`,fe=c.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,re=a=>a?.code===De.COMPLIANCE_BLOCKED,nr=()=>e.jsxs(ar,{children:[e.jsx(dr,{}),e.jsx(lr,{})]});const Dr=({transactionError:a,chainId:l,onClose:o,onRetry:x,chainType:b,transactionHash:u})=>{let{chains:t}=Le(),[m,f]=g.useState(!1),{errorCode:I,errorMessage:F}=((j,v)=>{if(v==="ethereum")return re(j)?{errorCode:"Transaction blocked",errorMessage:j.message}:{errorCode:j.details??j.message,errorMessage:j.shortMessage};let y=j.txSignature,S=j?.transactionMessage||"Something went wrong.";if(Array.isArray(j.logs)){let p=j.logs.find((O=>/insufficient (lamports|funds)/gi.test(O)));p&&(S=p)}return{transactionHash:y,errorMessage:S}})(a,b),E=re(a),A=(({chains:j,chainId:v,chainType:y,transactionHash:S})=>y==="ethereum"?j.find((p=>p.id===v))?.blockExplorers?.default.url??"https://etherscan.io":(function(p,O){return`https://explorer.solana.com/tx/${p}?chain=${O}`})(S||"",v))({chains:t,chainId:l,chainType:b,transactionHash:u});return e.jsxs(e.Fragment,{children:[e.jsx(Q,{onClose:o}),e.jsxs(ir,{children:[e.jsx(nr,{}),e.jsx(tr,{children:I}),e.jsx(or,{children:E?"This transaction cannot be completed.":"Please try again."}),e.jsxs(ne,{children:[e.jsx(se,{children:"Error message"}),e.jsx(ie,{$clickable:!1,children:F})]}),u&&e.jsxs(ne,{children:[e.jsx(se,{children:"Transaction hash"}),e.jsxs(xr,{children:["Copy this hash to view details about the transaction on a"," ",e.jsx("u",{children:e.jsx("a",{href:A,children:"block explorer"})}),"."]}),e.jsxs(ie,{$clickable:!0,onClick:async()=>{await navigator.clipboard.writeText(u),f(!0)},children:[u,e.jsx(mr,{clicked:m})]})]}),!E&&e.jsx(cr,{onClick:()=>x({resetNonce:!!u}),children:"Retry transaction"})]}),e.jsx(Re,{})]})};let ir=c.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`,tr=c.span`
  color: var(--privy-color-foreground);
  font-size: 1.125rem;
  font-weight: 500;
  line-height: 1.25rem; /* 111.111% */
  text-align: center;
  margin: 10px;
`,or=c.span`
  margin-top: 4px;
  margin-bottom: 10px;
  color: var(--privy-color-foreground-3);
  text-align: center;

  font-size: 0.875rem;
  font-style: normal;
  font-weight: 400;
  line-height: 20px; /* 142.857% */
  letter-spacing: -0.008px;
`,ar=c.div`
  position: relative;
  width: 60px;
  height: 60px;
  margin: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
`,lr=c(Je)`
  position: absolute;
  width: 35px;
  height: 35px;
  color: var(--privy-color-error);
`,dr=c.div`
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background-color: var(--privy-color-error);
  opacity: 0.1;
`,cr=c(X)`
  && {
    margin-top: 24px;
  }
  transition:
    color 350ms ease,
    background-color 350ms ease;
`,se=c.span`
  width: 100%;
  text-align: left;
  font-size: 0.825rem;
  color: var(--privy-color-foreground);
  padding: 4px;
`,ne=c.div`
  width: 100%;
  margin: 5px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`,xr=c.text`
  position: relative;
  width: 100%;
  padding: 5px;
  font-size: 0.8rem;
  color: var(--privy-color-foreground-3);
  text-align: left;
  overflow-wrap: break-word;
`,ie=c.span`
  position: relative;
  width: 100%;
  background-color: var(--privy-color-background-2);
  padding: 8px 12px;
  border-radius: 10px;
  margin-top: 5px;
  font-size: 14px;
  color: var(--privy-color-foreground-3);
  text-align: left;
  overflow-wrap: break-word;
  ${a=>a.$clickable&&`cursor: pointer;
  transition: background-color 0.3s;
  padding-right: 45px;

  &:hover {
    background-color: var(--privy-color-foreground-4);
  }`}
`,hr=c(Ye)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,jr=c(We)`
  position: absolute;
  top: 13px;
  right: 13px;
  width: 24px;
  height: 24px;
`,mr=({clicked:a})=>e.jsx(a?jr:hr,{});export{Nr as Q,Lr as _,Dr as o};
