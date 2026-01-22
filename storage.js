// IndexedDB utility for storing recordings offline
const DB_NAME = 'ScreenRecorderDB'
const DB_VERSION = 1
const STORE_NAME = 'recordings'

class StorageManager {
  constructor() {
    this.db = null
  }

  // Initialize the database
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        console.log('IndexedDB opened successfully')
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = event.target.result
        console.log('Upgrading IndexedDB schema')

        // Create object store for recordings
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { 
            keyPath: 'id', 
            autoIncrement: true 
          })
          
          // Create indexes
          store.createIndex('timestamp', 'timestamp', { unique: false })
          store.createIndex('type', 'type', { unique: false })
          store.createIndex('uploaded', 'uploaded', { unique: false })
          
          console.log('Created recordings object store')
        }
      }
    })
  }

  // Save a recording to IndexedDB
  async saveRecording(recordingData) {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)

      const recording = {
        ...recordingData,
        timestamp: Date.now(),
        uploaded: false,
        id: undefined // Let IndexedDB auto-generate
      }

      const request = store.add(recording)

      request.onsuccess = () => {
        console.log('Recording saved to IndexedDB:', request.result)
        resolve(request.result)
      }

      request.onerror = () => {
        console.error('Failed to save recording:', request.error)
        reject(request.error)
      }
    })
  }

  // Get all recordings
  async getAllRecordings() {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        console.error('Failed to get recordings:', request.error)
        reject(request.error)
      }
    })
  }

  // Get a specific recording by ID
  async getRecording(id) {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)

      request.onsuccess = () => {
        resolve(request.result)
      }

      request.onerror = () => {
        console.error('Failed to get recording:', request.error)
        reject(request.error)
      }
    })
  }

  // Delete a recording
  async deleteRecording(id) {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)

      request.onsuccess = () => {
        console.log('Recording deleted from IndexedDB:', id)
        resolve()
      }

      request.onerror = () => {
        console.error('Failed to delete recording:', request.error)
        reject(request.error)
      }
    })
  }

  // Mark recording as uploaded
  async markAsUploaded(id) {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const getRequest = store.get(id)
      
      getRequest.onsuccess = () => {
        const recording = getRequest.result
        if (recording) {
          recording.uploaded = true
          const putRequest = store.put(recording)
          
          putRequest.onsuccess = () => {
            resolve()
          }
          
          putRequest.onerror = () => {
            reject(putRequest.error)
          }
        } else {
          reject(new Error('Recording not found'))
        }
      }
      
      getRequest.onerror = () => {
        reject(getRequest.error)
      }
    })
  }

  // Get storage usage
  async getStorageUsage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate()
        return {
          used: estimate.usage,
          available: estimate.quota,
          percentage: Math.round((estimate.usage / estimate.quota) * 100)
        }
      } catch (error) {
        console.error('Failed to get storage estimate:', error)
        return null
      }
    }
    return null
  }

  // Clear all recordings
  async clearAllRecordings() {
    if (!this.db) {
      await this.init()
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        console.log('All recordings cleared from IndexedDB')
        resolve()
      }

      request.onerror = () => {
        console.error('Failed to clear recordings:', request.error)
        reject(request.error)
      }
    })
  }
}

// Create singleton instance
const storageManager = new StorageManager()

export default storageManager

