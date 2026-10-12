import{f,u as $,A as b,b as g,E as v}from"./lit-element-CTMkb1fT.js";/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const m={attribute:!0,type:String,converter:$,reflect:!1,hasChanged:f},y=(t=m,s,r)=>{const{kind:e,metadata:i}=r;let a=globalThis.litPropertyMetadata.get(i);if(a===void 0&&globalThis.litPropertyMetadata.set(i,a=new Map),e==="setter"&&((t=Object.create(t)).wrapped=!0),a.set(r.name,t),e==="accessor"){const{name:n}=r;return{set(o){const u=s.get.call(this);s.set.call(this,o),this.requestUpdate(n,u,t,!0,o)},init(o){return o!==void 0&&this.C(n,void 0,t,o),o}}}if(e==="setter"){const{name:n}=r;return function(o){const u=this[n];s.call(this,o),this.requestUpdate(n,u,t,!0,o)}}throw Error("Unsupported decorator location: "+e)};function _(t){return(s,r)=>typeof r=="object"?y(t,s,r):((e,i,a)=>{const n=i.hasOwnProperty(a);return i.constructor.createProperty(a,e),n?Object.getOwnPropertyDescriptor(i,a):void 0})(t,s,r)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function U(t){return _({...t,state:!0,attribute:!1})}/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const C=t=>t??b;/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const p=Symbol.for(""),w=t=>{if(t?.r===p)return t?._$litStatic$},E=t=>({_$litStatic$:t,r:p}),d=new Map,A=t=>(s,...r)=>{const e=r.length;let i,a;const n=[],o=[];let u,c=0,h=!1;for(;c<e;){for(u=s[c];c<e&&(a=r[c],(i=w(a))!==void 0);)u+=i+s[++c],h=!0;c!==e&&o.push(a),n.push(u),c++}if(c===e&&n.push(s[e]),h){const l=n.join("$$lit$$");(s=d.get(l))===void 0&&(n.raw=n,d.set(l,s=n)),r=o}return t(s,...r)},O=A(g);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const T={ATTRIBUTE:1,CHILD:2},j=t=>(...s)=>({_$litDirective$:t,values:s});class M{constructor(s){}get _$AU(){return this._$AM._$AU}_$AT(s,r,e){this._$Ct=s,this._$AM=r,this._$Ci=e}_$AS(s,r){return this.update(s,r)}update(s,r){return this.render(...r)}}/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const P=j(class extends M{constructor(t){if(super(t),t.type!==T.ATTRIBUTE||t.name!=="class"||t.strings?.length>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(t){return" "+Object.keys(t).filter(s=>t[s]).join(" ")+" "}update(t,[s]){if(this.st===void 0){this.st=new Set,t.strings!==void 0&&(this.nt=new Set(t.strings.join(" ").split(/\s/).filter(e=>e!=="")));for(const e in s)s[e]&&!this.nt?.has(e)&&this.st.add(e);return this.render(s)}const r=t.element.classList;for(const e of this.st)e in s||(r.remove(e),this.st.delete(e));for(const e in s){const i=!!s[e];i===this.st.has(e)||this.nt?.has(e)||(i?(r.add(e),this.st.add(e)):(r.remove(e),this.st.delete(e)))}return v}});export{P as a,j as e,M as i,_ as n,C as o,U as r,E as s,T as t,O as u};
