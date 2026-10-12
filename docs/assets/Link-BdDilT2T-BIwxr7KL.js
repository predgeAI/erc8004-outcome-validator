import{d3 as l}from"./index-BkP2iPA7.js";import{df as d}from"./PrivyHost-BEUWOLye.js";let c=d.a`
  && {
    color: ${({$variant:r})=>r==="underlined"?"var(--privy-color-foreground)":"var(--privy-link-navigation-color, var(--privy-color-accent))"};
    font-weight: 400;
    text-decoration: ${({$variant:r})=>r==="underlined"?"underline":"var(--privy-link-navigation-decoration, none)"};
    text-underline-offset: 4px;
    text-decoration-thickness: 1px;
    cursor: ${({$disabled:r})=>r?"not-allowed":"pointer"};
    opacity: ${({$disabled:r})=>r?.5:1};

    font-size: ${({$size:r})=>{switch(r){case"xs":return"12px";case"sm":return"14px";default:return"16px"}}};

    line-height: ${({$size:r})=>{switch(r){case"xs":return"18px";case"sm":return"22px";default:return"24px"}}};

    transition:
      color 200ms ease,
      text-decoration-color 200ms ease,
      opacity 200ms ease;

    &:hover {
      color: ${({$variant:r,$disabled:e})=>r==="underlined"?"var(--privy-color-foreground)":"var(--privy-link-navigation-color, var(--privy-color-accent))"};
      text-decoration: ${({$disabled:r})=>r?"none":"underline"};
      text-underline-offset: 4px;
    }

    &:active {
      color: ${({$variant:r,$disabled:e})=>e?r==="underlined"?"var(--privy-color-foreground)":"var(--privy-link-navigation-color, var(--privy-color-accent))":"var(--privy-color-foreground)"};
    }

    &:focus {
      outline: none;
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--privy-shadow-focus-ring);
      border-radius: 2px;
    }
  }
`;const u=({size:r="md",variant:e="navigation",disabled:o=!1,as:n,children:a,onClick:t,...s})=>l.jsx(c,{as:n,$size:r,$variant:e,$disabled:o,onClick:i=>{o?i.preventDefault():t?.(i)},...s,children:a});export{u as i};
