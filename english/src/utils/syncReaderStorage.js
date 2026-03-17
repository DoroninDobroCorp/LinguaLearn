const DB_NAME = 'lingualearn-sync-reader';
const STORE_NAME = 'projects';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

async function runTransaction(mode, callback) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      database.close();
    };

    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('IndexedDB transaction failed.'));
    };

    callback(store, resolve, reject);
  });
}

export async function getAllReaderProjects() {
  return runTransaction('readonly', (store, resolve, reject) => {
    const request = store.getAll();

    request.onerror = () => reject(request.error || new Error('Failed to load reader projects.'));
    request.onsuccess = () => {
      const projects = request.result.sort((left, right) => {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });

      resolve(projects);
    };
  });
}

export async function saveReaderProject(project) {
  return runTransaction('readwrite', (store, resolve, reject) => {
    const request = store.put(project);

    request.onerror = () => reject(request.error || new Error('Failed to save reader project.'));
    request.onsuccess = () => resolve(project);
  });
}

export async function deleteReaderProject(projectId) {
  return runTransaction('readwrite', (store, resolve, reject) => {
    const request = store.delete(projectId);

    request.onerror = () => reject(request.error || new Error('Failed to delete reader project.'));
    request.onsuccess = () => resolve();
  });
}

export async function deleteReaderProjects(projectIds) {
  const uniqueProjectIds = [...new Set(projectIds.filter(Boolean))];
  if (!uniqueProjectIds.length) {
    return;
  }

  return runTransaction('readwrite', (store, resolve, reject) => {
    let remainingDeletes = uniqueProjectIds.length;

    uniqueProjectIds.forEach((projectId) => {
      const request = store.delete(projectId);

      request.onerror = () => reject(request.error || new Error('Failed to delete reader projects.'));
      request.onsuccess = () => {
        remainingDeletes -= 1;
        if (remainingDeletes === 0) {
          resolve();
        }
      };
    });
  });
}
