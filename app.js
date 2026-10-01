'use strict';
/* BillBook – offline invoice generator (vanilla JS).
   Sections: data · money · PDF · UI · settings · PWA */
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const K='billbook.v1',ST=['Paid','Unpaid','Partially Paid','Pending'],MT=['Cash','UPI','Bank Transfer','Card','Other'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEF={name:'',owner:'',phone:'',wa:'',email:'',address:'',gstin:'',pan:'',upi:'',web:'',logo:'',sign:'',signOn:true,logoPos:'left',logoSize:70,
 footer:'Thank you for your business!',notes:'Thank you for your business.',
 terms:'1. Payment once made is non-refundable unless otherwise agreed.\n2. Please verify the invoice details.\n3. Balance payment is due as agreed.',
 prefix:'INV-',next:1001,dfmt:'DD/MM/YYYY',cur:'₹',status:'Unpaid',method:'Cash',qr:true};
let DB={settings:{...DEF},invoices:[]},cur=null,tt,pvTk=0;
const deb=(f,ms)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));

/* ---------- data ---------- */
function load(){try{const d=JSON.parse(localStorage.getItem(K)||'null');if(d&&Array.isArray(d.invoices))DB={settings:{...DEF,...d.settings},invoices:d.invoices}}catch(e){toast('Saved data could not be read')}}
function save(){try{localStorage.setItem(K,JSON.stringify(DB));return true}catch(e){toast('Storage full – export a backup');return false}}
const saveDeb=deb(save,400);
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2400)}
function ask(msg,ok='Delete'){return new Promise(res=>{const d=$('#dlg');d.innerHTML=`<form method="dialog"><p>${esc(msg)}</p><div class="btns"><button value="no" class="btn">Cancel</button><button value="yes" class="btn danger">${esc(ok)}</button></div></form>`;d.returnValue='';d.onclose=()=>res(d.returnValue==='yes');d.showModal()})}

/* ---------- money & dates (all currency maths in integer paise) ---------- */
const P=v=>Math.round((parseFloat(v)||0)*100);
const money=p=>(p<0?'-':'')+DB.settings.cur+(Math.abs(p)/100).toLocaleString('en-IN',{minimumFractionDigits:p%100?2:0,maximumFractionDigits:2});
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const fd=iso=>{if(!iso)return'';const[y,m,d]=iso.split('-');return DB.settings.dfmt==='DD MMM YYYY'?`${d} ${MON[m-1]} ${y}`:`${d}/${m}/${y}`};
function calc(inv){
 const sub=inv.items.reduce((s,i)=>s+Math.round((parseFloat(i.qty)||0)*P(i.rate)),0);
 const disc=Math.min(sub,inv.discType==='%'?Math.round(sub*(parseFloat(inv.disc)||0)/100):P(inv.disc));
 const tax=Math.round((sub-disc)*(parseFloat(inv.tax)||0)/100);
 let total=sub-disc+tax+P(inv.ship)+P(inv.other)+P(inv.prev),ro=0;
 if(inv.round){ro=Math.round(total/100)*100-total;total+=ro}
 const paid=inv.status==='Paid'?total:Math.max(0,Math.min(P(inv.paid),total));
 return{sub,disc,tax,ro,total,paid,bal:total-paid};
}
function nextNo(){const S=DB.settings,used=new Set(DB.invoices.map(i=>i.no));let n=parseInt(S.next)||1;while(used.has(S.prefix+n))n++;return S.prefix+n}
const blank=()=>({id:Date.now().toString(36),no:nextNo(),date:today(),due:'',cust:{name:'',phone:'',wa:'',email:'',address:'',gstin:''},
 items:[{d:'',qty:1,unit:'Piece',rate:''}],discType:'%',disc:'',tax:'',ship:'',other:'',prev:'',round:false,paid:'',
 status:DB.settings.status,method:DB.settings.method,qr:DB.settings.qr,notes:DB.settings.notes,created:Date.now()});
function validate(inv){
 const e=[],c=inv.cust;
 if(!c.name.trim())e.push('Customer name is required');
 if(c.phone.replace(/\D/g,'').length<10)e.push('Enter a valid phone number (at least 10 digits)');
 if(!inv.no.trim())e.push('Invoice number is required');
 else if(DB.invoices.some(i=>i.no===inv.no&&i.id!==inv.id))e.push('Invoice number '+inv.no+' already exists');
 if(!inv.date)e.push('Bill date is required');
 inv.items.forEach((it,i)=>{const n='Item '+(i+1)+': ';if(!it.d.trim())e.push(n+'add a description');if(!(parseFloat(it.qty)>0))e.push(n+'quantity must be more than 0');if(!(parseFloat(it.rate)>=0))e.push(n+'enter a valid rate (0 or more)')});
 if(['disc','tax','ship','other','prev','paid'].some(k=>inv[k]!==''&&!(parseFloat(inv[k])>=0)))e.push('Discount, tax, charges and paid amount cannot be negative');
 return e;
}

