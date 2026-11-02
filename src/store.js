// @ts-check
const DB_NAME = "vitamin-che-personal-test";
const STORE_NAME = "localState";
const STATE_KEY = "main";
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

/** @typedef {{id:string,name:string,nutrient:string,amount:string,units:number,remaining:number|null,time:string,meal:string,days:number[],notes:string,task:string,active:boolean,kind:"supplement"|"routine",createdAt:string}} ShelfItem */
/** @typedef {{id:string,itemId:string,date:string,status:"taken"|"skipped",time:string,note:string,units:number}} Intake */
/** @typedef {{id:string,name:string,value:number,unit:string,target:number|null,date:string,note:string}} Entry */
/** @typedef {{id:string,name:string,value:number,unit:string,target:number|null}} Goal */
/** @typedef {{date:string,mood:string,water:number,walk:boolean,workout:boolean}} Checkin */
/** @typedef {{items:ShelfItem[],intakes:Intake[],entries:Entry[],goals:Goal[],checkins:Checkin[],language:"en"|"ru",startedAt:string,reminders:boolean,premium:boolean,welcomeDone?:boolean}} AppState */

/** @type {AppState} */
export const demoState = {
  items: [
    {id:"demo-iron",name:"Gentle Iron",nutrient:"iron",amount:"25 mg",units:1,remaining:18,time:"08:00",meal:"withFood",days:[0,1,2,3,4,5,6],notes:"With breakfast",task:"",active:true,kind:"supplement",createdAt:new Date().toISOString()},
    {id:"demo-d3",name:"Vitamin D3",nutrient:"vitamin_d",amount:"2000 IU",units:1,remaining:26,time:"09:00",meal:"withFood",days:[0,1,2,3,4,5,6],notes:"",task:"",active:true,kind:"supplement",createdAt:new Date().toISOString()},
    {id:"demo-magnesium",name:"Magnesium",nutrient:"magnesium",amount:"200 mg",units:1,remaining:12,time:"21:00",meal:"",days:[0,1,2,3,4,5,6],notes:"",task:"",active:true,kind:"supplement",createdAt:new Date().toISOString()},
    {id:"demo-water",name:"Water",nutrient:"water",amount:"1 glass",units:1,remaining:null,time:"12:30",meal:"",days:[0,1,2,3,4,5,6],notes:"",task:"",active:true,kind:"routine",createdAt:new Date().toISOString()},
  ],
  intakes: [],
  entries: [
    {id:"sample-lab-1",name:"Vitamin D (25-OH)",value:30,unit:"ng/mL",target:40,date:localDateKey(new Date(Date.now()-86400000*35)),note:""},
    {id:"sample-lab-2",name:"Vitamin D (25-OH)",value:34,unit:"ng/mL",target:40,date:localDateKey(new Date(Date.now()-86400000*8)),note:""},
  ],
  goals: [{id:"sample-goal",name:"Vitamin D (25-OH)",value:40,unit:"ng/mL",target:40}],
  checkins: [], language: /** @type {"en"|"ru"} */("en"), startedAt:localDateKey(new Date()), reminders:false, premium:true, welcomeDone:false,
};

/** @returns {Promise<IDBDatabase>} */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, {keyPath:"id"});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
  });
}

export const storage = {
  /** @returns {Promise<AppState|null>} */
  async load() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result?.value ?? null);
      req.onerror = () => reject(req.error);
    });
  },
  /** @param {AppState} state */
  async save(state) {
    try { await navigator.storage?.persist?.(); } catch { /* persistence is a best-effort browser request */ }
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put({id:STATE_KEY,value:state});
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("Storage write failed"));
    });
  },
  async clear() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(STATE_KEY);
      req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    });
  },
};

export function uid() { return crypto.randomUUID(); }
