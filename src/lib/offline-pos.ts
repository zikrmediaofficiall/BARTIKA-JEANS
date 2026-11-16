export type OfflineSalePayload = {
  idempotency_key: string;
  items: { variant_id: string; quantity: number }[];
  payments: { method: "cash" | "instapay" | "visa"; amount: number; reference?: string }[];
  discount_percent: number;
  customer_phone?: string;
};

export type OfflineSaleRecord = {
  idempotency_key: string;
  payload: OfflineSalePayload;
  created_at: string;
  status: "pending" | "needs_review" | "synced";
  error?: string;
  invoice_number?: number;
  sale_id?: string;
};

export type CachedCatalog = {
  key: "latest";
  items: {
    variant_id: string;
    product_name: string;
    sku: string;
    barcode: string;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
  }[];
  maxDiscount: number;
  updatedAt: string;
};

const DB_NAME = "bartika-offline-pos";
const DB_VERSION = 1;
let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("التخزين المحلي غير متاح على هذا المتصفح"));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("catalog")) {
          db.createObjectStore("catalog", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("sales")) {
          db.createObjectStore("sales", { keyPath: "idempotency_key" });
        }
      };
      request.onsuccess = () => {
        if (typeof navigator !== "undefined" && navigator.storage?.persist) {
          void navigator.storage.persist().catch(() => false);
        }
        resolve(request.result);
      };
      request.onerror = () => reject(request.error || new Error("تعذر فتح قاعدة التخزين المحلي"));
    });
  }
  return databasePromise;
}

export async function cachePosCatalog(value: Omit<CachedCatalog, "key" | "updatedAt">) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("catalog", "readwrite");
    tx.objectStore("catalog").put({ ...value, key: "latest", updatedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر حفظ كتالوج البيع"));
  });
}

export async function readCachedPosCatalog(): Promise<CachedCatalog | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("catalog", "readonly").objectStore("catalog").get("latest");
    request.onsuccess = () => resolve((request.result as CachedCatalog | undefined) || null);
    request.onerror = () => reject(request.error || new Error("تعذر قراءة كتالوج البيع المحفوظ"));
  });
}

export async function enqueueOfflineSale(payload: OfflineSalePayload) {
  const db = await openDatabase();
  const record: OfflineSaleRecord = {
    idempotency_key: payload.idempotency_key,
    payload,
    created_at: new Date().toISOString(),
    status: "pending",
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("sales", "readwrite");
    tx.objectStore("sales").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر حفظ البيع دون اتصال"));
  });
  return record;
}

export async function listOfflineSales(): Promise<OfflineSaleRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction("sales", "readonly").objectStore("sales").getAll();
    request.onsuccess = () => resolve((request.result as OfflineSaleRecord[]).sort((a,b)=>a.created_at.localeCompare(b.created_at)));
    request.onerror = () => reject(request.error || new Error("تعذر قراءة قائمة المبيعات المحفوظة"));
  });
}

export async function updateOfflineSale(record: OfflineSaleRecord) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("sales", "readwrite");
    tx.objectStore("sales").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("تعذر تحديث حالة البيع المحلي"));
  });
}