/* ---------- PDF: draw A4 pages on canvas → wrap JPEGs in a minimal PDF ---------- */
const imgCache=new Map();
function loadImg(src){if(!src)return Promise.resolve(null);if(!imgCache.has(src))imgCache.set(src,new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src}));return imgCache.get(src)}
async function renderPages(inv){
 const S=DB.settings,t=calc(inv),W=1240,H=1754,M=70,CW=W-2*M,FT=H-M-70,AC='#1d3557',pages=[];
 const [logo,sign]=await Promise.all([loadImg(S.logo),S.signOn?loadImg(S.sign):null]);
 let g,y;
 const F=(w,s)=>{g.font=`${w} ${s}px "Segoe UI",Roboto,Helvetica,Arial,sans-serif`};
 const T=(s,x,yy,w=400,sz=24,col='#111',al='left')=>{F(w,sz);g.fillStyle=col;g.textAlign=al;g.fillText(s,x,yy)};
 const hr=(x1,x2,yy,col='#ccc',lw=2)=>{g.strokeStyle=col;g.lineWidth=lw;g.beginPath();g.moveTo(x1,yy);g.lineTo(x2,yy);g.stroke()};
 const wrap=(s,mw,w=400,sz=24)=>{F(w,sz);const o=[];String(s||'').split('\n').forEach(p=>{let l='';p.split(' ').forEach(x=>{const n=l?l+' '+x:x;if(g.measureText(n).width>mw&&l){o.push(l);l=x}else l=n});o.push(l)});return o};
 const page=()=>{const c=document.createElement('canvas');c.width=W;c.height=H;g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);pages.push(c);y=M};
 const need=h=>{if(y+h>FT)page()};
 page();
 /* header: logo + business name + details */
 let lwU=0,lb=0,hx=M,ha='left';
 if(logo){const lh=S.logoSize*1.5;let lw=lh*logo.width/logo.height,h2=lh;if(lw>320){lw=320;h2=lw*logo.height/logo.width}
  if(S.logoPos==='center'){g.drawImage(logo,W/2-lw/2,y,lw,h2);y+=h2+16;hx=W/2;ha='center'}
  else if(S.logoPos==='right'){g.drawImage(logo,W-M-lw,y,lw,h2);lb=y+h2;lwU=lw}
  else{g.drawImage(logo,M,y,lw,h2);hx=M+lw+30;lb=y+h2;lwU=lw}}
 const nm=(S.name||'YOUR BUSINESS NAME').toUpperCase(),maxW=CW-(lwU?lwU+30:0);let ns=48;F(700,ns);
 while(g.measureText(nm).width>maxW&&ns>24){ns-=2;F(700,ns)}
 y+=ns;T(nm,hx,y,700,ns,AC,ha);y+=8;
 [[S.phone&&'Phone: '+S.phone,S.email&&'Email: '+S.email].filter(Boolean).join('   |   '),S.address&&'Address: '+S.address,
  [S.gstin&&'GSTIN: '+S.gstin,S.pan&&'PAN: '+S.pan,S.web].filter(Boolean).join('   |   ')].filter(Boolean)
  .forEach(s=>wrap(s,maxW,400,22).forEach(l=>{y+=30;T(l,hx,y,400,22,'#444',ha)}));
 y=Math.max(y,lb)+26;hr(M,W-M,y,AC,4);y+=60;
 T(S.gstin?'TAX INVOICE':'INVOICE',M,y,700,38,AC);y+=20;
 /* bill-to (left) + meta (right) */
 let yl=y,yr=y;T('BILL TO',M,yl+26,700,20,'#777');yl+=64;T(inv.cust.name,M,yl,700,30);
 [inv.cust.phone&&'Phone: '+inv.cust.phone,inv.cust.email&&'Email: '+inv.cust.email,inv.cust.address&&'Address: '+inv.cust.address,inv.cust.gstin&&'GSTIN: '+inv.cust.gstin]
  .filter(Boolean).forEach(s=>wrap(s,600,400,23).forEach(l=>{yl+=32;T(l,M,yl,400,23,'#333')}));
 [['Invoice No',inv.no],['Date',fd(inv.date)],inv.due&&['Due Date',fd(inv.due)],['Status',inv.status.toUpperCase()],['Payment',inv.method]].filter(Boolean)
  .forEach(([k,v])=>{yr+=38;T(k,W-M-360,yr,400,23,'#666');T(v,W-M,yr,700,25,'#111','right')});
 y=Math.max(yl,yr)+50;
 /* items table */
 const cols=[['S.No.',70,'center'],['Description / Work Details',520,'left'],['Qty',90,'right'],['Unit',110,'center'],['Rate',150,'right'],['Amount',160,'right']],xs=[];
 let a=M;cols.forEach(c=>{xs.push(a);a+=c[1]});
 const cx=i=>cols[i][2]==='left'?xs[i]+14:cols[i][2]==='right'?xs[i]+cols[i][1]-14:xs[i]+cols[i][1]/2;
 const head=()=>{g.fillStyle=AC;g.fillRect(M,y,CW,56);cols.forEach((c,i)=>T(c[0],cx(i),y+37,700,22,'#fff',c[2]));y+=56};
 head();
 inv.items.forEach((it,i)=>{
  const dl=wrap(it.d,cols[1][1]-28,400,23),rh=Math.max(58,dl.length*32+26);
  if(y+rh>FT){page();head()}
  if(i%2){g.fillStyle='#f5f7fb';g.fillRect(M,y,CW,rh)}
  const q=parseFloat(it.qty)||0;
  T(String(i+1),cx(0),y+37,400,23,'#333','center');
  dl.forEach((l,k)=>T(l,cx(1),y+37+k*32,400,23));
  T(String(q),cx(2),y+37,400,23,'#111','right');T(it.unit||'',cx(3),y+37,400,23,'#333','center');
  T(money(P(it.rate)),cx(4),y+37,400,23,'#111','right');T(money(Math.round(q*P(it.rate))),cx(5),y+37,700,23,'#111','right');
  hr(M,W-M,y+rh,'#e1e5ee');y+=rh});
 /* totals (right) + payment status & UPI QR (left) */
 const rows=[['Subtotal',money(t.sub)]];
 if(t.disc)rows.push(['Discount'+(inv.discType==='%'?` (${inv.disc}%)`:''),'- '+money(t.disc)]);
 if(t.tax)rows.push([`Tax (${inv.tax}%)`,money(t.tax)]);
 if(P(inv.ship))rows.push(['Shipping / Delivery',money(P(inv.ship))]);
 if(P(inv.other))rows.push(['Other Charges',money(P(inv.other))]);
 if(P(inv.prev))rows.push(['Previous Balance',money(P(inv.prev))]);
 if(t.ro)rows.push(['Round-off',money(t.ro)]);
 const showQR=inv.qr&&S.upi;
 y+=24;need(Math.max(rows.length*44+190,showQR?360:0));
 const tx=W-M-500;let ty=y;
 rows.forEach(([k,v])=>{ty+=44;T(k,tx,ty,400,24,'#444');T(v,W-M,ty,400,24,'#111','right')});
 ty+=16;g.fillStyle=AC;g.fillRect(tx-14,ty,528,64);T('TOTAL',tx,ty+43,700,28,'#fff');T(money(t.total),W-M,ty+43,700,30,'#fff','right');ty+=64;
 if(t.paid){ty+=44;T('Amount Paid',tx,ty,400,24,'#444');T(money(t.paid),W-M,ty,700,24,'#15803d','right')}
 ty+=54;T('Balance Due',tx,ty,700,28,'#b91c1c');T(money(t.bal),W-M,ty,700,32,t.bal>0?'#b91c1c':'#15803d','right');
 const col={Paid:'#15803d','Partially Paid':'#b45309',Unpaid:'#b91c1c'}[inv.status]||'#475569',lab=inv.status.toUpperCase();
 F(700,24);const bw=g.measureText(lab).width+50;g.strokeStyle=col;g.lineWidth=4;g.strokeRect(M,y+8,bw,58);T(lab,M+bw/2,y+47,700,24,col,'center');
 let ly=y+96;
 if(showQR){
  T('UPI ID: '+S.upi,M,ly+20,400,22,'#333');ly+=34;
  if(window.qrcode){try{const amt=t.bal>0?t.bal:t.total,uri=`upi://pay?pa=${S.upi}&pn=${encodeURIComponent(S.name||'Business')}&am=${(amt/100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.no)}`;
   const q=qrcode(0,'M');q.addData(uri);q.make();const n=q.getModuleCount(),sz=220,c=sz/n;g.fillStyle='#000';
   for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))g.fillRect(M+Math.floor(k*c),ly+Math.floor(r*c),Math.ceil(c),Math.ceil(c));
   T('Scan to pay via UPI',M,ly+sz+30,400,20,'#555');ly+=sz+40}catch(e){console.error(e)}}}
 y=Math.max(ty,ly)+50;
 /* notes, terms, signature */
 const block=(h,s)=>{if(!s)return;need(80);T(h,M,y+24,700,22,AC);y+=44;wrap(s,CW,400,22).forEach(l=>{need(34);T(l,M,y+14,400,22,'#444');y+=30});y+=16};
 block('Notes',inv.notes);block('Terms & Conditions',S.terms);
 if(S.signOn){need(200);const sx=W-M-380;
  if(sign){let sw=300,sh=sw*sign.height/sign.width;if(sh>110){sh=110;sw=sh*sign.width/sign.height}g.drawImage(sign,sx+(380-sw)/2,y+10,sw,sh)}
  hr(sx,W-M,y+130,'#333');T('Authorized Signature',sx+190,y+164,400,22,'#333','center')}
 pages.forEach((p,i)=>{g=p.getContext('2d');hr(M,W-M,H-M-30,'#ccc');T(S.footer||'',W/2,H-M+6,400,22,'#666','center');T(`Page ${i+1} of ${pages.length}`,W-M,H-M+6,400,20,'#888','right')});
 return pages;
}
function makePDF(pages){
 const enc=new TextEncoder(),parts=[],off=[];let len=0;
 const add=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);len+=b.length};
 const obj=(n,body,stream)=>{off[n]=len;add(`${n} 0 obj\n${body}\n`);if(stream){add('stream\n');add(stream);add('\nendstream\n')}add('endobj\n')};
 const N=2+3*pages.length;
 add('%PDF-1.4\n');
 obj(1,'<</Type/Catalog/Pages 2 0 R>>');
 obj(2,`<</Type/Pages/Count ${pages.length}/Kids[${pages.map((_,i)=>`${3+3*i} 0 R`).join(' ')}]>>`);
 pages.forEach((c,i)=>{
  const b64=c.toDataURL('image/jpeg',.92).split(',')[1],jpg=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0)),cs='q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
  obj(3+3*i,`<</Type/Page/Parent 2 0 R/MediaBox[0 0 595.28 841.89]/Resources<</XObject<</Im0 ${5+3*i} 0 R>>>>/Contents ${4+3*i} 0 R>>`);
  obj(4+3*i,`<</Length ${cs.length}>>`,cs);
  obj(5+3*i,`<</Type/XObject/Subtype/Image/Width ${c.width}/Height ${c.height}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpg.length}>>`,jpg)});
 const xr=len;add(`xref\n0 ${N+1}\n0000000000 65535 f \n`);
 for(let n=1;n<=N;n++)add(String(off[n]).padStart(10,'0')+' 00000 n \n');
 add(`trailer\n<</Size ${N+1}/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`);
 return new Blob(parts,{type:'application/pdf'});
}
async function pdfBlob(inv){try{return makePDF(await renderPages(inv))}catch(e){console.error(e);toast('Could not generate PDF. Please try again.');return null}}
function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
async function doPdf(inv,mode){
 const b=await pdfBlob(inv);if(!b)return;const name=inv.no.replace(/[^\w.-]+/g,'_')+'.pdf';
 if(mode==='share'){const f=new File([b],name,{type:'application/pdf'});
  if(navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:inv.no});return}catch(e){if(e.name==='AbortError')return}}
  toast('Sharing not supported here – downloading instead')}
 dl(b,name);toast('PDF generated ✓');
}
async function doPrint(inv){
 try{const pg=await renderPages(inv),a=$('#printArea');
  a.replaceChildren(...pg.map(c=>{const i=new Image();i.src=c.toDataURL('image/jpeg',.92);return i}));
  await Promise.all([...a.children].map(i=>i.decode?i.decode().catch(()=>{}):0));window.print()}
 catch(e){console.error(e);toast('Could not open print view')}
}
async function viewInv(inv){
 try{const d=$('#dlg');d.innerHTML=`<form method="dialog" class="vh"><b>${esc(inv.no)}</b><button class="btn sm">Close</button></form><div id="vpv"></div>`;
  (await renderPages(inv)).forEach(c=>$('#vpv').append(c));d.onclose=null;d.returnValue='';d.showModal()}
 catch(e){toast('Could not open preview')}
}

