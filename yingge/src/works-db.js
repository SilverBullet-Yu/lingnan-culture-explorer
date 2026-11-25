/* 作品库（IndexedDB）：作品画布数据与预览图体量大，不入 localStorage；
   localStorage 只存作品索引（名称/编号/时间/参考），详细数据在这里。
   库名 yingge-works，对象仓 works（keyPath id）。封装模式沿用岭南漫游 recorder.js。 */
var DB_NAME = 'yingge-works';
var STORE = 'works';
var dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = function () { request.result.createObjectStore(STORE, { keyPath: 'id' }) };
    request.onsuccess = function () { resolve(request.result) };
    request.onerror = function () { reject(request.error) };
  }).catch(function (error) { dbPromise = null; throw error });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(STORE, mode);
      var request = fn(t.objectStore(STORE));
      t.oncomplete = function () { resolve(request ? request.result : undefined) };
      t.onerror = function () { reject(t.error) };
      t.onabort = function () { reject(t.error) };
    });
  });
}

export function putWork(work) { return tx('readwrite', function (store) { return store.put(work) }) }
export function getWork(id) { return tx('readonly', function (store) { return store.get(id) }) }
export function delWork(id) { return tx('readwrite', function (store) { return store.delete(id) }) }
export function clearWorks() { return tx('readwrite', function (store) { return store.clear() }) }
export function allWorks() { return tx('readonly', function (store) { return store.getAll() }) }
