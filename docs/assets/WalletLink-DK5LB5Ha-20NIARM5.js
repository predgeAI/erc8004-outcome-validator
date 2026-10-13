import{d6 as n}from"./main-CSuisOTc.js";import{c1 as j,dr as $,df as l}from"./PrivyHost-zzxHKHQC.js";import{l as g,i as a,o as d,c as p}from"./ethers-zTjbodk5-Cg9NeZbl.js";import{r as k}from"./getFormattedUsdFromLamports-De3U9GlO-C446pzMl.js";import{t as y}from"./transaction-BNTP-bFm-CrebgH-D.js";const P=({weiQuantities:e,tokenPrice:r,tokenSymbol:o})=>{let i=a(e),t=r?d(i,r):void 0,s=p(i,o);return n.jsx(c,{children:t||s})},D=({weiQuantities:e,tokenPrice:r,tokenSymbol:o})=>{let i=a(e),t=r?d(i,r):void 0,s=p(i,o);return n.jsx(c,{children:t?n.jsxs(n.Fragment,{children:[n.jsx(S,{children:"USD"}),t==="<$0.01"?n.jsxs(x,{children:[n.jsx(h,{children:"<"}),"$0.01"]}):t]}):s})},F=({quantities:e,tokenPrice:r,tokenSymbol:o="SOL",tokenDecimals:i=9})=>{let t=e.reduce(((f,u)=>f+u),0n),s=r&&o==="SOL"&&i===9?k(t,r):void 0,m=o==="SOL"&&i===9?y(t):`${j(t,i)} ${o}`;return n.jsx(c,{children:s?n.jsx(n.Fragment,{children:s==="<$0.01"?n.jsxs(x,{children:[n.jsx(h,{children:"<"}),"$0.01"]}):s}):m})};let c=l.span`
  font-size: 14px;
  line-height: 140%;
  display: flex;
  gap: 4px;
  align-items: center;
`,S=l.span`
  font-size: 12px;
  line-height: 12px;
  color: var(--privy-color-foreground-3);
`,h=l.span`
  font-size: 10px;
`,x=l.span`
  display: flex;
  align-items: center;
`;function v(e,r){return`https://explorer.solana.com/account/${e}?chain=${r}`}const I=e=>n.jsx(w,{href:e.chainType==="ethereum"?g(e.chainId,e.walletAddress):v(e.walletAddress,e.chainId),target:"_blank",children:$(e.walletAddress)});let w=l.a`
  &:hover {
    text-decoration: underline;
  }
`;export{I as S,F as f,D as h,P as p};