/* ---------- UI: helpers ---------- */
const I=(n,l,t='text')=>`<label>${l}<input name="${n}" type="${t}" autocomplete="off"></label>`;
const N=(n,l)=>`<label>${l}<input name="${n}" type="number" min="0" step="any" inputmode="decimal"></label>`;
const opt=a=>a.map(x=>`<option>${x}</option>`).join('');
const TAG={Paid:'ok','Partially Paid':'wa',Unpaid:'er',Pending:'mu'};
const empty=(a,b)=>`<div class="empty"><div class="ei">🧾</div><h3>${a}</h3><p>${b}</p><button class="btn pri" data-go="create">+ Create Bill</button></div>`;
const getP=(o,p)=>p.split('.').reduce((a,k)=>a?a[k]:undefined,o);
const setP=(o,p,v)=>{const ks=p.split('.'),l=ks.pop();ks.reduce((a,k)=>a[k],o)[l]=v};
const rowHTML=(i,full)=>{const t=calc(i);return`<div class="row card"><div class="rt"><b>${esc(i.no)}</b><span class="tag ${TAG[i.status]||'mu'}">${esc(i.status)}</span></div><div class="rs">${esc(i.cust.name)} · ${fd(i.date)}</div><div class="rt"><b class="big">${money(t.total)}</b>${t.bal>0?`<span class="mu">Due ${money(t.bal)}</span>`:''}</div>${full?`<div class="ra" data-id="${i.id}"><button data-a="view">View</button><button data-a="edit">Edit</button><button data-a="dup">Duplicate</button><button data-a="pdf">PDF</button><button data-a="del" class="danger">Delete</button></div>`:''}</div>`};
const TITLES={dashboard:'Dashboard',create:'Create Bill',history:'Invoice History',customers:'Customers',settings:'Settings'};
function go(v,keep){
 if(v==='create'&&!keep&&(!cur||DB.invoices.some(i=>i.id===cur.id)))cur=blank();
 $$('.view').forEach(s=>s.hidden=s.id!=='v-'+v);
 $$('.bar button').forEach(b=>b.classList.toggle('on',b.dataset.go===v));
 $('#title').textContent=TITLES[v];
 ({dashboard:dash,create:fill,history:renderHistory,customers:renderCust,settings:fillSettings})[v]();
 scrollTo(0,0);
}

