import{d6 as l,dj as h}from"./main-B6adjejY.js";import{Q as m}from"./browser-DnR8LI-y.js";import{da as u,df as f,dY as p,dZ as C}from"./PrivyHost-eRDFASS1.js";const $=e=>l.jsx("svg",{viewBox:"0 0 50 50",fill:"none",xmlns:"http://www.w3.org/2000/svg",...e,children:l.jsx("rect",{width:"50",height:"50",fill:"black",rx:10,ry:10})});let c=(e,r,t,o,g)=>{for(let i=r;i<r+o;i++)for(let s=t;s<t+g;s++){let n=e?.[s];n&&n[i]&&(n[i]=0)}return e},z=(e,r)=>{let t=m.create(e,{errorCorrectionLevel:r}).modules,o=p(Array.from(t.data),t.size);return o=c(o,0,0,7,7),o=c(o,o.length-7,0,7,7),c(o,0,o.length-7,7,7)},j=({x:e,y:r,cellSize:t,bgColor:o,fgColor:g})=>l.jsx(l.Fragment,{children:[0,1,2].map((i=>l.jsx("circle",{r:t*(7-2*i)/2,cx:e+7*t/2,cy:r+7*t/2,fill:i%2!=0?o:g},`finder-${e}-${r}-${i}`)))}),b=({cellSize:e,matrixSize:r,bgColor:t,fgColor:o})=>l.jsx(l.Fragment,{children:[[0,0],[(r-7)*e,0],[0,(r-7)*e]].map((([g,i])=>l.jsx(j,{x:g,y:i,cellSize:e,bgColor:t,fgColor:o},`finder-${g}-${i}`)))}),S=({matrix:e,cellSize:r,color:t})=>l.jsx(l.Fragment,{children:e.map(((o,g)=>o.map(((i,s)=>i?l.jsx("rect",{height:r-.4,width:r-.4,x:g*r+.1*r,y:s*r+.1*r,rx:.5*r,ry:.5*r,fill:t},`cell-${g}-${s}`):l.jsx(h.Fragment,{},`circle-${g}-${s}`)))))}),v=({cellSize:e,matrixSize:r,element:t,sizePercentage:o,bgColor:g})=>{if(!t)return l.jsx(l.Fragment,{});let i=r*(o||.14),s=Math.floor(r/2-i/2),n=Math.floor(r/2+i/2);(n-s)%2!=r%2&&(n+=1);let a=(n-s)*e,x=a-.2*a,d=s*e;return l.jsxs(l.Fragment,{children:[l.jsx("rect",{x:s*e,y:s*e,width:a,height:a,fill:g}),l.jsx(t,{x:d+.1*a,y:d+.1*a,height:x,width:x})]})},w=e=>{let r=e.outputSize,t=z(e.url,e.errorCorrectionLevel),o=r/t.length,g=C(2*o,{min:.025*r,max:.036*r});return l.jsxs("svg",{height:e.outputSize,width:e.outputSize,viewBox:`0 0 ${e.outputSize} ${e.outputSize}`,style:{height:"100%",width:"100%",padding:`${g}px`},children:[l.jsx(S,{matrix:t,cellSize:o,color:e.fgColor}),l.jsx(b,{cellSize:o,matrixSize:t.length,fgColor:e.fgColor,bgColor:e.bgColor}),l.jsx(v,{cellSize:o,element:e.logo?.element,bgColor:e.bgColor,matrixSize:t.length})]})},y=f.div.attrs({className:"ph-no-capture"})`
  display: flex;
  justify-content: center;
  align-items: center;
  height: ${e=>`${e.$size}px`};
  width: ${e=>`${e.$size}px`};
  margin: auto;
  background-color: ${e=>e.$bgColor};

  && {
    border-width: 2px;
    border-color: ${e=>e.$borderColor};
    border-radius: var(--privy-border-radius-md);
  }
`;const Q=e=>{let{appearance:r}=u(),t=e.bgColor||"#FFFFFF",o=e.fgColor||"#000000",g=e.size||160,i=r.palette.colorScheme==="dark"?t:o;return l.jsx(y,{$size:g,$bgColor:t,$fgColor:o,$borderColor:i,children:l.jsx(w,{url:e.url,logo:e.hideLogo?void 0:{element:e.squareLogoElement??$},outputSize:g,bgColor:t,fgColor:o,errorCorrectionLevel:e.errorCorrectionLevel||"Q"})})};export{Q as x};
