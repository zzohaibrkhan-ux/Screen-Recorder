import { useState, useEffect } from 'react'

export const useServiceWorker = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [swRegistration, setSwRegistration] = useState(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Register service worker
    const registerSW = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js')
          setSwRegistration(registration)
          setIsInstalled(true)
          
          console.log('Service Worker registered successfully:', registration)

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setUpdateAvailable(true)
              }
            })
          })

          // Listen for messages from service worker
          navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('Message from service worker:', event.data)
          })

        } catch (error) {
          console.error('Service Worker registration failed:', error)
        }
      } else {
        console.log('Service Worker not supported')
      }
    }

    registerSW()

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true)
      console.log('App is online')
      
      // Trigger background sync when coming back online
      if (swRegistration && swRegistration.sync) {
        swRegistration.sync.register('upload-recordings')
          .then(() => console.log('Background sync registered'))
          .catch((error) => console.error('Background sync registration failed:', error))
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
      console.log('App is offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [swRegistration])

  // Function to update service worker
  const updateServiceWorker = () => {
    if (swRegistration && swRegistration.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
      setUpdateAvailable(false)
      window.location.reload()
    }
  }

  // Function to request persistent storage
  const requestPersistentStorage = async () => {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        const persistent = await navigator.storage.persist()
        console.log('Persistent storage:', persistent)
        return persistent
      } catch (error) {
        console.error('Failed to request persistent storage:', error)
        return false
      }
    }
    return false
  }

  // Function to check if app can be installed (PWA)
  const canInstall = () => {
    return 'serviceWorker' in navigator && 
           'PushManager' in window && 
           'Notification' in window
  }

  return {
    isOnline,
    isInstalled,
    updateAvailable,
    updateServiceWorker,
    requestPersistentStorage,
    canInstall: canInstall(),
    swRegistration
  }
}