/* ---------- UI: dashboard / history / customers ---------- */
function dash(){
 const v=DB.invoices,td=today();let tot=0,paid=0;v.forEach(i=>{const t=calc(i);tot+=t.total;paid+=t.paid});
 $('#v-dashboard').innerHTML=v.length?`<div class="cards"><div class="card stat"><small>Total Invoices</small><b>${v.length}</b></div><div class="card stat"><small>Today's Invoices</small><b>${v.filter(i=>i.date===td).length}</b></div><div class="card stat"><small>Total Sales</small><b>${money(tot)}</b></div><div class="card stat"><small>Paid Amount</small><b>${money(paid)}</b></div><div class="card stat"><small>Pending Amount</small><b>${money(tot-paid)}</b></div></div><h3>Recent Invoices</h3>${v.slice(0,5).map(i=>rowHTML(i)).join('')}`:empty('No invoices yet','Create your first bill to get started.');
}
function renderHistory(){
 const q=$('#hq').value.toLowerCase().trim(),qd=q.replace(/\D/g,''),f=$('#hf').value,d=$('#hd').value;
 const l=DB.invoices.filter(i=>(!f||i.status===f)&&(!d||i.date===d)&&(!q||i.no.toLowerCase().includes(q)||i.cust.name.toLowerCase().includes(q)||(qd&&i.cust.phone.replace(/\D/g,'').includes(qd))));
 $('#hl').innerHTML=l.length?l.map(i=>rowHTML(i,1)).join(''):DB.invoices.length?'<p class="mu">No invoices match your search.</p>':empty('No invoices yet','Create your first bill to get started.');
}
function renderCust(){
 const m=new Map();
 DB.invoices.forEach(i=>{const k=i.cust.phone.replace(/\D/g,'')||i.cust.name.toLowerCase(),c=m.get(k)||{name:i.cust.name,phone:i.cust.phone,n:0,billed:0,paid:0},t=calc(i);c.n++;c.billed+=t.total;c.paid+=t.paid;m.set(k,c)});
 const c=[...m.values()];
 $('#v-customers').innerHTML=c.length?c.map(x=>`<div class="row card" data-q="${esc(x.phone||x.name)}"><div class="rt"><b>${esc(x.name)}</b><span class="mu">${esc(x.phone)}</span></div><div class="rs">${x.n} invoice${x.n>1?'s':''} · Billed ${money(x.billed)}</div><div class="rt"><span class="tag ok">Paid ${money(x.paid)}</span><span class="tag ${x.billed>x.paid?'er':'mu'}">Pending ${money(x.billed-x.paid)}</span></div></div>`).join(''):empty('No customers yet','Customers appear here after you create bills.');
}

