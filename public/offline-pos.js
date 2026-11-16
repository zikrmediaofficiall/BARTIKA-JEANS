(() => {
  const DB_NAME = "bartika-offline-pos";
  const DB_VERSION = 1;
  const $ = (id) => document.getElementById(id);
  let catalog = [];
  let maxDiscount = 0;
  let cart = [];
  let syncing = false;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("catalog")) db.createObjectStore("catalog", { keyPath: "key" });
        if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "idempotency_key" });
      };
      request.onsuccess = () => {
        if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }
  async function getStore(store, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const result = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error);
    });
  }
  const getCatalog = () => getStore("catalog","readonly",s=>s.get("latest"));
  const getSales = () => getStore("sales","readonly",s=>s.getAll());
  const putSale = (sale) => getStore("sales","readwrite",s=>s.put(sale));

  const money = (n) => Number(n || 0).toFixed(2) + " ج.م";
  const total = () => Math.round(cart.reduce((s,x)=>s+x.price*x.qty,0)*(1-Number($("discount").value||0)/100)*100)/100;
  const firstPaid = () => $("paid").value === ""
    ? (Number($("secondPaid").value || 0) > 0 ? 0 : total())
    : Number($("paid").value || 0);
  const paid = () => firstPaid() + Number($("secondPaid").value || 0);

  function renderCatalog() {
    const query = $("search").value.trim().toLowerCase();
    const root = $("catalog");
    root.replaceChildren();
    catalog.filter(x => (x.product_name+" "+x.sku+" "+x.barcode+" "+(x.size||"")+" "+(x.color||"")).toLowerCase().includes(query))
      .slice(0,60).forEach(item => {
        const card = document.createElement("div");
        card.className = "product";
        const name = document.createElement("b"); name.textContent = item.product_name;
        const meta = document.createElement("p"); meta.className="muted";
        meta.textContent = [item.sku,item.barcode,item.size,item.color].filter(Boolean).join(" · ");
        const price = document.createElement("p"); price.textContent=money(item.price);
        const stock = document.createElement("p"); stock.className="muted";
        stock.textContent="آخر كمية متاحة محفوظة: "+item.stock;
        const btn = document.createElement("button"); btn.textContent="أضف";
        btn.disabled = Number(item.stock)<1;
        btn.addEventListener("click",()=>add(item));
        card.append(name,meta,price,stock,btn); root.append(card);
      });
    if (!root.children.length) root.textContent="لا توجد أصناف مطابقة في الكتالوج المحفوظ.";
  }

  function add(item) {
    const found=cart.find(x=>x.variant_id===item.variant_id);
    if(found) found.qty=Math.min(Number(item.stock),found.qty+1);
    else cart.push({variant_id:item.variant_id,name:item.product_name,price:Number(item.price),qty:1,stock:Number(item.stock)});
    renderCart();
  }

  function renderCart() {
    const root=$("cart"); root.replaceChildren();
    cart.forEach(item=>{
      const line=document.createElement("div"); line.className="line";
      const title=document.createElement("b"); title.textContent=item.name;
      const amount=document.createElement("p"); amount.className="muted"; amount.textContent=money(item.price)+" × "+item.qty;
      const actions=document.createElement("div"); actions.className="actions";
      const less=document.createElement("button"); less.className="secondary"; less.textContent="−"; less.addEventListener("click",()=>{item.qty=Math.max(1,item.qty-1);renderCart()});
      const more=document.createElement("button"); more.className="secondary"; more.textContent="+"; more.disabled=item.qty>=item.stock; more.addEventListener("click",()=>{item.qty=Math.min(item.stock,item.qty+1);renderCart()});
      const remove=document.createElement("button"); remove.className="danger"; remove.textContent="حذف"; remove.addEventListener("click",()=>{cart=cart.filter(x=>x.variant_id!==item.variant_id);renderCart()});
      actions.append(less,more,remove); line.append(title,amount,actions); root.append(line);
    });
    $("cartCount").textContent=cart.length+" أصناف";
    $("total").textContent=money(total());
    $("due").textContent=money(Math.max(0,total()-paid()));
  }

  async function renderQueue() {
    const sales=(await getSales()).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    const pending=sales.filter(x=>x.status!=="synced");
    $("queueMeta").textContent=pending.length+" عمليات غير معتمدة";
    const root=$("queue"); root.replaceChildren();
    pending.forEach(sale=>{
      const row=document.createElement("div"); row.className="line"; row.style.marginBottom="8px";
      const title=document.createElement("b"); title.textContent="عملية "+sale.idempotency_key.slice(0,8)+" · "+(sale.status==="needs_review"?"تحتاج مراجعة":"بانتظار المزامنة");
      const desc=document.createElement("p"); desc.className="muted"; desc.textContent=new Date(sale.created_at).toLocaleString("ar-EG")+" · "+sale.payload.items.length+" أصناف";
      const error=document.createElement("p"); error.className="muted"; error.textContent=sale.error||"";
      row.append(title,desc,error); root.append(row);
    });
    if(!pending.length) root.textContent="لا توجد عمليات معلّقة.";
    $("sync").disabled=!navigator.onLine||!sales.some(x=>x.status==="pending");
  }

  async function saveSale() {
    $("message").textContent="";
    if(!cart.length){$("message").textContent="أضف صنفًا أولًا";return}
    const discount=Number($("discount").value||0);
    if(discount<0||discount>maxDiscount){$("message").textContent="تجاوزت حد الخصم المحفوظ لهذا الحساب";return}
    const firstAmount=firstPaid();
    const secondAmount=Number($("secondPaid").value||0);
    const due=total()-(firstAmount+secondAmount);
    if((firstAmount+secondAmount)<=0||due < -0.009){$("message").textContent="راجع إجمالي المدفوع";return}
    if(due>0.009&&!$("customer").value.trim()){$("message").textContent="رقم العميل مطلوب عند وجود باقي";return}
    const payload={
      idempotency_key:crypto.randomUUID(),
      items:cart.map(x=>({variant_id:x.variant_id,quantity:x.qty})),
      payments:[
        ...(firstAmount>0?[{method:$("method").value,amount:firstAmount,reference:$("reference").value.trim()}]:[]),
        ...(secondAmount>0?[{method:$("secondMethod").value,amount:secondAmount,reference:$("reference").value.trim()}]:[])
      ],
      discount_percent:discount,
      customer_phone:$("customer").value.trim()||undefined
    };
    await putSale({idempotency_key:payload.idempotency_key,payload,created_at:new Date().toISOString(),status:"pending"});
    cart=[];$("paid").value="";$("secondPaid").value="0";$("customer").value="";$("reference").value="";$("discount").value="0";
    renderCart();await renderQueue();
    $("message").textContent="تم حفظ العملية محليًا. ليست فاتورة معتمدة حتى تنجح المزامنة.";
  }

  async function syncSales() {
    if(syncing) return;
    if(!navigator.onLine){$("message").textContent="لا يوجد اتصال بالإنترنت";return}
    syncing=true;
    $("sync").disabled=true;
    try {
    const sales=(await getSales()).sort((a,b)=>a.created_at.localeCompare(b.created_at));
    for(const sale of sales){
      if(sale.status!=="pending")continue;
      try{
        const response=await fetch("/api/offline-sales/sync",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify(sale.payload)});
        const body=await response.json().catch(()=>({}));
        if(response.status===401){$("message").textContent=body.error||"سجل الدخول من جديد ثم أعد المزامنة";break}
        if(!response.ok){
          await putSale({...sale,status:"needs_review",error:body.error||"تعذر اعتماد العملية؛ راجع المخزون والوردية."});
          continue;
        }
        const result=body.sale&&typeof body.sale==="object"?body.sale:{};
        await putSale({...sale,status:"synced",error:"",sale_id:result.id,invoice_number:result.invoice_number});
      }catch(error){
        await putSale({...sale,status:"pending",error:error instanceof Error?error.message:"تعذر الاتصال بالخادم"});
        break;
      }
    }
    await renderQueue();
    $("message").textContent="اكتملت محاولة المزامنة. العمليات المعتمدة فقط لها رقم فاتورة من الخادم.";
    } finally {
      syncing=false;
      await renderQueue();
    }
  }

  async function init(){
    try{
      const saved=await getCatalog();
      if(!saved||!Array.isArray(saved.items)||!saved.items.length){
        $("catalogMeta").textContent="لا يوجد كتالوج محفوظ. اتصل بالإنترنت وافتح نقطة البيع العادية مرة واحدة.";
      }else{
        catalog=saved.items;maxDiscount=Number(saved.maxDiscount||0);
        $("discount").max=String(maxDiscount);
        $("catalogMeta").textContent="آخر تحديث: "+new Date(saved.updatedAt).toLocaleString("ar-EG")+" · حد الخصم المحفوظ: "+maxDiscount+"%";
        renderCatalog();
      }
    }catch(error){$("catalogMeta").textContent="تعذر قراءة الكتالوج المحلي: "+(error?.message||"");}
    await renderQueue();renderCart();
    updateConnection();
    if(navigator.onLine) void syncSales();
  }
  function updateConnection(){
    const online=navigator.onLine;
    $("connection").textContent=online?"متصل — يمكنك المزامنة":"دون اتصال — حفظ محلي";
    $("connection").style.background=online?"#dcfce7":"#fef3c7";
    $("connection").style.color=online?"#166534":"#92400e";
    $("sync").disabled=!online;
  }

  $("search").addEventListener("input",renderCatalog);
  ["discount","paid","secondPaid"].forEach(id=>$(id).addEventListener("input",renderCart));
  $("saveSale").addEventListener("click",saveSale);
  $("sync").addEventListener("click",syncSales);
  window.addEventListener("online",()=>{updateConnection();void syncSales()});
  window.addEventListener("focus",()=>{if(navigator.onLine)void syncSales()});
  window.addEventListener("offline",updateConnection);
  init();
})();