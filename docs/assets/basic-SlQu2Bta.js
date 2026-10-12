import{i as D,b as u,w as Oe,c as xn}from"./lit-element-CTMkb1fT.js";import{n as d,r as I,o as j}from"./class-map-C0Oe7Uqq.js";import{o as H,A as N,O as q,i as L,e as A,a as Ve,E as F,R as P,q as U,x as zt,D as ye,u as ge,H as zn,r as Q,t as me,T as _t,d as Me,M as En,F as Rn,G as Sn,m as Tn,C as fe,I as qn,J as Fn,K as kt}from"./core-qd7Y94Xw.js";import{c as O,U as ce}from"./index-avXZwcSh.js";import{de as Vn}from"./index-Be-J5MBV.js";import{r as Kn,a as Hn}from"./dijkstra-DorMYy3g.js";import{e as Pt,n as At}from"./ref-CQBLv1xX.js";import"./index-TcHCdeM-.js";import"./index.es-B_CTKtwB.js";import"./index-C00EVJjL.js";import"./index-nibyPLVP.js";import"./DynamicHost-CSta88x7.js";import"./assertThisInitialized-DIFuz7Pv.js";import"./index-FY47PVCQ.js";import"./createBaseAccountSDK-CjYJ3GzM.js";import"./clsx.m-CH7BE6MN.js";import"./hooks.module-Bp_x0nsZ.js";var Pe=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let ve=class extends D{constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=H.state.connectors,this.count=N.state.count,this.filteredCount=N.state.filteredWallets.length,this.isFetchingRecommendedWallets=N.state.isFetchingRecommendedWallets,this.unsubscribe.push(H.subscribeKey("connectors",t=>this.connectors=t),N.subscribeKey("count",t=>this.count=t),N.subscribeKey("filteredWallets",t=>this.filteredCount=t.length),N.subscribeKey("isFetchingRecommendedWallets",t=>this.isFetchingRecommendedWallets=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=this.connectors.find(c=>c.id==="walletConnect"),{allWallets:r}=q.state;if(!t||r==="HIDE"||r==="ONLY_MOBILE"&&!L.isMobile())return null;const i=N.state.featured.length,o=this.count+i,n=o<10?o:Math.floor(o/10)*10,s=this.filteredCount>0?this.filteredCount:n;let a=`${s}`;this.filteredCount>0?a=`${this.filteredCount}`:s<o&&(a=`${s}+`);const l=A.hasAnyConnection(Ve.CONNECTOR_ID.WALLET_CONNECT);return u`
      <wui-list-wallet
        name="Search Wallet"
        walletIcon="search"
        showAllWallets
        @click=${this.onAllWallets.bind(this)}
        tagLabel=${a}
        tagVariant="info"
        data-testid="all-wallets"
        tabIdx=${j(this.tabIdx)}
        .loading=${this.isFetchingRecommendedWallets}
        ?disabled=${l}
        size="sm"
      ></wui-list-wallet>
    `}onAllWallets(){F.sendEvent({type:"track",event:"CLICK_ALL_WALLETS"}),P.push("AllWallets",{redirectView:P.state.data?.redirectView})}};Pe([d()],ve.prototype,"tabIdx",void 0);Pe([I()],ve.prototype,"connectors",void 0);Pe([I()],ve.prototype,"count",void 0);Pe([I()],ve.prototype,"filteredCount",void 0);Pe([I()],ve.prototype,"isFetchingRecommendedWallets",void 0);ve=Pe([O("w3m-all-wallets-widget")],ve);const Gn=U`
  :host {
    margin-top: ${({spacing:e})=>e[1]};
  }
  wui-separator {
    margin: ${({spacing:e})=>e[3]} calc(${({spacing:e})=>e[3]} * -1)
      ${({spacing:e})=>e[2]} calc(${({spacing:e})=>e[3]} * -1);
    width: calc(100% + ${({spacing:e})=>e[3]} * 2);
  }
`;var de=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Z=class extends D{constructor(){super(),this.unsubscribe=[],this.connectors=H.state.connectors,this.recommended=N.state.recommended,this.featured=N.state.featured,this.explorerWallets=N.state.explorerWallets,this.connections=A.state.connections,this.connectorImages=zt.state.connectorImages,this.loadingTelegram=!1,this.unsubscribe.push(H.subscribeKey("connectors",t=>this.connectors=t),A.subscribeKey("connections",t=>this.connections=t),zt.subscribeKey("connectorImages",t=>this.connectorImages=t),N.subscribeKey("recommended",t=>this.recommended=t),N.subscribeKey("featured",t=>this.featured=t),N.subscribeKey("explorerFilteredWallets",t=>{this.explorerWallets=t?.length?t:N.state.explorerWallets}),N.subscribeKey("explorerWallets",t=>{this.explorerWallets?.length||(this.explorerWallets=t)})),L.isTelegram()&&L.isIos()&&(this.loadingTelegram=!A.state.wcUri,this.unsubscribe.push(A.subscribeKey("wcUri",t=>this.loadingTelegram=!t)))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return u`
      <wui-flex flexDirection="column" gap="2"> ${this.connectorListTemplate()} </wui-flex>
    `}mapConnectorsToExplorerWallets(t,r){return t.map(i=>{if(i.type==="MULTI_CHAIN"&&i.connectors){const n=i.connectors.map(c=>c.id),s=i.connectors.map(c=>c.name),a=i.connectors.map(c=>c.info?.rdns),l=r?.find(c=>n.includes(c.id)||s.includes(c.name)||c.rdns&&(a.includes(c.rdns)||n.includes(c.rdns)));return i.explorerWallet=l??i.explorerWallet,i}const o=r?.find(n=>n.id===i.id||n.rdns===i.info?.rdns||n.name===i.name);return i.explorerWallet=o??i.explorerWallet,i})}processConnectorsByType(t,r=!0){const i=ye.sortConnectorsByExplorerWallet([...t]);return r?i.filter(ye.showConnector):i}connectorListTemplate(){const t=this.mapConnectorsToExplorerWallets(this.connectors,this.explorerWallets??[]),r=ye.getConnectorsByType(t,this.recommended,this.featured),i=this.processConnectorsByType(r.announced.filter(h=>h.id!=="walletConnect")),o=this.processConnectorsByType(r.injected),n=this.processConnectorsByType(r.multiChain.filter(h=>h.name!=="WalletConnect"),!1),s=r.custom,a=r.recent,l=this.processConnectorsByType(r.external.filter(h=>h.id!==Ve.CONNECTOR_ID.COINBASE_SDK)),c=r.recommended,w=r.featured,E=ye.getConnectorTypeOrder({custom:s,recent:a,announced:i,injected:o,multiChain:n,recommended:c,featured:w,external:l}),C=this.connectors.find(h=>h.id==="walletConnect"),m=L.isMobile(),x=[];for(const h of E)switch(h){case"walletConnect":{!m&&C&&x.push({kind:"connector",subtype:"walletConnect",connector:C});break}case"recent":{ye.getFilteredRecentWallets().forEach(p=>x.push({kind:"wallet",subtype:"recent",wallet:p}));break}case"injected":{n.forEach(b=>x.push({kind:"connector",subtype:"multiChain",connector:b})),i.forEach(b=>x.push({kind:"connector",subtype:"announced",connector:b})),o.forEach(b=>x.push({kind:"connector",subtype:"injected",connector:b}));break}case"featured":{w.forEach(b=>x.push({kind:"wallet",subtype:"featured",wallet:b}));break}case"custom":{ye.getFilteredCustomWallets(s??[]).forEach(p=>x.push({kind:"wallet",subtype:"custom",wallet:p}));break}case"external":{l.forEach(b=>x.push({kind:"connector",subtype:"external",connector:b}));break}case"recommended":{ye.getCappedRecommendedWallets(c).forEach(p=>x.push({kind:"wallet",subtype:"recommended",wallet:p}));break}default:console.warn(`Unknown connector type: ${h}`)}return x.map((h,b)=>h.kind==="connector"?this.renderConnector(h,b):this.renderWallet(h,b))}renderConnector(t,r){const i=t.connector,o=ge.getConnectorImage(i)||this.connectorImages[i?.imageId??""],s=(this.connections.get(i.chain)??[]).some(E=>zn.isLowerCaseMatch(E.connectorId,i.id));let a,l;t.subtype==="multiChain"?(a="multichain",l="info"):t.subtype==="walletConnect"?(a="qr code",l="accent"):t.subtype==="injected"||t.subtype==="announced"?(a=s?"connected":"installed",l=s?"info":"success"):(a=void 0,l=void 0);const c=A.hasAnyConnection(Ve.CONNECTOR_ID.WALLET_CONNECT),w=t.subtype==="walletConnect"||t.subtype==="external"?c:!1;return u`
      <w3m-list-wallet
        displayIndex=${r}
        imageSrc=${j(o)}
        .installed=${!0}
        name=${i.name??"Unknown"}
        .tagVariant=${l}
        tagLabel=${j(a)}
        data-testid=${`wallet-selector-${i.id.toLowerCase()}`}
        size="sm"
        @click=${()=>this.onClickConnector(t)}
        tabIdx=${j(this.tabIdx)}
        ?disabled=${w}
        rdnsId=${j(i.explorerWallet?.rdns||void 0)}
        walletRank=${j(i.explorerWallet?.order)}
      >
      </w3m-list-wallet>
    `}onClickConnector(t){const r=P.state.data?.redirectView;if(t.subtype==="walletConnect"){H.setActiveConnector(t.connector),L.isMobile()?P.push("AllWallets"):P.push("ConnectingWalletConnect",{redirectView:r});return}if(t.subtype==="multiChain"){H.setActiveConnector(t.connector),P.push("ConnectingMultiChain",{redirectView:r});return}if(t.subtype==="injected"){H.setActiveConnector(t.connector),P.push("ConnectingExternal",{connector:t.connector,redirectView:r,wallet:t.connector.explorerWallet});return}if(t.subtype==="announced"){if(t.connector.id==="walletConnect"){L.isMobile()?P.push("AllWallets"):P.push("ConnectingWalletConnect",{redirectView:r});return}P.push("ConnectingExternal",{connector:t.connector,redirectView:r,wallet:t.connector.explorerWallet});return}P.push("ConnectingExternal",{connector:t.connector,redirectView:r})}renderWallet(t,r){const i=t.wallet,o=ge.getWalletImage(i),s=A.hasAnyConnection(Ve.CONNECTOR_ID.WALLET_CONNECT),a=this.loadingTelegram,l=t.subtype==="recent"?"recent":void 0,c=t.subtype==="recent"?"info":void 0;return u`
      <w3m-list-wallet
        displayIndex=${r}
        imageSrc=${j(o)}
        name=${i.name??"Unknown"}
        @click=${()=>this.onClickWallet(t)}
        size="sm"
        data-testid=${`wallet-selector-${i.id}`}
        tabIdx=${j(this.tabIdx)}
        ?loading=${a}
        ?disabled=${s}
        rdnsId=${j(i.rdns||void 0)}
        walletRank=${j(i.order)}
        tagLabel=${j(l)}
        .tagVariant=${c}
      >
      </w3m-list-wallet>
    `}onClickWallet(t){const r=P.state.data?.redirectView;if(t.subtype==="featured"){H.selectWalletConnector(t.wallet);return}if(t.subtype==="recent"){if(this.loadingTelegram)return;H.selectWalletConnector(t.wallet);return}if(t.subtype==="custom"){if(this.loadingTelegram)return;P.push("ConnectingWalletConnect",{wallet:t.wallet,redirectView:r});return}if(this.loadingTelegram)return;const i=H.getConnector({id:t.wallet.id,rdns:t.wallet.rdns});i?P.push("ConnectingExternal",{connector:i,redirectView:r}):P.push("ConnectingWalletConnect",{wallet:t.wallet,redirectView:r})}};Z.styles=Gn;de([d({type:Number})],Z.prototype,"tabIdx",void 0);de([I()],Z.prototype,"connectors",void 0);de([I()],Z.prototype,"recommended",void 0);de([I()],Z.prototype,"featured",void 0);de([I()],Z.prototype,"explorerWallets",void 0);de([I()],Z.prototype,"connections",void 0);de([I()],Z.prototype,"connectorImages",void 0);de([I()],Z.prototype,"loadingTelegram",void 0);Z=de([O("w3m-connector-list")],Z);const Jn=U`
  :host {
    flex: 1;
    height: 100%;
  }

  button {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: ${({spacing:e})=>e[1]} ${({spacing:e})=>e[2]};
    column-gap: ${({spacing:e})=>e[1]};
    color: ${({tokens:e})=>e.theme.textSecondary};
    border-radius: ${({borderRadius:e})=>e[20]};
    background-color: transparent;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  button[data-active='true'] {
    color: ${({tokens:e})=>e.theme.textPrimary};
    background-color: ${({tokens:e})=>e.theme.foregroundTertiary};
  }

  button:hover:enabled:not([data-active='true']),
  button:active:enabled:not([data-active='true']) {
    wui-text,
    wui-icon {
      color: ${({tokens:e})=>e.theme.textPrimary};
    }
  }
`;var De=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};const Qn={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},Yn={lg:"md",md:"sm",sm:"sm"};let $e=class extends D{constructor(){super(...arguments),this.icon="mobile",this.size="md",this.label="",this.active=!1}render(){return u`
      <button data-active=${this.active}>
        ${this.icon?u`<wui-icon size=${Yn[this.size]} name=${this.icon}></wui-icon>`:""}
        <wui-text variant=${Qn[this.size]}> ${this.label} </wui-text>
      </button>
    `}};$e.styles=[Q,me,Jn];De([d()],$e.prototype,"icon",void 0);De([d()],$e.prototype,"size",void 0);De([d()],$e.prototype,"label",void 0);De([d({type:Boolean})],$e.prototype,"active",void 0);$e=De([O("wui-tab-item")],$e);const Xn=U`
  :host {
    display: inline-flex;
    align-items: center;
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[32]};
    padding: ${({spacing:e})=>e["01"]};
    box-sizing: border-box;
  }

  :host([data-size='sm']) {
    height: 26px;
  }

  :host([data-size='md']) {
    height: 36px;
  }
`;var je=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ce=class extends D{constructor(){super(...arguments),this.tabs=[],this.onTabChange=()=>null,this.size="md",this.activeTab=0}render(){return this.dataset.size=this.size,this.tabs.map((t,r)=>{const i=r===this.activeTab;return u`
        <wui-tab-item
          @click=${()=>this.onTabClick(r)}
          icon=${t.icon}
          size=${this.size}
          label=${t.label}
          ?active=${i}
          data-active=${i}
          data-testid="tab-${t.label?.toLowerCase()}"
        ></wui-tab-item>
      `})}onTabClick(t){this.activeTab=t,this.onTabChange(t)}};Ce.styles=[Q,me,Xn];je([d({type:Array})],Ce.prototype,"tabs",void 0);je([d()],Ce.prototype,"onTabChange",void 0);je([d()],Ce.prototype,"size",void 0);je([I()],Ce.prototype,"activeTab",void 0);Ce=je([O("wui-tabs")],Ce);var Lt=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ke=class extends D{constructor(){super(...arguments),this.platformTabs=[],this.unsubscribe=[],this.platforms=[],this.onSelectPlatfrom=void 0}disconnectCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=this.generateTabs();return u`
      <wui-flex justifyContent="center" .padding=${["0","0","4","0"]}>
        <wui-tabs .tabs=${t} .onTabChange=${this.onTabChange.bind(this)}></wui-tabs>
      </wui-flex>
    `}generateTabs(){const t=this.platforms.map(r=>r==="browser"?{label:"Browser",icon:"extension",platform:"browser"}:r==="mobile"?{label:"Mobile",icon:"mobile",platform:"mobile"}:r==="qrcode"?{label:"Mobile",icon:"mobile",platform:"qrcode"}:r==="web"?{label:"Webapp",icon:"browser",platform:"web"}:r==="desktop"?{label:"Desktop",icon:"desktop",platform:"desktop"}:{label:"Browser",icon:"extension",platform:"unsupported"});return this.platformTabs=t.map(({platform:r})=>r),t}onTabChange(t){const r=this.platformTabs[t];r&&this.onSelectPlatfrom?.(r)}};Lt([d({type:Array})],Ke.prototype,"platforms",void 0);Lt([d()],Ke.prototype,"onSelectPlatfrom",void 0);Ke=Lt([O("w3m-connecting-header")],Ke);const Zn=U`
  :host {
    display: block;
    width: 100px;
    height: 100px;
  }

  svg {
    width: 100px;
    height: 100px;
  }

  rect {
    fill: none;
    stroke: ${e=>e.colors.accent100};
    stroke-width: 3px;
    stroke-linecap: round;
    animation: dash 1s linear infinite;
  }

  @keyframes dash {
    to {
      stroke-dashoffset: 0px;
    }
  }
`;var In=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let He=class extends D{constructor(){super(...arguments),this.radius=36}render(){return this.svgLoaderTemplate()}svgLoaderTemplate(){const t=this.radius>50?50:this.radius,i=36-t,o=116+i,n=245+i,s=360+i*1.75;return u`
      <svg viewBox="0 0 110 110" width="110" height="110">
        <rect
          x="2"
          y="2"
          width="106"
          height="106"
          rx=${t}
          stroke-dasharray="${o} ${n}"
          stroke-dashoffset=${s}
        />
      </svg>
    `}};He.styles=[Q,Zn];In([d({type:Number})],He.prototype,"radius",void 0);He=In([O("wui-loading-thumbnail")],He);const ei=U`
  wui-flex {
    width: 100%;
    height: 52px;
    box-sizing: border-box;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[5]};
    padding-left: ${({spacing:e})=>e[3]};
    padding-right: ${({spacing:e})=>e[3]};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${({spacing:e})=>e[6]};
  }

  wui-text {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  wui-icon {
    width: 12px;
    height: 12px;
  }
`;var tt=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let ke=class extends D{constructor(){super(...arguments),this.disabled=!1,this.label="",this.buttonLabel=""}render(){return u`
      <wui-flex justifyContent="space-between" alignItems="center">
        <wui-text variant="lg-regular" color="inherit">${this.label}</wui-text>
        <wui-button variant="accent-secondary" size="sm">
          ${this.buttonLabel}
          <wui-icon name="chevronRight" color="inherit" size="inherit" slot="iconRight"></wui-icon>
        </wui-button>
      </wui-flex>
    `}};ke.styles=[Q,me,ei];tt([d({type:Boolean})],ke.prototype,"disabled",void 0);tt([d()],ke.prototype,"label",void 0);tt([d()],ke.prototype,"buttonLabel",void 0);ke=tt([O("wui-cta-button")],ke);const ti=U`
  :host {
    display: block;
    padding: 0 ${({spacing:e})=>e[5]} ${({spacing:e})=>e[5]};
  }
`;var Wn=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ge=class extends D{constructor(){super(...arguments),this.wallet=void 0}render(){if(!this.wallet)return this.style.display="none",null;const{name:t,app_store:r,play_store:i,chrome_store:o,homepage:n}=this.wallet,s=L.isMobile(),a=L.isIos(),l=L.isAndroid(),c=[r,i,n,o].filter(Boolean).length>1,w=ce.getTruncateString({string:t,charsStart:12,charsEnd:0,truncate:"end"});return c&&!s?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${()=>P.push("Downloads",{wallet:this.wallet})}
        ></wui-cta-button>
      `:!c&&n?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${this.onHomePage.bind(this)}
        ></wui-cta-button>
      `:r&&a?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${this.onAppStore.bind(this)}
        ></wui-cta-button>
      `:i&&l?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${this.onPlayStore.bind(this)}
        ></wui-cta-button>
      `:(this.style.display="none",null)}onAppStore(){this.wallet?.app_store&&L.openHref(this.wallet.app_store,"_blank")}onPlayStore(){this.wallet?.play_store&&L.openHref(this.wallet.play_store,"_blank")}onHomePage(){this.wallet?.homepage&&L.openHref(this.wallet.homepage,"_blank")}};Ge.styles=[ti];Wn([d({type:Object})],Ge.prototype,"wallet",void 0);Ge=Wn([O("w3m-mobile-download-links")],Ge);const ni=U`
  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
    100% {
      transform: translateX(0);
    }
  }

  wui-flex:first-child:not(:only-child) {
    position: relative;
  }

  wui-wallet-image {
    width: 56px;
    height: 56px;
  }

  wui-loading-thumbnail {
    position: absolute;
  }

  wui-icon-box {
    position: absolute;
    right: calc(${({spacing:e})=>e[1]} * -1);
    bottom: calc(${({spacing:e})=>e[1]} * -1);
    opacity: 0;
    transform: scale(0.5);
    transition-property: opacity, transform;
    transition-duration: ${({durations:e})=>e.lg};
    transition-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity, transform;
  }

  wui-text[align='center'] {
    width: 100%;
    padding: 0px ${({spacing:e})=>e[4]};
  }

  [data-error='true'] wui-icon-box {
    opacity: 1;
    transform: scale(1);
  }

  [data-error='true'] > wui-flex:first-child {
    animation: shake 250ms ${({easings:e})=>e["ease-out-power-2"]} both;
  }

  [data-retry='false'] wui-link {
    display: none;
  }

  [data-retry='true'] wui-link {
    display: block;
    opacity: 1;
  }

  w3m-mobile-download-links {
    padding: 0px;
    width: 100%;
  }
`;var ee=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};class z extends D{constructor(){super(),this.wallet=P.state.data?.wallet,this.connector=P.state.data?.connector,this.timeout=void 0,this.secondaryBtnIcon="refresh",this.onConnect=void 0,this.onRender=void 0,this.onAutoConnect=void 0,this.isWalletConnect=!0,this.unsubscribe=[],this.imageSrc=ge.getConnectorImage(this.connector)??ge.getWalletImage(this.wallet),this.name=this.wallet?.name??this.connector?.name??"Wallet",this.isRetrying=!1,this.uri=A.state.wcUri,this.error=A.state.wcError,this.ready=!1,this.showRetry=!1,this.label=void 0,this.secondaryBtnLabel="Try again",this.secondaryLabel="Accept connection request in the wallet",this.isLoading=!1,this.isMobile=!1,this.onRetry=void 0,this.unsubscribe.push(A.subscribeKey("wcUri",t=>{this.uri=t,this.isRetrying&&this.onRetry&&(this.isRetrying=!1,this.onConnect?.())}),A.subscribeKey("wcError",t=>this.error=t)),(L.isTelegram()||L.isSafari())&&L.isIos()&&A.state.wcUri&&this.onConnect?.()}firstUpdated(){this.onAutoConnect?.(),this.showRetry=!this.onAutoConnect}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),A.setWcError(!1),clearTimeout(this.timeout)}render(){this.onRender?.(),this.onShowRetry();const t=this.error?"Connection can be declined if a previous request is still active":this.secondaryLabel;let r="";return this.label?r=this.label:(r=`Continue in ${this.name}`,this.error&&(r="Connection declined")),u`
      <wui-flex
        data-error=${j(this.error)}
        data-retry=${this.showRetry}
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="6"
      >
        <wui-flex gap="2" justifyContent="center" alignItems="center">
          <wui-wallet-image size="lg" imageSrc=${j(this.imageSrc)}></wui-wallet-image>

          ${this.error?null:this.loaderTemplate()}

          <wui-icon-box
            color="error"
            icon="close"
            size="sm"
            border
            borderColor="wui-color-bg-125"
          ></wui-icon-box>
        </wui-flex>

        <wui-flex flexDirection="column" alignItems="center" gap="6"> <wui-flex
          flexDirection="column"
          alignItems="center"
          gap="2"
          .padding=${["2","0","0","0"]}
        >
          <wui-text align="center" variant="lg-medium" color=${this.error?"error":"primary"}>
            ${r}
          </wui-text>
          <wui-text align="center" variant="lg-regular" color="secondary">${t}</wui-text>
        </wui-flex>

        ${this.secondaryBtnLabel?u`
                <wui-button
                  variant="neutral-secondary"
                  size="md"
                  ?disabled=${this.isRetrying||this.isLoading}
                  @click=${this.onTryAgain.bind(this)}
                  data-testid="w3m-connecting-widget-secondary-button"
                >
                  <wui-icon
                    color="inherit"
                    slot="iconLeft"
                    name=${this.secondaryBtnIcon}
                  ></wui-icon>
                  ${this.secondaryBtnLabel}
                </wui-button>
              `:null}
      </wui-flex>

      ${this.isWalletConnect?u`
              <wui-flex .padding=${["0","5","5","5"]} justifyContent="center">
                <wui-link
                  @click=${this.onCopyUri}
                  variant="secondary"
                  icon="copy"
                  data-testid="wui-link-copy"
                >
                  Copy link
                </wui-link>
              </wui-flex>
            `:null}

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links></wui-flex>
      </wui-flex>
    `}onShowRetry(){this.error&&!this.showRetry&&(this.showRetry=!0,this.shadowRoot?.querySelector("wui-button")?.animate([{opacity:0},{opacity:1}],{fill:"forwards",easing:"ease"}))}onTryAgain(){A.setWcError(!1),this.onRetry?(this.isRetrying=!0,this.onRetry?.()):this.onConnect?.()}loaderTemplate(){const t=_t.state.themeVariables["--w3m-border-radius-master"],r=t?parseInt(t.replace("px",""),10):4;return u`<wui-loading-thumbnail radius=${r*9}></wui-loading-thumbnail>`}onCopyUri(){try{this.uri&&(L.copyToClopboard(this.uri),Me.showSuccess("Link copied"))}catch{Me.showError("Failed to copy")}}}z.styles=ni;ee([I()],z.prototype,"isRetrying",void 0);ee([I()],z.prototype,"uri",void 0);ee([I()],z.prototype,"error",void 0);ee([I()],z.prototype,"ready",void 0);ee([I()],z.prototype,"showRetry",void 0);ee([I()],z.prototype,"label",void 0);ee([I()],z.prototype,"secondaryBtnLabel",void 0);ee([I()],z.prototype,"secondaryLabel",void 0);ee([I()],z.prototype,"isLoading",void 0);ee([d({type:Boolean})],z.prototype,"isMobile",void 0);ee([d()],z.prototype,"onRetry",void 0);var ii=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let qt=class extends z{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-browser: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onAutoConnect=this.onConnectProxy.bind(this),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:P.state.view}})}async onConnectProxy(){try{this.error=!1;const{connectors:t}=H.state,r=t.find(i=>i.type==="ANNOUNCED"&&i.info?.rdns===this.wallet?.rdns||i.type==="INJECTED"||i.name===this.wallet?.name);if(r)await A.connectExternal(r,r.chain);else throw new Error("w3m-connecting-wc-browser: No connector found");En.close(),F.sendEvent({type:"track",event:"CONNECT_SUCCESS",properties:{method:"browser",name:this.wallet?.name||"Unknown",view:P.state.view,walletRank:this.wallet?.order}})}catch(t){t instanceof Rn&&t.originalName===Sn.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?F.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:t.message}}):F.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:t?.message??"Unknown"}}),this.error=!0}}};qt=ii([O("w3m-connecting-wc-browser")],qt);var ri=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ft=class extends z{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-desktop: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onRender=this.onRenderProxy.bind(this),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"desktop",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:P.state.view}})}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onConnectProxy(){if(this.wallet?.desktop_link&&this.uri)try{this.error=!1;const{desktop_link:t,name:r}=this.wallet,{redirect:i,href:o}=L.formatNativeUrl(t,this.uri);A.setWcLinking({name:r,href:o}),A.setRecentWallet(this.wallet),L.openHref(i,"_blank")}catch{this.error=!0}}};Ft=ri([O("w3m-connecting-wc-desktop")],Ft);var Ae=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let xe=class extends z{constructor(){if(super(),this.btnLabelTimeout=void 0,this.redirectDeeplink=void 0,this.redirectUniversalLink=void 0,this.target=void 0,this.preferUniversalLinks=q.state.experimental_preferUniversalLinks,this.isLoading=!0,this.onConnect=()=>{if(this.wallet?.mobile_link&&this.uri)try{this.error=!1;const{mobile_link:t,link_mode:r,name:i}=this.wallet,{redirect:o,redirectUniversalLink:n,href:s}=L.formatNativeUrl(t,this.uri,r);this.redirectDeeplink=o,this.redirectUniversalLink=n,this.target=L.isIframe()?"_top":"_self",A.setWcLinking({name:i,href:s}),A.setRecentWallet(this.wallet),this.preferUniversalLinks&&this.redirectUniversalLink?L.openHref(this.redirectUniversalLink,this.target):L.openHref(this.redirectDeeplink,this.target)}catch(t){F.sendEvent({type:"track",event:"CONNECT_PROXY_ERROR",properties:{message:t instanceof Error?t.message:"Error parsing the deeplink",uri:this.uri,mobile_link:this.wallet.mobile_link,name:this.wallet.name}}),this.error=!0}},!this.wallet)throw new Error("w3m-connecting-wc-mobile: No wallet provided");this.secondaryBtnLabel="Open",this.secondaryLabel=Tn.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.onHandleURI(),this.unsubscribe.push(A.subscribeKey("wcUri",()=>{this.onHandleURI()})),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"mobile",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:P.state.view}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.btnLabelTimeout)}onHandleURI(){this.isLoading=!this.uri,!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onTryAgain(){A.setWcError(!1),this.onConnect?.()}};Ae([I()],xe.prototype,"redirectDeeplink",void 0);Ae([I()],xe.prototype,"redirectUniversalLink",void 0);Ae([I()],xe.prototype,"target",void 0);Ae([I()],xe.prototype,"preferUniversalLinks",void 0);Ae([I()],xe.prototype,"isLoading",void 0);xe=Ae([O("w3m-connecting-wc-mobile")],xe);var _e={},at,Vt;function oi(){return Vt||(Vt=1,at=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}),at}var lt={},pe={},Kt;function Se(){if(Kt)return pe;Kt=1;let e;const t=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];return pe.getSymbolSize=function(i){if(!i)throw new Error('"version" cannot be null or undefined');if(i<1||i>40)throw new Error('"version" should be in range from 1 to 40');return i*4+17},pe.getSymbolTotalCodewords=function(i){return t[i]},pe.getBCHDigit=function(r){let i=0;for(;r!==0;)i++,r>>>=1;return i},pe.setToSJISFunction=function(i){if(typeof i!="function")throw new Error('"toSJISFunc" is not a valid function.');e=i},pe.isKanjiModeEnabled=function(){return typeof e<"u"},pe.toSJIS=function(i){return e(i)},pe}var ct={},Ht;function Nt(){return Ht||(Ht=1,(function(e){e.L={bit:1},e.M={bit:0},e.Q={bit:3},e.H={bit:2};function t(r){if(typeof r!="string")throw new Error("Param is not a string");switch(r.toLowerCase()){case"l":case"low":return e.L;case"m":case"medium":return e.M;case"q":case"quartile":return e.Q;case"h":case"high":return e.H;default:throw new Error("Unknown EC Level: "+r)}}e.isValid=function(i){return i&&typeof i.bit<"u"&&i.bit>=0&&i.bit<4},e.from=function(i,o){if(e.isValid(i))return i;try{return t(i)}catch{return o}}})(ct)),ct}var ut,Gt;function si(){if(Gt)return ut;Gt=1;function e(){this.buffer=[],this.length=0}return e.prototype={get:function(t){const r=Math.floor(t/8);return(this.buffer[r]>>>7-t%8&1)===1},put:function(t,r){for(let i=0;i<r;i++)this.putBit((t>>>r-i-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(t){const r=Math.floor(this.length/8);this.buffer.length<=r&&this.buffer.push(0),t&&(this.buffer[r]|=128>>>this.length%8),this.length++}},ut=e,ut}var dt,Jt;function ai(){if(Jt)return dt;Jt=1;function e(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}return e.prototype.set=function(t,r,i,o){const n=t*this.size+r;this.data[n]=i,o&&(this.reservedBit[n]=!0)},e.prototype.get=function(t,r){return this.data[t*this.size+r]},e.prototype.xor=function(t,r,i){this.data[t*this.size+r]^=i},e.prototype.isReserved=function(t,r){return this.reservedBit[t*this.size+r]},dt=e,dt}var ht={},Qt;function li(){return Qt||(Qt=1,(function(e){const t=Se().getSymbolSize;e.getRowColCoords=function(i){if(i===1)return[];const o=Math.floor(i/7)+2,n=t(i),s=n===145?26:Math.ceil((n-13)/(2*o-2))*2,a=[n-7];for(let l=1;l<o-1;l++)a[l]=a[l-1]-s;return a.push(6),a.reverse()},e.getPositions=function(i){const o=[],n=e.getRowColCoords(i),s=n.length;for(let a=0;a<s;a++)for(let l=0;l<s;l++)a===0&&l===0||a===0&&l===s-1||a===s-1&&l===0||o.push([n[a],n[l]]);return o}})(ht)),ht}var ft={},Yt;function ci(){if(Yt)return ft;Yt=1;const e=Se().getSymbolSize,t=7;return ft.getPositions=function(i){const o=e(i);return[[0,0],[o-t,0],[0,o-t]]},ft}var pt={},Xt;function ui(){return Xt||(Xt=1,(function(e){e.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};const t={N1:3,N2:3,N3:40,N4:10};e.isValid=function(o){return o!=null&&o!==""&&!isNaN(o)&&o>=0&&o<=7},e.from=function(o){return e.isValid(o)?parseInt(o,10):void 0},e.getPenaltyN1=function(o){const n=o.size;let s=0,a=0,l=0,c=null,w=null;for(let E=0;E<n;E++){a=l=0,c=w=null;for(let C=0;C<n;C++){let m=o.get(E,C);m===c?a++:(a>=5&&(s+=t.N1+(a-5)),c=m,a=1),m=o.get(C,E),m===w?l++:(l>=5&&(s+=t.N1+(l-5)),w=m,l=1)}a>=5&&(s+=t.N1+(a-5)),l>=5&&(s+=t.N1+(l-5))}return s},e.getPenaltyN2=function(o){const n=o.size;let s=0;for(let a=0;a<n-1;a++)for(let l=0;l<n-1;l++){const c=o.get(a,l)+o.get(a,l+1)+o.get(a+1,l)+o.get(a+1,l+1);(c===4||c===0)&&s++}return s*t.N2},e.getPenaltyN3=function(o){const n=o.size;let s=0,a=0,l=0;for(let c=0;c<n;c++){a=l=0;for(let w=0;w<n;w++)a=a<<1&2047|o.get(c,w),w>=10&&(a===1488||a===93)&&s++,l=l<<1&2047|o.get(w,c),w>=10&&(l===1488||l===93)&&s++}return s*t.N3},e.getPenaltyN4=function(o){let n=0;const s=o.data.length;for(let l=0;l<s;l++)n+=o.data[l];return Math.abs(Math.ceil(n*100/s/5)-10)*t.N4};function r(i,o,n){switch(i){case e.Patterns.PATTERN000:return(o+n)%2===0;case e.Patterns.PATTERN001:return o%2===0;case e.Patterns.PATTERN010:return n%3===0;case e.Patterns.PATTERN011:return(o+n)%3===0;case e.Patterns.PATTERN100:return(Math.floor(o/2)+Math.floor(n/3))%2===0;case e.Patterns.PATTERN101:return o*n%2+o*n%3===0;case e.Patterns.PATTERN110:return(o*n%2+o*n%3)%2===0;case e.Patterns.PATTERN111:return(o*n%3+(o+n)%2)%2===0;default:throw new Error("bad maskPattern:"+i)}}e.applyMask=function(o,n){const s=n.size;for(let a=0;a<s;a++)for(let l=0;l<s;l++)n.isReserved(l,a)||n.xor(l,a,r(o,l,a))},e.getBestMask=function(o,n){const s=Object.keys(e.Patterns).length;let a=0,l=1/0;for(let c=0;c<s;c++){n(c),e.applyMask(c,o);const w=e.getPenaltyN1(o)+e.getPenaltyN2(o)+e.getPenaltyN3(o)+e.getPenaltyN4(o);e.applyMask(c,o),w<l&&(l=w,a=c)}return a}})(pt)),pt}var Fe={},Zt;function _n(){if(Zt)return Fe;Zt=1;const e=Nt(),t=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],r=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];return Fe.getBlocksCount=function(o,n){switch(n){case e.L:return t[(o-1)*4+0];case e.M:return t[(o-1)*4+1];case e.Q:return t[(o-1)*4+2];case e.H:return t[(o-1)*4+3];default:return}},Fe.getTotalCodewordsCount=function(o,n){switch(n){case e.L:return r[(o-1)*4+0];case e.M:return r[(o-1)*4+1];case e.Q:return r[(o-1)*4+2];case e.H:return r[(o-1)*4+3];default:return}},Fe}var gt={},Ne={},en;function di(){if(en)return Ne;en=1;const e=new Uint8Array(512),t=new Uint8Array(256);return(function(){let i=1;for(let o=0;o<255;o++)e[o]=i,t[i]=o,i<<=1,i&256&&(i^=285);for(let o=255;o<512;o++)e[o]=e[o-255]})(),Ne.log=function(i){if(i<1)throw new Error("log("+i+")");return t[i]},Ne.exp=function(i){return e[i]},Ne.mul=function(i,o){return i===0||o===0?0:e[t[i]+t[o]]},Ne}var tn;function hi(){return tn||(tn=1,(function(e){const t=di();e.mul=function(i,o){const n=new Uint8Array(i.length+o.length-1);for(let s=0;s<i.length;s++)for(let a=0;a<o.length;a++)n[s+a]^=t.mul(i[s],o[a]);return n},e.mod=function(i,o){let n=new Uint8Array(i);for(;n.length-o.length>=0;){const s=n[0];for(let l=0;l<o.length;l++)n[l]^=t.mul(o[l],s);let a=0;for(;a<n.length&&n[a]===0;)a++;n=n.slice(a)}return n},e.generateECPolynomial=function(i){let o=new Uint8Array([1]);for(let n=0;n<i;n++)o=e.mul(o,new Uint8Array([1,t.exp(n)]));return o}})(gt)),gt}var mt,nn;function fi(){if(nn)return mt;nn=1;const e=hi();function t(r){this.genPoly=void 0,this.degree=r,this.degree&&this.initialize(this.degree)}return t.prototype.initialize=function(i){this.degree=i,this.genPoly=e.generateECPolynomial(this.degree)},t.prototype.encode=function(i){if(!this.genPoly)throw new Error("Encoder not initialized");const o=new Uint8Array(i.length+this.degree);o.set(i);const n=e.mod(o,this.genPoly),s=this.degree-n.length;if(s>0){const a=new Uint8Array(this.degree);return a.set(n,s),a}return n},mt=t,mt}var wt={},bt={},yt={},rn;function kn(){return rn||(rn=1,yt.isValid=function(t){return!isNaN(t)&&t>=1&&t<=40}),yt}var te={},on;function Bn(){if(on)return te;on=1;const e="[0-9]+",t="[A-Z $%*+\\-./:]+";let r="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";r=r.replace(/u/g,"\\u");const i="(?:(?![A-Z0-9 $%*+\\-./:]|"+r+`)(?:.|[\r
]))+`;te.KANJI=new RegExp(r,"g"),te.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g"),te.BYTE=new RegExp(i,"g"),te.NUMERIC=new RegExp(e,"g"),te.ALPHANUMERIC=new RegExp(t,"g");const o=new RegExp("^"+r+"$"),n=new RegExp("^"+e+"$"),s=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");return te.testKanji=function(l){return o.test(l)},te.testNumeric=function(l){return n.test(l)},te.testAlphanumeric=function(l){return s.test(l)},te}var sn;function Te(){return sn||(sn=1,(function(e){const t=kn(),r=Bn();e.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},e.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},e.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},e.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},e.MIXED={bit:-1},e.getCharCountIndicator=function(n,s){if(!n.ccBits)throw new Error("Invalid mode: "+n);if(!t.isValid(s))throw new Error("Invalid version: "+s);return s>=1&&s<10?n.ccBits[0]:s<27?n.ccBits[1]:n.ccBits[2]},e.getBestModeForData=function(n){return r.testNumeric(n)?e.NUMERIC:r.testAlphanumeric(n)?e.ALPHANUMERIC:r.testKanji(n)?e.KANJI:e.BYTE},e.toString=function(n){if(n&&n.id)return n.id;throw new Error("Invalid mode")},e.isValid=function(n){return n&&n.bit&&n.ccBits};function i(o){if(typeof o!="string")throw new Error("Param is not a string");switch(o.toLowerCase()){case"numeric":return e.NUMERIC;case"alphanumeric":return e.ALPHANUMERIC;case"kanji":return e.KANJI;case"byte":return e.BYTE;default:throw new Error("Unknown mode: "+o)}}e.from=function(n,s){if(e.isValid(n))return n;try{return i(n)}catch{return s}}})(bt)),bt}var an;function pi(){return an||(an=1,(function(e){const t=Se(),r=_n(),i=Nt(),o=Te(),n=kn(),s=7973,a=t.getBCHDigit(s);function l(C,m,x){for(let h=1;h<=40;h++)if(m<=e.getCapacity(h,x,C))return h}function c(C,m){return o.getCharCountIndicator(C,m)+4}function w(C,m){let x=0;return C.forEach(function(h){const b=c(h.mode,m);x+=b+h.getBitsLength()}),x}function E(C,m){for(let x=1;x<=40;x++)if(w(C,x)<=e.getCapacity(x,m,o.MIXED))return x}e.from=function(m,x){return n.isValid(m)?parseInt(m,10):x},e.getCapacity=function(m,x,h){if(!n.isValid(m))throw new Error("Invalid QR Code version");typeof h>"u"&&(h=o.BYTE);const b=t.getSymbolTotalCodewords(m),p=r.getTotalCodewordsCount(m,x),g=(b-p)*8;if(h===o.MIXED)return g;const y=g-c(h,m);switch(h){case o.NUMERIC:return Math.floor(y/10*3);case o.ALPHANUMERIC:return Math.floor(y/11*2);case o.KANJI:return Math.floor(y/13);case o.BYTE:default:return Math.floor(y/8)}},e.getBestVersionForData=function(m,x){let h;const b=i.from(x,i.M);if(Array.isArray(m)){if(m.length>1)return E(m,b);if(m.length===0)return 1;h=m[0]}else h=m;return l(h.mode,h.getLength(),b)},e.getEncodedBits=function(m){if(!n.isValid(m)||m<7)throw new Error("Invalid QR Code version");let x=m<<12;for(;t.getBCHDigit(x)-a>=0;)x^=s<<t.getBCHDigit(x)-a;return m<<12|x}})(wt)),wt}var vt={},ln;function gi(){if(ln)return vt;ln=1;const e=Se(),t=1335,r=21522,i=e.getBCHDigit(t);return vt.getEncodedBits=function(n,s){const a=n.bit<<3|s;let l=a<<10;for(;e.getBCHDigit(l)-i>=0;)l^=t<<e.getBCHDigit(l)-i;return(a<<10|l)^r},vt}var $t={},Ct,cn;function mi(){if(cn)return Ct;cn=1;const e=Te();function t(r){this.mode=e.NUMERIC,this.data=r.toString()}return t.getBitsLength=function(i){return 10*Math.floor(i/3)+(i%3?i%3*3+1:0)},t.prototype.getLength=function(){return this.data.length},t.prototype.getBitsLength=function(){return t.getBitsLength(this.data.length)},t.prototype.write=function(i){let o,n,s;for(o=0;o+3<=this.data.length;o+=3)n=this.data.substr(o,3),s=parseInt(n,10),i.put(s,10);const a=this.data.length-o;a>0&&(n=this.data.substr(o),s=parseInt(n,10),i.put(s,a*3+1))},Ct=t,Ct}var xt,un;function wi(){if(un)return xt;un=1;const e=Te(),t=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function r(i){this.mode=e.ALPHANUMERIC,this.data=i}return r.getBitsLength=function(o){return 11*Math.floor(o/2)+6*(o%2)},r.prototype.getLength=function(){return this.data.length},r.prototype.getBitsLength=function(){return r.getBitsLength(this.data.length)},r.prototype.write=function(o){let n;for(n=0;n+2<=this.data.length;n+=2){let s=t.indexOf(this.data[n])*45;s+=t.indexOf(this.data[n+1]),o.put(s,11)}this.data.length%2&&o.put(t.indexOf(this.data[n]),6)},xt=r,xt}var Et,dn;function bi(){if(dn)return Et;dn=1;const e=Kn(),t=Te();function r(i){this.mode=t.BYTE,typeof i=="string"&&(i=e(i)),this.data=new Uint8Array(i)}return r.getBitsLength=function(o){return o*8},r.prototype.getLength=function(){return this.data.length},r.prototype.getBitsLength=function(){return r.getBitsLength(this.data.length)},r.prototype.write=function(i){for(let o=0,n=this.data.length;o<n;o++)i.put(this.data[o],8)},Et=r,Et}var Rt,hn;function yi(){if(hn)return Rt;hn=1;const e=Te(),t=Se();function r(i){this.mode=e.KANJI,this.data=i}return r.getBitsLength=function(o){return o*13},r.prototype.getLength=function(){return this.data.length},r.prototype.getBitsLength=function(){return r.getBitsLength(this.data.length)},r.prototype.write=function(i){let o;for(o=0;o<this.data.length;o++){let n=t.toSJIS(this.data[o]);if(n>=33088&&n<=40956)n-=33088;else if(n>=57408&&n<=60351)n-=49472;else throw new Error("Invalid SJIS character: "+this.data[o]+`
Make sure your charset is UTF-8`);n=(n>>>8&255)*192+(n&255),i.put(n,13)}},Rt=r,Rt}var fn;function vi(){return fn||(fn=1,(function(e){const t=Te(),r=mi(),i=wi(),o=bi(),n=yi(),s=Bn(),a=Se(),l=Hn();function c(p){return unescape(encodeURIComponent(p)).length}function w(p,g,y){const f=[];let M;for(;(M=p.exec(y))!==null;)f.push({data:M[0],index:M.index,mode:g,length:M[0].length});return f}function E(p){const g=w(s.NUMERIC,t.NUMERIC,p),y=w(s.ALPHANUMERIC,t.ALPHANUMERIC,p);let f,M;return a.isKanjiModeEnabled()?(f=w(s.BYTE,t.BYTE,p),M=w(s.KANJI,t.KANJI,p)):(f=w(s.BYTE_KANJI,t.BYTE,p),M=[]),g.concat(y,f,M).sort(function(W,T){return W.index-T.index}).map(function(W){return{data:W.data,mode:W.mode,length:W.length}})}function C(p,g){switch(g){case t.NUMERIC:return r.getBitsLength(p);case t.ALPHANUMERIC:return i.getBitsLength(p);case t.KANJI:return n.getBitsLength(p);case t.BYTE:return o.getBitsLength(p)}}function m(p){return p.reduce(function(g,y){const f=g.length-1>=0?g[g.length-1]:null;return f&&f.mode===y.mode?(g[g.length-1].data+=y.data,g):(g.push(y),g)},[])}function x(p){const g=[];for(let y=0;y<p.length;y++){const f=p[y];switch(f.mode){case t.NUMERIC:g.push([f,{data:f.data,mode:t.ALPHANUMERIC,length:f.length},{data:f.data,mode:t.BYTE,length:f.length}]);break;case t.ALPHANUMERIC:g.push([f,{data:f.data,mode:t.BYTE,length:f.length}]);break;case t.KANJI:g.push([f,{data:f.data,mode:t.BYTE,length:c(f.data)}]);break;case t.BYTE:g.push([{data:f.data,mode:t.BYTE,length:c(f.data)}])}}return g}function h(p,g){const y={},f={start:{}};let M=["start"];for(let $=0;$<p.length;$++){const W=p[$],T=[];for(let v=0;v<W.length;v++){const k=W[v],R=""+$+v;T.push(R),y[R]={node:k,lastCount:0},f[R]={};for(let _=0;_<M.length;_++){const S=M[_];y[S]&&y[S].node.mode===k.mode?(f[S][R]=C(y[S].lastCount+k.length,k.mode)-C(y[S].lastCount,k.mode),y[S].lastCount+=k.length):(y[S]&&(y[S].lastCount=k.length),f[S][R]=C(k.length,k.mode)+4+t.getCharCountIndicator(k.mode,g))}}M=T}for(let $=0;$<M.length;$++)f[M[$]].end=0;return{map:f,table:y}}function b(p,g){let y;const f=t.getBestModeForData(p);if(y=t.from(g,f),y!==t.BYTE&&y.bit<f.bit)throw new Error('"'+p+'" cannot be encoded with mode '+t.toString(y)+`.
 Suggested mode is: `+t.toString(f));switch(y===t.KANJI&&!a.isKanjiModeEnabled()&&(y=t.BYTE),y){case t.NUMERIC:return new r(p);case t.ALPHANUMERIC:return new i(p);case t.KANJI:return new n(p);case t.BYTE:return new o(p)}}e.fromArray=function(g){return g.reduce(function(y,f){return typeof f=="string"?y.push(b(f,null)):f.data&&y.push(b(f.data,f.mode)),y},[])},e.fromString=function(g,y){const f=E(g,a.isKanjiModeEnabled()),M=x(f),$=h(M,y),W=l.find_path($.map,"start","end"),T=[];for(let v=1;v<W.length-1;v++)T.push($.table[W[v]].node);return e.fromArray(m(T))},e.rawSplit=function(g){return e.fromArray(E(g,a.isKanjiModeEnabled()))}})($t)),$t}var pn;function $i(){if(pn)return lt;pn=1;const e=Se(),t=Nt(),r=si(),i=ai(),o=li(),n=ci(),s=ui(),a=_n(),l=fi(),c=pi(),w=gi(),E=Te(),C=vi();function m($,W){const T=$.size,v=n.getPositions(W);for(let k=0;k<v.length;k++){const R=v[k][0],_=v[k][1];for(let S=-1;S<=7;S++)if(!(R+S<=-1||T<=R+S))for(let B=-1;B<=7;B++)_+B<=-1||T<=_+B||(S>=0&&S<=6&&(B===0||B===6)||B>=0&&B<=6&&(S===0||S===6)||S>=2&&S<=4&&B>=2&&B<=4?$.set(R+S,_+B,!0,!0):$.set(R+S,_+B,!1,!0))}}function x($){const W=$.size;for(let T=8;T<W-8;T++){const v=T%2===0;$.set(T,6,v,!0),$.set(6,T,v,!0)}}function h($,W){const T=o.getPositions(W);for(let v=0;v<T.length;v++){const k=T[v][0],R=T[v][1];for(let _=-2;_<=2;_++)for(let S=-2;S<=2;S++)_===-2||_===2||S===-2||S===2||_===0&&S===0?$.set(k+_,R+S,!0,!0):$.set(k+_,R+S,!1,!0)}}function b($,W){const T=$.size,v=c.getEncodedBits(W);let k,R,_;for(let S=0;S<18;S++)k=Math.floor(S/3),R=S%3+T-8-3,_=(v>>S&1)===1,$.set(k,R,_,!0),$.set(R,k,_,!0)}function p($,W,T){const v=$.size,k=w.getEncodedBits(W,T);let R,_;for(R=0;R<15;R++)_=(k>>R&1)===1,R<6?$.set(R,8,_,!0):R<8?$.set(R+1,8,_,!0):$.set(v-15+R,8,_,!0),R<8?$.set(8,v-R-1,_,!0):R<9?$.set(8,15-R-1+1,_,!0):$.set(8,15-R-1,_,!0);$.set(v-8,8,1,!0)}function g($,W){const T=$.size;let v=-1,k=T-1,R=7,_=0;for(let S=T-1;S>0;S-=2)for(S===6&&S--;;){for(let B=0;B<2;B++)if(!$.isReserved(k,S-B)){let he=!1;_<W.length&&(he=(W[_]>>>R&1)===1),$.set(k,S-B,he),R--,R===-1&&(_++,R=7)}if(k+=v,k<0||T<=k){k-=v,v=-v;break}}}function y($,W,T){const v=new r;T.forEach(function(B){v.put(B.mode.bit,4),v.put(B.getLength(),E.getCharCountIndicator(B.mode,$)),B.write(v)});const k=e.getSymbolTotalCodewords($),R=a.getTotalCodewordsCount($,W),_=(k-R)*8;for(v.getLengthInBits()+4<=_&&v.put(0,4);v.getLengthInBits()%8!==0;)v.putBit(0);const S=(_-v.getLengthInBits())/8;for(let B=0;B<S;B++)v.put(B%2?17:236,8);return f(v,$,W)}function f($,W,T){const v=e.getSymbolTotalCodewords(W),k=a.getTotalCodewordsCount(W,T),R=v-k,_=a.getBlocksCount(W,T),S=v%_,B=_-S,he=Math.floor(v/_),Le=Math.floor(R/_),Dn=Le+1,Dt=he-Le,jn=new l(Dt);let it=0;const qe=new Array(_),jt=new Array(_);let rt=0;const Un=new Uint8Array($.buffer);for(let We=0;We<_;We++){const st=We<B?Le:Dn;qe[We]=Un.slice(it,it+st),jt[We]=jn.encode(qe[We]),it+=st,rt=Math.max(rt,st)}const ot=new Uint8Array(v);let Ut=0,se,ae;for(se=0;se<rt;se++)for(ae=0;ae<_;ae++)se<qe[ae].length&&(ot[Ut++]=qe[ae][se]);for(se=0;se<Dt;se++)for(ae=0;ae<_;ae++)ot[Ut++]=jt[ae][se];return ot}function M($,W,T,v){let k;if(Array.isArray($))k=C.fromArray($);else if(typeof $=="string"){let he=W;if(!he){const Le=C.rawSplit($);he=c.getBestVersionForData(Le,T)}k=C.fromString($,he||40)}else throw new Error("Invalid data");const R=c.getBestVersionForData(k,T);if(!R)throw new Error("The amount of data is too big to be stored in a QR Code");if(!W)W=R;else if(W<R)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+R+`.
`);const _=y(W,T,k),S=e.getSymbolSize(W),B=new i(S);return m(B,W),x(B),h(B,W),p(B,T,0),W>=7&&b(B,W),g(B,_),isNaN(v)&&(v=s.getBestMask(B,p.bind(null,B,T))),s.applyMask(v,B),p(B,T,v),{modules:B,version:W,errorCorrectionLevel:T,maskPattern:v,segments:k}}return lt.create=function(W,T){if(typeof W>"u"||W==="")throw new Error("No input text");let v=t.M,k,R;return typeof T<"u"&&(v=t.from(T.errorCorrectionLevel,t.M),k=c.from(T.version),R=s.from(T.maskPattern),T.toSJISFunc&&e.setToSJISFunction(T.toSJISFunc)),M(W,k,v,R)},lt}var St={},Tt={},gn;function Pn(){return gn||(gn=1,(function(e){function t(r){if(typeof r=="number"&&(r=r.toString()),typeof r!="string")throw new Error("Color should be defined as hex string");let i=r.slice().replace("#","").split("");if(i.length<3||i.length===5||i.length>8)throw new Error("Invalid hex color: "+r);(i.length===3||i.length===4)&&(i=Array.prototype.concat.apply([],i.map(function(n){return[n,n]}))),i.length===6&&i.push("F","F");const o=parseInt(i.join(""),16);return{r:o>>24&255,g:o>>16&255,b:o>>8&255,a:o&255,hex:"#"+i.slice(0,6).join("")}}e.getOptions=function(i){i||(i={}),i.color||(i.color={});const o=typeof i.margin>"u"||i.margin===null||i.margin<0?4:i.margin,n=i.width&&i.width>=21?i.width:void 0,s=i.scale||4;return{width:n,scale:n?4:s,margin:o,color:{dark:t(i.color.dark||"#000000ff"),light:t(i.color.light||"#ffffffff")},type:i.type,rendererOpts:i.rendererOpts||{}}},e.getScale=function(i,o){return o.width&&o.width>=i+o.margin*2?o.width/(i+o.margin*2):o.scale},e.getImageWidth=function(i,o){const n=e.getScale(i,o);return Math.floor((i+o.margin*2)*n)},e.qrToImageData=function(i,o,n){const s=o.modules.size,a=o.modules.data,l=e.getScale(s,n),c=Math.floor((s+n.margin*2)*l),w=n.margin*l,E=[n.color.light,n.color.dark];for(let C=0;C<c;C++)for(let m=0;m<c;m++){let x=(C*c+m)*4,h=n.color.light;if(C>=w&&m>=w&&C<c-w&&m<c-w){const b=Math.floor((C-w)/l),p=Math.floor((m-w)/l);h=E[a[b*s+p]?1:0]}i[x++]=h.r,i[x++]=h.g,i[x++]=h.b,i[x]=h.a}}})(Tt)),Tt}var mn;function Ci(){return mn||(mn=1,(function(e){const t=Pn();function r(o,n,s){o.clearRect(0,0,n.width,n.height),n.style||(n.style={}),n.height=s,n.width=s,n.style.height=s+"px",n.style.width=s+"px"}function i(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}e.render=function(n,s,a){let l=a,c=s;typeof l>"u"&&(!s||!s.getContext)&&(l=s,s=void 0),s||(c=i()),l=t.getOptions(l);const w=t.getImageWidth(n.modules.size,l),E=c.getContext("2d"),C=E.createImageData(w,w);return t.qrToImageData(C.data,n,l),r(E,c,w),E.putImageData(C,0,0),c},e.renderToDataURL=function(n,s,a){let l=a;typeof l>"u"&&(!s||!s.getContext)&&(l=s,s=void 0),l||(l={});const c=e.render(n,s,l),w=l.type||"image/png",E=l.rendererOpts||{};return c.toDataURL(w,E.quality)}})(St)),St}var It={},wn;function xi(){if(wn)return It;wn=1;const e=Pn();function t(o,n){const s=o.a/255,a=n+'="'+o.hex+'"';return s<1?a+" "+n+'-opacity="'+s.toFixed(2).slice(1)+'"':a}function r(o,n,s){let a=o+n;return typeof s<"u"&&(a+=" "+s),a}function i(o,n,s){let a="",l=0,c=!1,w=0;for(let E=0;E<o.length;E++){const C=Math.floor(E%n),m=Math.floor(E/n);!C&&!c&&(c=!0),o[E]?(w++,E>0&&C>0&&o[E-1]||(a+=c?r("M",C+s,.5+m+s):r("m",l,0),l=0,c=!1),C+1<n&&o[E+1]||(a+=r("h",w),w=0)):l++}return a}return It.render=function(n,s,a){const l=e.getOptions(s),c=n.modules.size,w=n.modules.data,E=c+l.margin*2,C=l.color.light.a?"<path "+t(l.color.light,"fill")+' d="M0 0h'+E+"v"+E+'H0z"/>':"",m="<path "+t(l.color.dark,"stroke")+' d="'+i(w,c,l.margin)+'"/>',x='viewBox="0 0 '+E+" "+E+'"',b='<svg xmlns="http://www.w3.org/2000/svg" '+(l.width?'width="'+l.width+'" height="'+l.width+'" ':"")+x+' shape-rendering="crispEdges">'+C+m+`</svg>
`;return typeof a=="function"&&a(null,b),b},It}var bn;function Ei(){if(bn)return _e;bn=1;const e=oi(),t=$i(),r=Ci(),i=xi();function o(n,s,a,l,c){const w=[].slice.call(arguments,1),E=w.length,C=typeof w[E-1]=="function";if(!C&&!e())throw new Error("Callback required as last argument");if(C){if(E<2)throw new Error("Too few arguments provided");E===2?(c=a,a=s,s=l=void 0):E===3&&(s.getContext&&typeof c>"u"?(c=l,l=void 0):(c=l,l=a,a=s,s=void 0))}else{if(E<1)throw new Error("Too few arguments provided");return E===1?(a=s,s=l=void 0):E===2&&!s.getContext&&(l=a,a=s,s=void 0),new Promise(function(m,x){try{const h=t.create(a,l);m(n(h,s,l))}catch(h){x(h)}})}try{const m=t.create(a,l);c(null,n(m,s,l))}catch(m){c(m)}}return _e.create=t.create,_e.toCanvas=o.bind(null,r.render),_e.toDataURL=o.bind(null,r.renderToDataURL),_e.toString=o.bind(null,function(n,s,a){return i.render(n,a)}),_e}var Ri=Ei();const Si=Vn(Ri),Ti=.1,yn=2.5,le=7;function Wt(e,t,r){return e===t?!1:(e-t<0?t-e:e-t)<=r+Ti}function Ii(e,t){const r=Array.prototype.slice.call(Si.create(e,{errorCorrectionLevel:t}).modules.data,0),i=Math.sqrt(r.length);return r.reduce((o,n,s)=>(s%i===0?o.push([n]):o[o.length-1].push(n))&&o,[])}const Wi={generate({uri:e,size:t,logoSize:r,padding:i=8,dotColor:o="var(--apkt-colors-black)"}){const s=[],a=Ii(e,"Q"),l=(t-2*i)/a.length,c=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];c.forEach(({x:h,y:b})=>{const p=(a.length-le)*l*h+i,g=(a.length-le)*l*b+i,y=.45;for(let f=0;f<c.length;f+=1){const M=l*(le-f*2);s.push(Oe`
            <rect
              fill=${f===2?"var(--apkt-colors-black)":"var(--apkt-colors-white)"}
              width=${f===0?M-10:M}
              rx= ${f===0?(M-10)*y:M*y}
              ry= ${f===0?(M-10)*y:M*y}
              stroke=${o}
              stroke-width=${f===0?10:0}
              height=${f===0?M-10:M}
              x= ${f===0?g+l*f+10/2:g+l*f}
              y= ${f===0?p+l*f+10/2:p+l*f}
            />
          `)}});const w=Math.floor((r+25)/l),E=a.length/2-w/2,C=a.length/2+w/2-1,m=[];a.forEach((h,b)=>{h.forEach((p,g)=>{if(a[b][g]&&!(b<le&&g<le||b>a.length-(le+1)&&g<le||b<le&&g>a.length-(le+1))&&!(b>E&&b<C&&g>E&&g<C)){const y=b*l+l/2+i,f=g*l+l/2+i;m.push([y,f])}})});const x={};return m.forEach(([h,b])=>{x[h]?x[h]?.push(b):x[h]=[b]}),Object.entries(x).map(([h,b])=>{const p=b.filter(g=>b.every(y=>!Wt(g,y,l)));return[Number(h),p]}).forEach(([h,b])=>{b.forEach(p=>{s.push(Oe`<circle cx=${h} cy=${p} fill=${o} r=${l/yn} />`)})}),Object.entries(x).filter(([h,b])=>b.length>1).map(([h,b])=>{const p=b.filter(g=>b.some(y=>Wt(g,y,l)));return[Number(h),p]}).map(([h,b])=>{b.sort((g,y)=>g<y?-1:1);const p=[];for(const g of b){const y=p.find(f=>f.some(M=>Wt(g,M,l)));y?y.push(g):p.push([g])}return[h,p.map(g=>[g[0],g[g.length-1]])]}).forEach(([h,b])=>{b.forEach(([p,g])=>{s.push(Oe`
              <line
                x1=${h}
                x2=${h}
                y1=${p}
                y2=${g}
                stroke=${o}
                stroke-width=${l/(yn/2)}
                stroke-linecap="round"
              />
            `)})}),s}},_i=U`
  :host {
    position: relative;
    user-select: none;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    width: 100%;
    height: 100%;
    background-color: ${({colors:e})=>e.white};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
  }

  :host {
    border-radius: ${({borderRadius:e})=>e[4]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :host([data-clear='true']) > wui-icon {
    display: none;
  }

  svg:first-child,
  wui-image,
  wui-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    box-shadow: inset 0 0 0 4px ${({tokens:e})=>e.theme.backgroundPrimary};
    border-radius: ${({borderRadius:e})=>e[6]};
  }

  wui-image {
    width: 25%;
    height: 25%;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  wui-icon {
    width: 100%;
    height: 100%;
    color: #3396ff !important;
    transform: translateY(-50%) translateX(-50%) scale(0.25);
  }

  wui-icon > svg {
    width: inherit;
    height: inherit;
  }
`;var we=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let ne=class extends D{constructor(){super(...arguments),this.uri="",this.size=500,this.theme="dark",this.imageSrc=void 0,this.alt=void 0,this.arenaClear=void 0,this.farcaster=void 0}render(){return this.dataset.theme=this.theme,this.dataset.clear=String(this.arenaClear),u`<wui-flex
      alignItems="center"
      justifyContent="center"
      class="wui-qr-code"
      direction="column"
      gap="4"
      width="100%"
      style="height: 100%"
    >
      ${this.templateVisual()} ${this.templateSvg()}
    </wui-flex>`}templateSvg(){return Oe`
      <svg viewBox="0 0 ${this.size} ${this.size}" width="100%" height="100%">
        ${Wi.generate({uri:this.uri,size:this.size,logoSize:this.arenaClear?0:this.size/4})}
      </svg>
    `}templateVisual(){return this.imageSrc?u`<wui-image src=${this.imageSrc} alt=${this.alt??"logo"}></wui-image>`:this.farcaster?u`<wui-icon
        class="farcaster"
        size="inherit"
        color="inherit"
        name="farcaster"
      ></wui-icon>`:u`<wui-icon size="inherit" color="inherit" name="walletConnect"></wui-icon>`}};ne.styles=[Q,_i];we([d()],ne.prototype,"uri",void 0);we([d({type:Number})],ne.prototype,"size",void 0);we([d()],ne.prototype,"theme",void 0);we([d()],ne.prototype,"imageSrc",void 0);we([d()],ne.prototype,"alt",void 0);we([d({type:Boolean})],ne.prototype,"arenaClear",void 0);we([d({type:Boolean})],ne.prototype,"farcaster",void 0);ne=we([O("wui-qr-code")],ne);const ki=U`
  :host {
    display: block;
    background: linear-gradient(
      90deg,
      ${({tokens:e})=>e.theme.foregroundSecondary} 0%,
      ${({tokens:e})=>e.theme.foregroundTertiary} 50%,
      ${({tokens:e})=>e.theme.foregroundSecondary} 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1s ease-in-out infinite;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  :host([data-rounded='true']) {
    border-radius: ${({borderRadius:e})=>e[16]};
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;var Ue=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ee=class extends D{constructor(){super(...arguments),this.width="",this.height="",this.variant="default",this.rounded=!1}render(){return this.style.cssText=`
      width: ${this.width};
      height: ${this.height};
    `,this.dataset.rounded=this.rounded?"true":"false",u`<slot></slot>`}};Ee.styles=[ki];Ue([d()],Ee.prototype,"width",void 0);Ue([d()],Ee.prototype,"height",void 0);Ue([d()],Ee.prototype,"variant",void 0);Ue([d({type:Boolean})],Ee.prototype,"rounded",void 0);Ee=Ue([O("wui-shimmer")],Ee);const Bi=U`
  wui-shimmer {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  wui-qr-code {
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var An=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Je=class extends z{constructor(){super(),this.basic=!1}firstUpdated(){this.basic||F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet?.name??"WalletConnect",platform:"qrcode",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:P.state.view}})}disconnectedCallback(){super.disconnectedCallback(),this.unsubscribe?.forEach(t=>t())}render(){return this.onRenderProxy(),u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["0","5","5","5"]}
        gap="5"
      >
        <wui-shimmer width="100%"> ${this.qrCodeTemplate()} </wui-shimmer>
        <wui-text variant="lg-medium" color="primary"> Scan this QR Code with your phone </wui-text>
        ${this.copyTemplate()}
      </wui-flex>
      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0)}qrCodeTemplate(){if(!this.uri||!this.ready)return null;const t=this.wallet?this.wallet.name:void 0;return A.setWcLinking(void 0),A.setRecentWallet(this.wallet),u` <wui-qr-code
      theme=${_t.state.themeMode}
      uri=${this.uri}
      imageSrc=${j(ge.getWalletImage(this.wallet))}
      color=${j(_t.state.themeVariables["--w3m-qr-color"])}
      alt=${j(t)}
      data-testid="wui-qr-code"
    ></wui-qr-code>`}copyTemplate(){const t=!this.uri||!this.ready;return u`<wui-button
      .disabled=${t}
      @click=${this.onCopyUri}
      variant="neutral-secondary"
      size="sm"
      data-testid="copy-wc2-uri"
    >
      Copy link
      <wui-icon size="sm" color="inherit" name="copy" slot="iconRight"></wui-icon>
    </wui-button>`}};Je.styles=Bi;An([d({type:Boolean})],Je.prototype,"basic",void 0);Je=An([O("w3m-connecting-wc-qrcode")],Je);var Pi=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let vn=class extends D{constructor(){if(super(),this.wallet=P.state.data?.wallet,!this.wallet)throw new Error("w3m-connecting-wc-unsupported: No wallet provided");F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:P.state.view}})}render(){return u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="5"
      >
        <wui-wallet-image
          size="lg"
          imageSrc=${j(ge.getWalletImage(this.wallet))}
        ></wui-wallet-image>

        <wui-text variant="md-regular" color="primary">Not Detected</wui-text>
      </wui-flex>

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}};vn=Pi([O("w3m-connecting-wc-unsupported")],vn);var Ln=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Bt=class extends z{constructor(){if(super(),this.isLoading=!0,!this.wallet)throw new Error("w3m-connecting-wc-web: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.secondaryBtnLabel="Open",this.secondaryLabel=Tn.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.updateLoadingState(),this.unsubscribe.push(A.subscribeKey("wcUri",()=>{this.updateLoadingState()})),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"web",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:P.state.view}})}updateLoadingState(){this.isLoading=!this.uri}onConnectProxy(){if(this.wallet?.webapp_link&&this.uri)try{this.error=!1;const{webapp_link:t,name:r}=this.wallet,{redirect:i,href:o}=L.formatUniversalUrl(t,this.uri);A.setWcLinking({name:r,href:o}),A.setRecentWallet(this.wallet),L.openHref(i,"_blank")}catch{this.error=!0}}};Ln([I()],Bt.prototype,"isLoading",void 0);Bt=Ln([O("w3m-connecting-wc-web")],Bt);const Ai=U`
  :host([data-mobile-fullscreen='true']) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :host([data-mobile-fullscreen='true']) wui-ux-by-reown {
    margin-top: auto;
  }
`;var Ie=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let ue=class extends D{constructor(){super(),this.wallet=P.state.data?.wallet,this.unsubscribe=[],this.platform=void 0,this.platforms=[],this.isSiwxEnabled=!!q.state.siwx,this.remoteFeatures=q.state.remoteFeatures,this.displayBranding=!0,this.basic=!1,this.determinePlatforms(),this.initializeConnection(),this.unsubscribe.push(q.subscribeKey("remoteFeatures",t=>this.remoteFeatures=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return q.state.enableMobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      ${this.headerTemplate()}
      <div class="platform-container">${this.platformTemplate()}</div>
      ${this.reownBrandingTemplate()}
    `}reownBrandingTemplate(){return!this.remoteFeatures?.reownBranding||!this.displayBranding?null:u`<wui-ux-by-reown></wui-ux-by-reown>`}async initializeConnection(t=!1){if(!(this.platform==="browser"||q.state.manualWCControl&&!t))try{const{wcPairingExpiry:r,status:i}=A.state,{redirectView:o}=P.state.data??{};if(t||q.state.enableEmbedded||L.isPairingExpired(r)||i==="connecting"){const n=A.getConnections(fe.state.activeChain),s=this.remoteFeatures?.multiWallet,a=n.length>0;await A.connectWalletConnect({cache:"never"}),this.isSiwxEnabled||(a&&s?(P.replace("ProfileWallets"),Me.showSuccess("New Wallet Added")):o?P.replace(o):En.close())}}catch(r){if(r instanceof Error&&r.message.includes("An error occurred when attempting to switch chain")&&!q.state.enableNetworkSwitch&&fe.state.activeChain){fe.setActiveCaipNetwork(qn.getUnsupportedNetwork(`${fe.state.activeChain}:${fe.state.activeCaipNetwork?.id}`)),fe.showUnsupportedChainUI();return}r instanceof Rn&&r.originalName===Sn.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?F.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:r.message}}):F.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:r?.message??"Unknown"}}),A.setWcError(!0),Me.showError(r.message??"Connection error"),A.resetWcConnection(),P.goBack()}}determinePlatforms(){if(!this.wallet){this.platforms.push("qrcode"),this.platform="qrcode";return}if(this.platform)return;const{mobile_link:t,desktop_link:r,webapp_link:i,injected:o,rdns:n}=this.wallet,s=o?.map(({injected_id:x})=>x).filter(Boolean),a=[...n?[n]:s??[]],l=q.state.isUniversalProvider?!1:a.length,c=t,w=i,E=A.checkInstalled(a),C=l&&E,m=r&&!L.isMobile();C&&!fe.state.noAdapters&&this.platforms.push("browser"),c&&this.platforms.push(L.isMobile()?"mobile":"qrcode"),w&&this.platforms.push("web"),m&&this.platforms.push("desktop"),!C&&l&&!fe.state.noAdapters&&this.platforms.push("unsupported"),this.platform=this.platforms[0]}platformTemplate(){switch(this.platform){case"browser":return u`<w3m-connecting-wc-browser></w3m-connecting-wc-browser>`;case"web":return u`<w3m-connecting-wc-web></w3m-connecting-wc-web>`;case"desktop":return u`
          <w3m-connecting-wc-desktop .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-desktop>
        `;case"mobile":return u`
          <w3m-connecting-wc-mobile isMobile .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-mobile>
        `;case"qrcode":return u`<w3m-connecting-wc-qrcode ?basic=${this.basic}></w3m-connecting-wc-qrcode>`;default:return u`<w3m-connecting-wc-unsupported></w3m-connecting-wc-unsupported>`}}headerTemplate(){return this.platforms.length>1?u`
      <w3m-connecting-header
        .platforms=${this.platforms}
        .onSelectPlatfrom=${this.onSelectPlatform.bind(this)}
      >
      </w3m-connecting-header>
    `:null}async onSelectPlatform(t){const r=this.shadowRoot?.querySelector("div");r&&(await r.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.platform=t,r.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}};ue.styles=Ai;Ie([I()],ue.prototype,"platform",void 0);Ie([I()],ue.prototype,"platforms",void 0);Ie([I()],ue.prototype,"isSiwxEnabled",void 0);Ie([I()],ue.prototype,"remoteFeatures",void 0);Ie([d({type:Boolean})],ue.prototype,"displayBranding",void 0);Ie([d({type:Boolean})],ue.prototype,"basic",void 0);ue=Ie([O("w3m-connecting-wc-view")],ue);var Ot=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Qe=class extends D{constructor(){super(),this.unsubscribe=[],this.isMobile=L.isMobile(),this.remoteFeatures=q.state.remoteFeatures,this.unsubscribe.push(q.subscribeKey("remoteFeatures",t=>this.remoteFeatures=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){if(this.isMobile){const{featured:t,recommended:r}=N.state,{customWallets:i}=q.state,o=Fn.getRecentWallets(),n=t.length||r.length||i?.length||o.length;return u`<wui-flex flexDirection="column" gap="2" .margin=${["1","3","3","3"]}>
        ${n?u`<w3m-connector-list></w3m-connector-list>`:null}
        <w3m-all-wallets-widget></w3m-all-wallets-widget>
      </wui-flex>`}return u`<wui-flex flexDirection="column" .padding=${["0","0","4","0"]}>
        <w3m-connecting-wc-view ?basic=${!0} .displayBranding=${!1}></w3m-connecting-wc-view>
        <wui-flex flexDirection="column" .padding=${["0","3","0","3"]}>
          <w3m-all-wallets-widget></w3m-all-wallets-widget>
        </wui-flex>
      </wui-flex>
      ${this.reownBrandingTemplate()} `}reownBrandingTemplate(){return this.remoteFeatures?.reownBranding?u` <wui-flex flexDirection="column" .padding=${["1","0","1","0"]}>
      <wui-ux-by-reown></wui-ux-by-reown>
    </wui-flex>`:null}};Ot([I()],Qe.prototype,"isMobile",void 0);Ot([I()],Qe.prototype,"remoteFeatures",void 0);Qe=Ot([O("w3m-connecting-wc-basic-view")],Qe);const Li=U`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    position: relative;
    display: inline-block;
    user-select: none;
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      color ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      border ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      width ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      height ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  input {
    width: 0;
    height: 0;
    opacity: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({colors:e})=>e.neutrals300};
    border-radius: ${({borderRadius:e})=>e.round};
    border: 1px solid transparent;
    will-change: border;
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      color ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      border ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      width ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      height ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  span:before {
    content: '';
    position: absolute;
    background-color: ${({colors:e})=>e.white};
    border-radius: 50%;
  }

  /* -- Sizes --------------------------------------------------------- */
  label[data-size='lg'] {
    width: 48px;
    height: 32px;
  }

  label[data-size='md'] {
    width: 40px;
    height: 28px;
  }

  label[data-size='sm'] {
    width: 32px;
    height: 22px;
  }

  label[data-size='lg'] > span:before {
    height: 24px;
    width: 24px;
    left: 4px;
    top: 3px;
  }

  label[data-size='md'] > span:before {
    height: 20px;
    width: 20px;
    left: 4px;
    top: 3px;
  }

  label[data-size='sm'] > span:before {
    height: 16px;
    width: 16px;
    left: 3px;
    top: 2px;
  }

  /* -- Focus states --------------------------------------------------- */
  input:focus-visible:not(:checked) + span,
  input:focus:not(:checked) + span {
    border: 1px solid ${({tokens:e})=>e.core.iconAccentPrimary};
    background-color: ${({tokens:e})=>e.theme.textTertiary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  input:focus-visible:checked + span,
  input:focus:checked + span {
    border: 1px solid ${({tokens:e})=>e.core.iconAccentPrimary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  /* -- Checked states --------------------------------------------------- */
  input:checked + span {
    background-color: ${({tokens:e})=>e.core.iconAccentPrimary};
  }

  label[data-size='lg'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='md'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='sm'] > input:checked + span:before {
    transform: translateX(calc(100% - 7px));
  }

  /* -- Hover states ------------------------------------------------------- */
  label:hover > input:not(:checked):not(:disabled) + span {
    background-color: ${({colors:e})=>e.neutrals400};
  }

  label:hover > input:checked:not(:disabled) + span {
    background-color: ${({colors:e})=>e.accent080};
  }

  /* -- Disabled state --------------------------------------------------- */
  label:has(input:disabled) {
    pointer-events: none;
    user-select: none;
  }

  input:not(:checked):disabled + span {
    background-color: ${({colors:e})=>e.neutrals700};
  }

  input:checked:disabled + span {
    background-color: ${({colors:e})=>e.neutrals700};
  }

  input:not(:checked):disabled + span::before {
    background-color: ${({colors:e})=>e.neutrals400};
  }

  input:checked:disabled + span::before {
    background-color: ${({tokens:e})=>e.theme.textTertiary};
  }
`;var nt=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Be=class extends D{constructor(){super(...arguments),this.inputElementRef=Pt(),this.checked=!1,this.disabled=!1,this.size="md"}render(){return u`
      <label data-size=${this.size}>
        <input
          ${At(this.inputElementRef)}
          type="checkbox"
          ?checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.dispatchChangeEvent.bind(this)}
        />
        <span></span>
      </label>
    `}dispatchChangeEvent(){this.dispatchEvent(new CustomEvent("switchChange",{detail:this.inputElementRef.value?.checked,bubbles:!0,composed:!0}))}};Be.styles=[Q,me,Li];nt([d({type:Boolean})],Be.prototype,"checked",void 0);nt([d({type:Boolean})],Be.prototype,"disabled",void 0);nt([d()],Be.prototype,"size",void 0);Be=nt([O("wui-toggle")],Be);const Ni=U`
  :host {
    height: auto;
  }

  :host > wui-flex {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[2]} ${({spacing:e})=>e[3]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[4]};
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
    cursor: pointer;
  }

  wui-switch {
    pointer-events: none;
  }
`;var Nn=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ye=class extends D{constructor(){super(...arguments),this.checked=!1}render(){return u`
      <wui-flex>
        <wui-icon size="xl" name="walletConnectBrown"></wui-icon>
        <wui-toggle
          ?checked=${this.checked}
          size="sm"
          @switchChange=${this.handleToggleChange.bind(this)}
        ></wui-toggle>
      </wui-flex>
    `}handleToggleChange(t){t.stopPropagation(),this.checked=t.detail,this.dispatchSwitchEvent()}dispatchSwitchEvent(){this.dispatchEvent(new CustomEvent("certifiedSwitchChange",{detail:this.checked,bubbles:!0,composed:!0}))}};Ye.styles=[Q,me,Ni];Nn([d({type:Boolean})],Ye.prototype,"checked",void 0);Ye=Nn([O("wui-certified-switch")],Ye);const Oi=U`
  :host {
    position: relative;
    width: 100%;
    display: inline-flex;
    flex-direction: column;
    gap: ${({spacing:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.textPrimary};
    caret-color: ${({tokens:e})=>e.core.textAccentPrimary};
  }

  .wui-input-text-container {
    position: relative;
    display: flex;
  }

  input {
    width: 100%;
    border-radius: ${({borderRadius:e})=>e[4]};
    color: inherit;
    background: transparent;
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
    caret-color: ${({tokens:e})=>e.core.textAccentPrimary};
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[3]} ${({spacing:e})=>e[10]};
    font-size: ${({textSize:e})=>e.large};
    line-height: ${({typography:e})=>e["lg-regular"].lineHeight};
    letter-spacing: ${({typography:e})=>e["lg-regular"].letterSpacing};
    font-weight: ${({fontWeight:e})=>e.regular};
    font-family: ${({fontFamily:e})=>e.regular};
  }

  input[data-size='lg'] {
    padding: ${({spacing:e})=>e[4]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[4]} ${({spacing:e})=>e[10]};
  }

  @media (hover: hover) and (pointer: fine) {
    input:hover:enabled {
      border: 1px solid ${({tokens:e})=>e.theme.borderSecondary};
    }
  }

  input:disabled {
    cursor: unset;
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
  }

  input::placeholder {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  input:focus:enabled {
    border: 1px solid ${({tokens:e})=>e.theme.borderSecondary};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    -webkit-box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent040};
    -moz-box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent040};
    box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent040};
  }

  div.wui-input-text-container:has(input:disabled) {
    opacity: 0.5;
  }

  wui-icon.wui-input-text-left-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    left: ${({spacing:e})=>e[4]};
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  button.wui-input-text-submit-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:e})=>e[3]};
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: ${({borderRadius:e})=>e[2]};
    color: ${({tokens:e})=>e.core.textAccentPrimary};
  }

  button.wui-input-text-submit-button:disabled {
    opacity: 1;
  }

  button.wui-input-text-submit-button.loading wui-icon {
    animation: spin 1s linear infinite;
  }

  button.wui-input-text-submit-button:hover {
    background: ${({tokens:e})=>e.core.foregroundAccent010};
  }

  input:has(+ .wui-input-text-submit-button) {
    padding-right: ${({spacing:e})=>e[12]};
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  input[type='search']::-webkit-search-decoration,
  input[type='search']::-webkit-search-cancel-button,
  input[type='search']::-webkit-search-results-button,
  input[type='search']::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /* -- Keyframes --------------------------------------------------- */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;var Y=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let V=class extends D{constructor(){super(...arguments),this.inputElementRef=Pt(),this.disabled=!1,this.loading=!1,this.placeholder="",this.type="text",this.value="",this.size="md"}render(){return u` <div class="wui-input-text-container">
        ${this.templateLeftIcon()}
        <input
          data-size=${this.size}
          ${At(this.inputElementRef)}
          data-testid="wui-input-text"
          type=${this.type}
          enterkeyhint=${j(this.enterKeyHint)}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.dispatchInputChangeEvent.bind(this)}
          @keydown=${this.onKeyDown}
          .value=${this.value||""}
        />
        ${this.templateSubmitButton()}
        <slot class="wui-input-text-slot"></slot>
      </div>
      ${this.templateError()} ${this.templateWarning()}`}templateLeftIcon(){return this.icon?u`<wui-icon
        class="wui-input-text-left-icon"
        size="md"
        data-size=${this.size}
        color="inherit"
        name=${this.icon}
      ></wui-icon>`:null}templateSubmitButton(){return this.onSubmit?u`<button
        class="wui-input-text-submit-button ${this.loading?"loading":""}"
        @click=${this.onSubmit?.bind(this)}
        ?disabled=${this.disabled||this.loading}
      >
        ${this.loading?u`<wui-icon name="spinner" size="md"></wui-icon>`:u`<wui-icon name="chevronRight" size="md"></wui-icon>`}
      </button>`:null}templateError(){return this.errorText?u`<wui-text variant="sm-regular" color="error">${this.errorText}</wui-text>`:null}templateWarning(){return this.warningText?u`<wui-text variant="sm-regular" color="warning">${this.warningText}</wui-text>`:null}dispatchInputChangeEvent(){this.dispatchEvent(new CustomEvent("inputChange",{detail:this.inputElementRef.value?.value,bubbles:!0,composed:!0}))}};V.styles=[Q,me,Oi];Y([d()],V.prototype,"icon",void 0);Y([d({type:Boolean})],V.prototype,"disabled",void 0);Y([d({type:Boolean})],V.prototype,"loading",void 0);Y([d()],V.prototype,"placeholder",void 0);Y([d()],V.prototype,"type",void 0);Y([d()],V.prototype,"value",void 0);Y([d()],V.prototype,"errorText",void 0);Y([d()],V.prototype,"warningText",void 0);Y([d()],V.prototype,"onSubmit",void 0);Y([d()],V.prototype,"size",void 0);Y([d({attribute:!1})],V.prototype,"onKeyDown",void 0);V=Y([O("wui-input-text")],V);const Mi=U`
  :host {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  wui-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.iconDefault};
    cursor: pointer;
    padding: ${({spacing:e})=>e[2]};
    background-color: transparent;
    border-radius: ${({borderRadius:e})=>e[4]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
  }

  @media (hover: hover) {
    wui-icon:hover {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }
`;var On=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Xe=class extends D{constructor(){super(...arguments),this.inputComponentRef=Pt(),this.inputValue=""}render(){return u`
      <wui-input-text
        ${At(this.inputComponentRef)}
        placeholder="Search wallet"
        icon="search"
        type="search"
        enterKeyHint="search"
        size="sm"
        @inputChange=${this.onInputChange}
      >
        ${this.inputValue?u`<wui-icon
              @click=${this.clearValue}
              color="inherit"
              size="sm"
              name="close"
            ></wui-icon>`:null}
      </wui-input-text>
    `}onInputChange(t){this.inputValue=t.detail||""}clearValue(){const r=this.inputComponentRef.value?.inputElementRef.value;r&&(r.value="",this.inputValue="",r.focus(),r.dispatchEvent(new Event("input")))}};Xe.styles=[Q,Mi];On([d()],Xe.prototype,"inputValue",void 0);Xe=On([O("wui-search-bar")],Xe);const Di=Oe`<svg  viewBox="0 0 48 54" fill="none">
  <path
    d="M43.4605 10.7248L28.0485 1.61089C25.5438 0.129705 22.4562 0.129705 19.9515 1.61088L4.53951 10.7248C2.03626 12.2051 0.5 14.9365 0.5 17.886V36.1139C0.5 39.0635 2.03626 41.7949 4.53951 43.2752L19.9515 52.3891C22.4562 53.8703 25.5438 53.8703 28.0485 52.3891L43.4605 43.2752C45.9637 41.7949 47.5 39.0635 47.5 36.114V17.8861C47.5 14.9365 45.9637 12.2051 43.4605 10.7248Z"
  />
</svg>`,ji=U`
  :host {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 104px;
    width: 104px;
    row-gap: ${({spacing:e})=>e[2]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[5]};
    position: relative;
  }

  wui-shimmer[data-type='network'] {
    border: none;
    -webkit-clip-path: var(--apkt-path-network);
    clip-path: var(--apkt-path-network);
  }

  svg {
    position: absolute;
    width: 48px;
    height: 54px;
    z-index: 1;
  }

  svg > path {
    stroke: ${({tokens:e})=>e.theme.foregroundSecondary};
    stroke-width: 1px;
  }

  @media (max-width: 350px) {
    :host {
      width: 100%;
    }
  }
`;var Mn=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Ze=class extends D{constructor(){super(...arguments),this.type="wallet"}render(){return u`
      ${this.shimmerTemplate()}
      <wui-shimmer width="80px" height="20px"></wui-shimmer>
    `}shimmerTemplate(){return this.type==="network"?u` <wui-shimmer data-type=${this.type} width="48px" height="54px"></wui-shimmer>
        ${Di}`:u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}};Ze.styles=[Q,me,ji];Mn([d()],Ze.prototype,"type",void 0);Ze=Mn([O("wui-card-select-loader")],Ze);const Ui=xn`
  :host {
    display: grid;
    width: inherit;
    height: inherit;
  }
`;var X=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let K=class extends D{render(){return this.style.cssText=`
      grid-template-rows: ${this.gridTemplateRows};
      grid-template-columns: ${this.gridTemplateColumns};
      justify-items: ${this.justifyItems};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      align-content: ${this.alignContent};
      column-gap: ${this.columnGap&&`var(--apkt-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap&&`var(--apkt-spacing-${this.rowGap})`};
      gap: ${this.gap&&`var(--apkt-spacing-${this.gap})`};
      padding-top: ${this.padding&&ce.getSpacingStyles(this.padding,0)};
      padding-right: ${this.padding&&ce.getSpacingStyles(this.padding,1)};
      padding-bottom: ${this.padding&&ce.getSpacingStyles(this.padding,2)};
      padding-left: ${this.padding&&ce.getSpacingStyles(this.padding,3)};
      margin-top: ${this.margin&&ce.getSpacingStyles(this.margin,0)};
      margin-right: ${this.margin&&ce.getSpacingStyles(this.margin,1)};
      margin-bottom: ${this.margin&&ce.getSpacingStyles(this.margin,2)};
      margin-left: ${this.margin&&ce.getSpacingStyles(this.margin,3)};
    `,u`<slot></slot>`}};K.styles=[Q,Ui];X([d()],K.prototype,"gridTemplateRows",void 0);X([d()],K.prototype,"gridTemplateColumns",void 0);X([d()],K.prototype,"justifyItems",void 0);X([d()],K.prototype,"alignItems",void 0);X([d()],K.prototype,"justifyContent",void 0);X([d()],K.prototype,"alignContent",void 0);X([d()],K.prototype,"columnGap",void 0);X([d()],K.prototype,"rowGap",void 0);X([d()],K.prototype,"gap",void 0);X([d()],K.prototype,"padding",void 0);X([d()],K.prototype,"margin",void 0);K=X([O("wui-grid")],K);const zi=U`
  button {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    width: 104px;
    row-gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[0]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: clamp(0px, ${({borderRadius:e})=>e[4]}, 20px);
    transition:
      color ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-1"]},
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      border-radius ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color, color, border-radius;
    outline: none;
    border: none;
  }

  button > wui-flex > wui-text {
    color: ${({tokens:e})=>e.theme.textPrimary};
    max-width: 86px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  button > wui-flex > wui-text.certified {
    max-width: 66px;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  button:disabled > wui-flex > wui-text {
    color: ${({tokens:e})=>e.core.glass010};
  }

  [data-selected='true'] {
    background-color: ${({colors:e})=>e.accent020};
  }

  @media (hover: hover) and (pointer: fine) {
    [data-selected='true']:hover:enabled {
      background-color: ${({colors:e})=>e.accent010};
    }
  }

  [data-selected='true']:active:enabled {
    background-color: ${({colors:e})=>e.accent010};
  }

  @media (max-width: 350px) {
    button {
      width: 100%;
    }
  }
`;var re=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let G=class extends D{constructor(){super(),this.observer=new IntersectionObserver(()=>{}),this.visible=!1,this.imageSrc=void 0,this.imageLoading=!1,this.isImpressed=!1,this.explorerId="",this.walletQuery="",this.certified=!1,this.displayIndex=0,this.wallet=void 0,this.observer=new IntersectionObserver(t=>{t.forEach(r=>{r.isIntersecting?(this.visible=!0,this.fetchImageSrc(),this.sendImpressionEvent()):this.visible=!1})},{threshold:.01})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){const t=this.wallet?.badge_type==="certified";return u`
      <button>
        ${this.imageTemplate()}
        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="1">
          <wui-text
            variant="md-regular"
            color="inherit"
            class=${j(t?"certified":void 0)}
            >${this.wallet?.name}</wui-text
          >
          ${t?u`<wui-icon size="sm" name="walletConnectBrown"></wui-icon>`:null}
        </wui-flex>
      </button>
    `}imageTemplate(){return!this.visible&&!this.imageSrc||this.imageLoading?this.shimmerTemplate():u`
      <wui-wallet-image
        size="lg"
        imageSrc=${j(this.imageSrc)}
        name=${j(this.wallet?.name)}
        .installed=${this.wallet?.installed??!1}
        badgeSize="sm"
      >
      </wui-wallet-image>
    `}shimmerTemplate(){return u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}async fetchImageSrc(){this.wallet&&(this.imageSrc=ge.getWalletImage(this.wallet),!this.imageSrc&&(this.imageLoading=!0,this.imageSrc=await ge.fetchWalletImage(this.wallet.image_id),this.imageLoading=!1))}sendImpressionEvent(){!this.wallet||this.isImpressed||(this.isImpressed=!0,F.sendWalletImpressionEvent({name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.explorerId,view:P.state.view,query:this.walletQuery,certified:this.certified,displayIndex:this.displayIndex}))}};G.styles=zi;re([I()],G.prototype,"visible",void 0);re([I()],G.prototype,"imageSrc",void 0);re([I()],G.prototype,"imageLoading",void 0);re([I()],G.prototype,"isImpressed",void 0);re([d()],G.prototype,"explorerId",void 0);re([d()],G.prototype,"walletQuery",void 0);re([d()],G.prototype,"certified",void 0);re([d()],G.prototype,"displayIndex",void 0);re([d({type:Object})],G.prototype,"wallet",void 0);G=re([O("w3m-all-wallets-list-item")],G);const qi=U`
  wui-grid {
    max-height: clamp(360px, 400px, 80vh);
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  w3m-all-wallets-list-item {
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-inout-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  wui-loading-spinner {
    padding-top: ${({spacing:e})=>e[4]};
    padding-bottom: ${({spacing:e})=>e[4]};
    justify-content: center;
    grid-column: 1 / span 4;
  }
`;var be=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};const $n="local-paginator";let ie=class extends D{constructor(){super(),this.unsubscribe=[],this.paginationObserver=void 0,this.loading=!N.state.wallets.length,this.wallets=N.state.wallets,this.recommended=N.state.recommended,this.featured=N.state.featured,this.filteredWallets=N.state.filteredWallets,this.mobileFullScreen=q.state.enableMobileFullScreen,this.unsubscribe.push(N.subscribeKey("wallets",t=>this.wallets=t),N.subscribeKey("recommended",t=>this.recommended=t),N.subscribeKey("featured",t=>this.featured=t),N.subscribeKey("filteredWallets",t=>this.filteredWallets=t))}firstUpdated(){this.initialFetch(),this.createPaginationObserver()}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),this.paginationObserver?.disconnect()}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      <wui-grid
        data-scroll=${!this.loading}
        .padding=${["0","3","3","3"]}
        gap="2"
        justifyContent="space-between"
      >
        ${this.loading?this.shimmerTemplate(16):this.walletsTemplate()}
        ${this.paginationLoaderTemplate()}
      </wui-grid>
    `}async initialFetch(){this.loading=!0;const t=this.shadowRoot?.querySelector("wui-grid");t&&(await N.fetchWalletsByPage({page:1}),await t.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.loading=!1,t.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}shimmerTemplate(t,r){return[...Array(t)].map(()=>u`
        <wui-card-select-loader type="wallet" id=${j(r)}></wui-card-select-loader>
      `)}getWallets(){const t=[...this.featured,...this.recommended];this.filteredWallets?.length>0?t.push(...this.filteredWallets):t.push(...this.wallets);const r=L.uniqueBy(t,"id"),i=kt.markWalletsAsInstalled(r);return kt.markWalletsWithDisplayIndex(i)}walletsTemplate(){return this.getWallets().map((r,i)=>u`
        <w3m-all-wallets-list-item
          data-testid="wallet-search-item-${r.id}"
          @click=${()=>this.onConnectWallet(r)}
          .wallet=${r}
          explorerId=${r.id}
          certified=${this.badge==="certified"}
          displayIndex=${i}
        ></w3m-all-wallets-list-item>
      `)}paginationLoaderTemplate(){const{wallets:t,recommended:r,featured:i,count:o,mobileFilteredOutWalletsLength:n}=N.state,s=window.innerWidth<352?3:4,a=t.length+r.length;let c=Math.ceil(a/s)*s-a+s;return c-=t.length?i.length%s:0,o===0&&i.length>0?null:o===0||[...i,...t,...r].length<o-(n??0)?this.shimmerTemplate(c,$n):null}createPaginationObserver(){const t=this.shadowRoot?.querySelector(`#${$n}`);t&&(this.paginationObserver=new IntersectionObserver(([r])=>{if(r?.isIntersecting&&!this.loading){const{page:i,count:o,wallets:n}=N.state;n.length<o&&N.fetchWalletsByPage({page:i+1})}}),this.paginationObserver.observe(t))}onConnectWallet(t){H.selectWalletConnector(t)}};ie.styles=qi;be([I()],ie.prototype,"loading",void 0);be([I()],ie.prototype,"wallets",void 0);be([I()],ie.prototype,"recommended",void 0);be([I()],ie.prototype,"featured",void 0);be([I()],ie.prototype,"filteredWallets",void 0);be([I()],ie.prototype,"badge",void 0);be([I()],ie.prototype,"mobileFullScreen",void 0);ie=be([O("w3m-all-wallets-list")],ie);const Fi=xn`
  wui-grid,
  wui-loading-spinner,
  wui-flex {
    height: 360px;
  }

  wui-grid {
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
    height: auto;
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;var ze=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Re=class extends D{constructor(){super(...arguments),this.prevQuery="",this.prevBadge=void 0,this.loading=!0,this.mobileFullScreen=q.state.enableMobileFullScreen,this.query=""}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.onSearch(),this.loading?u`<wui-loading-spinner color="accent-primary"></wui-loading-spinner>`:this.walletsTemplate()}async onSearch(){(this.query.trim()!==this.prevQuery.trim()||this.badge!==this.prevBadge)&&(this.prevQuery=this.query,this.prevBadge=this.badge,this.loading=!0,await N.searchWallet({search:this.query,badge:this.badge}),this.loading=!1)}walletsTemplate(){const{search:t}=N.state,r=kt.markWalletsAsInstalled(t);return t.length?u`
      <wui-grid
        data-testid="wallet-list"
        .padding=${["0","3","3","3"]}
        rowGap="4"
        columngap="2"
        justifyContent="space-between"
      >
        ${r.map((i,o)=>u`
            <w3m-all-wallets-list-item
              @click=${()=>this.onConnectWallet(i)}
              .wallet=${i}
              data-testid="wallet-search-item-${i.id}"
              explorerId=${i.id}
              certified=${this.badge==="certified"}
              walletQuery=${this.query}
              displayIndex=${o}
            ></w3m-all-wallets-list-item>
          `)}
      </wui-grid>
    `:u`
        <wui-flex
          data-testid="no-wallet-found"
          justifyContent="center"
          alignItems="center"
          gap="3"
          flexDirection="column"
        >
          <wui-icon-box size="lg" color="default" icon="wallet"></wui-icon-box>
          <wui-text data-testid="no-wallet-found-text" color="secondary" variant="md-medium">
            No Wallet found
          </wui-text>
        </wui-flex>
      `}onConnectWallet(t){H.selectWalletConnector(t)}};Re.styles=Fi;ze([I()],Re.prototype,"loading",void 0);ze([I()],Re.prototype,"mobileFullScreen",void 0);ze([d()],Re.prototype,"query",void 0);ze([d()],Re.prototype,"badge",void 0);Re=ze([O("w3m-all-wallets-search")],Re);var Mt=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let et=class extends D{constructor(){super(...arguments),this.search="",this.badge=void 0,this.onDebouncedSearch=L.debounce(t=>{this.search=t})}render(){const t=this.search.length>=2;return u`
      <wui-flex .padding=${["1","3","3","3"]} gap="2" alignItems="center">
        <wui-search-bar @inputChange=${this.onInputChange.bind(this)}></wui-search-bar>
        <wui-certified-switch
          ?checked=${this.badge==="certified"}
          @certifiedSwitchChange=${this.onCertifiedSwitchChange.bind(this)}
          data-testid="wui-certified-switch"
        ></wui-certified-switch>
        ${this.qrButtonTemplate()}
      </wui-flex>
      ${t||this.badge?u`<w3m-all-wallets-search
            query=${this.search}
            .badge=${this.badge}
          ></w3m-all-wallets-search>`:u`<w3m-all-wallets-list .badge=${this.badge}></w3m-all-wallets-list>`}
    `}onInputChange(t){this.onDebouncedSearch(t.detail)}onCertifiedSwitchChange(t){t.detail?(this.badge="certified",Me.showSvg("Only WalletConnect certified",{icon:"walletConnectBrown",iconColor:"accent-100"})):this.badge=void 0}qrButtonTemplate(){return L.isMobile()?u`
        <wui-icon-box
          size="xl"
          iconSize="xl"
          color="accent-primary"
          icon="qrCode"
          border
          borderColor="wui-accent-glass-010"
          @click=${this.onWalletConnectQr.bind(this)}
        ></wui-icon-box>
      `:null}onWalletConnectQr(){P.push("ConnectingWalletConnect")}};Mt([I()],et.prototype,"search",void 0);Mt([I()],et.prototype,"badge",void 0);et=Mt([O("w3m-all-wallets-view")],et);const Vi=U`
  :host {
    width: 100%;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({spacing:e})=>e[3]};
    width: 100%;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border-radius: ${({borderRadius:e})=>e[4]};
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      scale ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color, scale;
  }

  wui-text {
    text-transform: capitalize;
  }

  wui-image {
    color: ${({tokens:e})=>e.theme.textPrimary};
  }

  @media (hover: hover) {
    button:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;var oe=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let J=class extends D{constructor(){super(...arguments),this.imageSrc="google",this.loading=!1,this.disabled=!1,this.rightIcon=!0,this.rounded=!1,this.fullSize=!1}render(){return this.dataset.rounded=this.rounded?"true":"false",u`
      <button
        ?disabled=${this.loading?!0:!!this.disabled}
        data-loading=${this.loading}
        tabindex=${j(this.tabIdx)}
      >
        <wui-flex gap="2" alignItems="center">
          ${this.templateLeftIcon()}
          <wui-flex gap="1">
            <slot></slot>
          </wui-flex>
        </wui-flex>
        ${this.templateRightIcon()}
      </button>
    `}templateLeftIcon(){return this.icon?u`<wui-image
        icon=${this.icon}
        iconColor=${j(this.iconColor)}
        ?boxed=${!0}
        ?rounded=${this.rounded}
      ></wui-image>`:u`<wui-image
      ?boxed=${!0}
      ?rounded=${this.rounded}
      ?fullSize=${this.fullSize}
      src=${this.imageSrc}
    ></wui-image>`}templateRightIcon(){return this.rightIcon?this.loading?u`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:u`<wui-icon name="chevronRight" size="lg" color="default"></wui-icon>`:null}};J.styles=[Q,me,Vi];oe([d()],J.prototype,"imageSrc",void 0);oe([d()],J.prototype,"icon",void 0);oe([d()],J.prototype,"iconColor",void 0);oe([d({type:Boolean})],J.prototype,"loading",void 0);oe([d()],J.prototype,"tabIdx",void 0);oe([d({type:Boolean})],J.prototype,"disabled",void 0);oe([d({type:Boolean})],J.prototype,"rightIcon",void 0);oe([d({type:Boolean})],J.prototype,"rounded",void 0);oe([d({type:Boolean})],J.prototype,"fullSize",void 0);J=oe([O("wui-list-item")],J);var Ki=function(e,t,r,i){var o=arguments.length,n=o<3?t:i===null?i=Object.getOwnPropertyDescriptor(t,r):i,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,r,i);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,r,n):s(t,r))||n);return o>3&&n&&Object.defineProperty(t,r,n),n};let Cn=class extends D{constructor(){super(...arguments),this.wallet=P.state.data?.wallet}render(){if(!this.wallet)throw new Error("w3m-downloads-view");return u`
      <wui-flex gap="2" flexDirection="column" .padding=${["3","3","4","3"]}>
        ${this.chromeTemplate()} ${this.iosTemplate()} ${this.androidTemplate()}
        ${this.homepageTemplate()}
      </wui-flex>
    `}chromeTemplate(){return this.wallet?.chrome_store?u`<wui-list-item
      variant="icon"
      icon="chromeStore"
      iconVariant="square"
      @click=${this.onChromeStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Chrome Extension</wui-text>
    </wui-list-item>`:null}iosTemplate(){return this.wallet?.app_store?u`<wui-list-item
      variant="icon"
      icon="appStore"
      iconVariant="square"
      @click=${this.onAppStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">iOS App</wui-text>
    </wui-list-item>`:null}androidTemplate(){return this.wallet?.play_store?u`<wui-list-item
      variant="icon"
      icon="playStore"
      iconVariant="square"
      @click=${this.onPlayStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Android App</wui-text>
    </wui-list-item>`:null}homepageTemplate(){return this.wallet?.homepage?u`
      <wui-list-item
        variant="icon"
        icon="browser"
        iconVariant="square-blue"
        @click=${this.onHomePage.bind(this)}
        chevron
      >
        <wui-text variant="md-medium" color="primary">Website</wui-text>
      </wui-list-item>
    `:null}openStore(t){t.href&&this.wallet&&(F.sendEvent({type:"track",event:"GET_WALLET",properties:{name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.wallet.id,type:t.type}}),L.openHref(t.href,"_blank"))}onChromeStore(){this.wallet?.chrome_store&&this.openStore({href:this.wallet.chrome_store,type:"chrome_store"})}onAppStore(){this.wallet?.app_store&&this.openStore({href:this.wallet.app_store,type:"app_store"})}onPlayStore(){this.wallet?.play_store&&this.openStore({href:this.wallet.play_store,type:"play_store"})}onHomePage(){this.wallet?.homepage&&this.openStore({href:this.wallet.homepage,type:"homepage"})}};Cn=Ki([O("w3m-downloads-view")],Cn);export{et as W3mAllWalletsView,Qe as W3mConnectingWcBasicView,Cn as W3mDownloadsView};