/* ---------- UI: create / edit invoice ---------- */
function buildCreate(){
 $('#v-create').innerHTML=`<div class="seg"><button data-t="edit" class="on">Edit</button><button data-t="prev">Preview</button></div><div class="split"><div id="edit"><div id="err" class="err" role="alert" hidden></div>
 <fieldset><legend>Invoice</legend><div class="g2">${I('no','Invoice No')}${I('date','Bill Date','date')}${I('due','Due Date','date')}</div></fieldset>
 <fieldset><legend>Bill To</legend>${I('cust.name','Customer Name *')}<div class="g2">${I('cust.phone','Phone *','tel')}${I('cust.wa','WhatsApp','tel')}</div>${I('cust.email','Email','email')}${I('cust.address','Address')}${I('cust.gstin','GSTIN (optional)')}</fieldset>
 <fieldset><legend>Items</legend><div id="items"></div><button type="button" class="btn" id="addItem">+ Add Item</button></fieldset>
 <fieldset><legend>Charges &amp; Discount</legend><div class="g2">${N('disc','Discount')}<label>Discount type<select name="discType"><option value="%">Percent (%)</option><option value="amt">Amount</option></select></label>${N('tax','Tax %')}${N('ship','Shipping / Delivery')}${N('other','Other Charges')}${N('prev','Previous Balance')}</div><label class="chk"><input type="checkbox" name="round"> Round-off total to nearest rupee</label></fieldset>
 <fieldset><legend>Payment</legend><div class="g2"><label>Status<select name="status">${opt(ST)}</select></label><label>Method<select name="method">${opt(MT)}</select></label>${N('paid','Amount Paid / Advance')}</div><label class="chk"><input type="checkbox" name="qr"> Show UPI QR on invoice</label></fieldset>
 <fieldset><legend>Notes</legend><textarea name="notes" rows="2"></textarea></fieldset><div id="sum" class="card sum"></div></div>
 <div id="prev"><div id="pv"></div></div></div>
 <div class="acts"><button class="btn pri" id="bSave">Save</button><button class="btn" id="bPdf">PDF</button><button class="btn" id="bPrint">Print</button><button class="btn" id="bShare">Share</button></div>`;
 const v=$('#v-create');
 v.addEventListener('input',e=>{
  const el=e.target;
  if(el.dataset.i!==undefined){const it=cur.items[el.dataset.i];it[el.dataset.f]=el.value;el.closest('.item').querySelector('.amt').textContent=money(Math.round((parseFloat(it.qty)||0)*P(it.rate)))}
  else if(el.name){setP(cur,el.name,el.type==='checkbox'?el.checked:el.value);if(el.name==='paid')autoStatus()}
  update();
 });
 v.addEventListener('click',e=>{
  const s=e.target.closest('[data-t]');if(s){v.classList.toggle('tp',s.dataset.t==='prev');$$('.seg button').forEach(b=>b.classList.toggle('on',b===s));if(s.dataset.t==='prev')refreshPreview();return}
  const b=e.target.closest('[data-a]');if(!b)return;
  const i=+b.dataset.i,a=b.dataset.a,it=cur.items;
  if(a==='del'){it.splice(i,1);if(!it.length)it.push({d:'',qty:1,unit:'Piece',rate:''})}
  else if(a==='dup')it.splice(i+1,0,{...it[i]});
  else if(a==='up'&&i>0){const x=it[i-1];it[i-1]=it[i];it[i]=x}
  renderItems();update();
 });
 $('#addItem').onclick=()=>{cur.items.push({d:'',qty:1,unit:'Piece',rate:''});renderItems();update();const l=$$('#items .item:last-child input')[0];if(l)l.focus()};
 $('#bSave').onclick=()=>saveInv();
 $('#bPdf').onclick=()=>saveInv()&&doPdf(cur,'dl');
 $('#bPrint').onclick=()=>saveInv()&&doPrint(cur);
 $('#bShare').onclick=()=>saveInv()&&doPdf(cur,'share');
}
function autoStatus(){const p=P(cur.paid),t=calc({...cur,status:'Unpaid',paid:''}).total;if(p<=0)return;cur.status=p>=t&&t>0?'Paid':'Partially Paid';$('#edit [name=status]').value=cur.status}
function renderItems(){
 $('#items').innerHTML=cur.items.map((it,i)=>`<div class="item"><div class="ih"><b>#${i+1}</b><span class="amt">${money(Math.round((parseFloat(it.qty)||0)*P(it.rate)))}</span><button type="button" class="ic" data-a="up" data-i="${i}" aria-label="Move item up">↑</button><button type="button" class="ic" data-a="dup" data-i="${i}" aria-label="Duplicate item">⧉</button><button type="button" class="ic" data-a="del" data-i="${i}" aria-label="Delete item">🗑</button></div>
 <input data-i="${i}" data-f="d" placeholder="Description / work details" value="${esc(it.d)}" aria-label="Description">
 <div class="g3"><input data-i="${i}" data-f="qty" type="number" min="0" step="any" inputmode="decimal" placeholder="Qty" value="${esc(it.qty)}" aria-label="Quantity"><input data-i="${i}" data-f="unit" placeholder="Unit" value="${esc(it.unit)}" aria-label="Unit"><input data-i="${i}" data-f="rate" type="number" min="0" step="any" inputmode="decimal" placeholder="Rate" value="${esc(it.rate)}" aria-label="Rate"></div></div>`).join('');
}
function fill(){
 $$('#edit [name]').forEach(el=>{const v=getP(cur,el.name);if(el.type==='checkbox')el.checked=!!v;else el.value=v==null?'':v});
 $('#err').hidden=true;renderItems();update();
}
function update(){
 const t=calc(cur),r=(k,v,c='')=>`<div class="${c}"><span>${k}</span><b>${v}</b></div>`;
 $('#sum').innerHTML=r('Subtotal',money(t.sub))+(t.disc?r('Discount','- '+money(t.disc)):'')+(t.tax?r('Tax',money(t.tax)):'')+r('Total',money(t.total),'tot')+r('Paid',money(t.paid))+r('Balance',money(t.bal));
 pvDeb();
}
async function refreshPreview(){
 const tk=++pvTk;try{const pg=await renderPages(cur);if(tk===pvTk)$('#pv').replaceChildren(...pg)}catch(e){console.error(e)}
}
const pvDeb=deb(refreshPreview,300);
function saveInv(){
 const e=validate(cur),box=$('#err');
 if(e.length){box.innerHTML='<b>Please fix:</b><ul>'+e.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';box.hidden=false;box.scrollIntoView({block:'center'});return false}
 box.hidden=true;
 const i=DB.invoices.findIndex(x=>x.id===cur.id),c=clone(cur);
 if(i>=0)DB.invoices[i]=c;else{DB.invoices.unshift(c);const m=cur.no.match(/^(.*?)(\d+)$/);if(m&&m[1]===DB.settings.prefix&&+m[2]>=(parseInt(DB.settings.next)||1))DB.settings.next=+m[2]+1}
 if(!save())return false;toast('Invoice saved ✓');return true;
}

/* ---------- UI: settings ---------- */
const BF=[['name','Business Name'],['owner','Owner Name'],['phone','Phone','tel'],['wa','WhatsApp','tel'],['email','Email','email'],['address','Address'],['gstin','GSTIN (optional)'],['pan','PAN (optional)'],['upi','UPI ID (optional)'],['web','Website (optional)']];
function buildSettings(){
 $('#v-settings').innerHTML=`<fieldset><legend>Business</legend>${BF.map(([n,l,t])=>I(n,l,t)).join('')}</fieldset>
 <fieldset><legend>Invoice</legend><div class="g2"><label>Prefix<input name="prefix"></label><label>Next invoice number<input name="next" type="number" min="1"></label>
 <label>Date format<select name="dfmt"><option>DD/MM/YYYY</option><option>DD MMM YYYY</option></select></label><label>Currency symbol<select name="cur"><option>₹</option><option>Rs.</option></select></label>
 <label>Default status<select name="status">${opt(ST)}</select></label><label>Default payment method<select name="method">${opt(MT)}</select></label></div></fieldset>
 <fieldset><legend>PDF Design</legend><label>Logo<input type="file" id="fLogo" accept="image/*"></label><button class="btn sm" id="rLogo">Remove logo</button>
 <div class="g2"><label>Logo size<input name="logoSize" type="range" min="40" max="120"></label><label>Logo position<select name="logoPos"><option>left</option><option>center</option><option>right</option></select></label></div>
 <label>Signature<input type="file" id="fSign" accept="image/*"></label><button class="btn sm" id="rSign">Remove signature</button>
 <label class="chk"><input type="checkbox" name="signOn"> Show signature block</label><label class="chk"><input type="checkbox" name="qr"> Show UPI QR by default</label>
 <label>Default notes<textarea name="notes" rows="2"></textarea></label><label>Terms &amp; conditions<textarea name="terms" rows="5"></textarea></label>${I('footer','Invoice footer text')}</fieldset>
 <fieldset><legend>Data</legend><div class="btns"><button class="btn" id="dExp">Export Backup</button><button class="btn" id="dImp">Import Backup</button><input type="file" id="fImp" accept=".json,application/json" hidden><button class="btn" id="dSample">Add sample invoice</button><button class="btn" id="dRmSample">Remove sample data</button><button class="btn danger" id="dReset">Reset settings</button><button class="btn danger" id="dClear">Clear all data</button></div></fieldset>
 <button class="btn pri" id="sSave" style="width:100%">Save Settings</button>`;
 const v=$('#v-settings');
 v.addEventListener('input',e=>{const el=e.target;if(!el.name)return;DB.settings[el.name]=el.type==='checkbox'?el.checked:(el.type==='number'||el.type==='range')?+el.value:el.value;saveDeb()});
 const img=(id,key)=>$(id).onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{DB.settings[key]=await resizeImg(f,500);save();toast('Image saved ✓')}catch(_){toast('Could not read that image')}};
 img('#fLogo','logo');img('#fSign','sign');
 $('#rLogo').onclick=()=>{DB.settings.logo='';save();toast('Logo removed')};
 $('#rSign').onclick=()=>{DB.settings.sign='';save();toast('Signature removed')};
 $('#sSave').onclick=()=>{if(save())toast('Settings saved ✓')};
 $('#dExp').onclick=()=>{dl(new Blob([JSON.stringify({app:'billbook',version:1,settings:DB.settings,invoices:DB.invoices},null,1)],{type:'application/json'}),`billbook-backup-${today()}.json`);toast('Backup exported ✓')};
 $('#dImp').onclick=()=>$('#fImp').click();
 $('#fImp').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const d=JSON.parse(await f.text());if(!Array.isArray(d.invoices)||!d.settings||typeof d.settings!=='object')throw new Error('bad');
   if(!await ask('Replace all current data with this backup?','Restore'))return;
   DB={settings:{...DEF,...d.settings},invoices:d.invoices};cur=null;save();fillSettings();toast('Backup restored ✓')}
  catch(_){toast('Invalid backup file')}};
 $('#dSample').onclick=()=>{const i=blank();Object.assign(i,{sample:true,cust:{name:'Rahul Kumar',phone:'9876543210',wa:'',email:'',address:'Sample address',gstin:''},items:[{d:'Website Design',qty:1,unit:'Job',rate:5000},{d:'Maintenance',qty:2,unit:'Month',rate:1000}]});DB.invoices.unshift(i);save();toast('Sample invoice added')};
 $('#dRmSample').onclick=()=>{DB.invoices=DB.invoices.filter(i=>!i.sample);save();toast('Sample data removed')};
 $('#dReset').onclick=async()=>{if(await ask('Reset all settings to defaults?','Reset')){DB.settings={...DEF};save();fillSettings();toast('Settings reset')}};
 $('#dClear').onclick=async()=>{if(await ask('Delete ALL invoices and settings? This cannot be undone.','Clear all')){DB={settings:{...DEF},invoices:[]};cur=null;save();fillSettings();toast('All data cleared')}};
}
function fillSettings(){$$('#v-settings [name]').forEach(el=>{const v=DB.settings[el.name];if(el.type==='checkbox')el.checked=!!v;else el.value=v==null?'':v})}
function resizeImg(file,max){return new Promise((res,rej)=>{
 if(!file.type.startsWith('image/'))return rej();
 const r=new FileReader();r.onerror=rej;
 r.onload=()=>{const i=new Image();i.onerror=rej;i.onload=()=>{const s=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=Math.round(i.width*s);c.height=Math.round(i.height*s);c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/png'))};i.src=r.result};
 r.readAsDataURL(file)})}

/* ---------- init + PWA ---------- */
function theme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('billbook.theme',t)}catch(_){}$('#themeBtn').textContent=t==='dark'?'☀️ Light':'🌙 Dark'}
function init(){
 load();
 let t='light';try{t=localStorage.getItem('billbook.theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')}catch(_){}
 theme(t);$('#themeBtn').onclick=()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark');
 $('#v-history').innerHTML=`<div class="filters"><input id="hq" type="search" placeholder="Search invoice no, name or phone" aria-label="Search invoices"><select id="hf" aria-label="Filter by status"><option value="">All statuses</option>${opt(ST)}</select><input id="hd" type="date" aria-label="Filter by date"></div><div id="hl"></div>`;
 $('#v-history').addEventListener('input',renderHistory);
 $('#v-history').addEventListener('click',async e=>{
  const b=e.target.closest('[data-a]');if(!b)return;
  const id=b.parentElement.dataset.id,inv=DB.invoices.find(x=>x.id===id),a=b.dataset.a;if(!inv)return;
  if(a==='view')viewInv(inv);
  else if(a==='pdf')doPdf(inv,'dl');
  else if(a==='edit'){cur=clone(inv);go('create',1)}
  else if(a==='dup'){cur=clone(inv);Object.assign(cur,{id:Date.now().toString(36),no:nextNo(),date:today(),paid:'',status:DB.settings.status,sample:false,created:Date.now()});go('create',1);toast('Duplicated – review and save')}
  else if(a==='del'&&await ask('Delete this invoice?')){DB.invoices=DB.invoices.filter(x=>x.id!==id);save();renderHistory();toast('Invoice deleted')}
 });
 $('#v-customers').addEventListener('click',e=>{const r=e.target.closest('[data-q]');if(r){go('history');$('#hq').value=r.dataset.q;renderHistory()}});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b)go(b.dataset.go)});
 buildCreate();buildSettings();
 if(!DB.settings.name&&!DB.invoices.length){go('settings');toast('Start by adding your business details')}else go('dashboard');
 if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
 let ip;addEventListener('beforeinstallprompt',e=>{e.preventDefault();ip=e;$('#installBtn').hidden=false});
 $('#installBtn').onclick=async()=>{if(!ip)return;ip.prompt();await ip.userChoice;ip=null;$('#installBtn').hidden=true};
 addEventListener('appinstalled',()=>{$('#installBtn').hidden=true;toast('App installed ✓')});
}
init();
