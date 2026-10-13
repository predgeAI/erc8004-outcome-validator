import{d6 as p,d5 as e}from"./main-CBbADybU.js";import{df as s}from"./PrivyHost-BkthXyK4.js";import{C as x}from"./check-CbypXaIG.js";import{C as g}from"./copy-7fokYhyt.js";let a=s.button`
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 0.5rem;

  && {
    color: var(--privy-color-foreground);
    font-weight: 500;
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`,h=s.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: var(--privy-color-foreground-2);
`,m=s(x)`
  color: var(--privy-color-icon-success);
  flex-shrink: 0;
`,f=s(g)`
  color: var(--privy-color-icon-muted);
  flex-shrink: 0;
`;function k({children:r,iconOnly:l,value:i,hideCopyIcon:t,onCopy:c,iconSize:o=14,...n}){let[u,d]=p.useState(!1);return e.jsxs(a,{...n,onClick:()=>{navigator.clipboard.writeText(i||(typeof r=="string"?r:"")).then((()=>c?.())).catch(console.error),d(!0),setTimeout((()=>d(!1)),1500)},children:[r," ",u?e.jsxs(h,{children:[e.jsx(m,{size:o})," ",!l&&"Copied"]}):!t&&e.jsx(f,{size:o})]})}const w=({value:r,includeChildren:l,children:i,...t})=>{let[c,o]=p.useState(!1),n=()=>{navigator.clipboard.writeText(r).catch(console.error),o(!0),setTimeout((()=>o(!1)),1500)};return e.jsxs(e.Fragment,{children:[l?e.jsx(a,{...t,onClick:n,children:i}):e.jsx(e.Fragment,{children:i}),e.jsx(a,{...t,onClick:n,children:c?e.jsx(h,{children:e.jsx(m,{})}):e.jsx(f,{})})]})};export{w as h,k as p};
