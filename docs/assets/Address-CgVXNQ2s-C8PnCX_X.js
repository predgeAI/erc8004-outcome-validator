import{d5 as p,d6 as e}from"./main-x5BaL2q1.js";import{dr as d,df as t}from"./PrivyHost-D3YG9wGm.js";import{f as m}from"./ModalFooter-DDm8WjC0-Bd3EN1EA.js";import{C as f}from"./check-D0YFH4Qi.js";import{C as x}from"./copy-BjHS4Ai6.js";const k=({address:r,showCopyIcon:i,url:n,className:l})=>{let[s,a]=p.useState(!1);function c(o){o.stopPropagation(),navigator.clipboard.writeText(r).then((()=>a(!0))).catch(console.error)}return p.useEffect((()=>{if(s){let o=setTimeout((()=>a(!1)),3e3);return()=>clearTimeout(o)}}),[s]),e.jsxs(h,n?{children:[e.jsx(g,{title:r,className:l,href:`${n}/address/${r}`,target:"_blank",children:d(r)}),i&&e.jsx(m,{onClick:c,size:"sm",style:{gap:"0.375rem"},children:e.jsxs(e.Fragment,s?{children:["Copied",e.jsx(f,{size:16})]}:{children:["Copy",e.jsx(x,{size:16})]})})]}:{children:[e.jsx(u,{title:r,className:l,children:d(r)}),i&&e.jsx(m,{onClick:c,size:"sm",style:{gap:"0.375rem",fontSize:"14px"},children:e.jsxs(e.Fragment,s?{children:["Copied",e.jsx(f,{size:14})]}:{children:["Copy",e.jsx(x,{size:14})]})})]})};let h=t.span`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
`,u=t.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--privy-color-foreground);
`,g=t.a`
  font-size: 14px;
  color: var(--privy-color-foreground);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;export{k as d};
