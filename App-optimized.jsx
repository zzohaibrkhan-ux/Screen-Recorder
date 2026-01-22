import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button.jsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.jsx'
import { Badge } from '@/components/ui/badge.jsx'
import { Alert, AlertDescription } from '@/components/ui/alert.jsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx'
import { 
  Play, 
  Square, 
  Download, 
  Monitor, 
  Camera, 
  Mic, 
  MicOff,
  Smartphone,
  AlertTriangle,
  CheckCircle,
  Settings,
  Wifi,
  WifiOff,
  HardDrive,
  Trash2,
  RefreshCw,
  Clock,
  FileVideo,
  Loader2
} from 'lucide-react'
import { useServiceWorker } from './hooks/useServiceWorker.js'
import storageManager from './lib/storage.js'
import './App.css'

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [recordedChunks, setRecordedChunks] = useState([])
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [deviceType, setDeviceType] = useState('desktop')
  const [recordingQuality, setRecordingQuality] = useState('medium') // New quality setting
  const [supportStatus, setSupportStatus] = useState({
    screenCapture: false,
    mediaRecorder: false,
    getUserMedia: false
  })
  const [error, setError] = useState('')
  const [savedRecordings, setSavedRecordings] = useState([])
  const [storageUsage, setStorageUsage] = useState(null)
  const [activeTab, setActiveTab] = useState('record')

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const videoRef = useRef(null)
  const timerRef = useRef(null)

  // Service Worker hook
  const { 
    isOnline, 
    isInstalled, 
    updateAvailable, 
    updateServiceWorker,
    requestPersistentStorage,
    canInstall 
  } = useServiceWorker()

  // Quality presets for better performance
  const qualityPresets = {
    low: {
      video: {
        width: { ideal: 854, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 12, max: 15 }
      },
      bitrate: 1000000 // 1 Mbps
    },
    medium: {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 15, max: 20 }
      },
      bitrate: 2500000 // 2.5 Mbps
    },
    high: {
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 20, max: 24 }
      },
      bitrate: 5000000 // 5 Mbps
    }
  }

  // Check device type and API support
  useEffect(() => {
    const checkSupport = () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      setDeviceType(isMobile ? 'mobile' : 'desktop')

      const support = {
        screenCapture: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
        mediaRecorder: !!(window.MediaRecorder),
        getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
      }
      
      setSupportStatus(support)
    }

    checkSupport()
    loadSavedRecordings()
    updateStorageUsage()
    
    // Request persistent storage for better offline experience
    if (canInstall) {
      requestPersistentStorage()
    }
  }, [canInstall, requestPersistentStorage])

  // Timer for recording duration
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      clearInterval(timerRef.current)
    }

    return () => clearInterval(timerRef.current)
  }, [isRecording])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const loadSavedRecordings = async () => {
    try {
      const recordings = await storageManager.getAllRecordings()
      setSavedRecordings(recordings.sort((a, b) => b.timestamp - a.timestamp))
    } catch (error) {
      console.error('Failed to load saved recordings:', error)
    }
  }

  const updateStorageUsage = async () => {
    try {
      const usage = await storageManager.getStorageUsage()
      setStorageUsage(usage)
    } catch (error) {
      console.error('Failed to get storage usage:', error)
    }
  }

  const saveRecordingOffline = async (blob, type = 'screen') => {
    try {
      const recordingData = {
        blob: blob,
        type: type,
        duration: recordingTime,
        size: blob.size,
        quality: recordingQuality,
        name: `${type}-recording-${recordingQuality}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`
      }

      await storageManager.saveRecording(recordingData)
      await loadSavedRecordings()
      await updateStorageUsage()
      
      console.log('Recording saved offline successfully')
    } catch (error) {
      console.error('Failed to save recording offline:', error)
      setError('Failed to save recording offline')
    }
  }

  const getOptimalCodec = () => {
    // Try codecs in order of performance preference
    const codecs = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus', 
      'video/webm;codecs=h264,opus',
      'video/webm'
    ]
    
    for (const codec of codecs) {
      if (MediaRecorder.isTypeSupported(codec)) {
        return codec
      }
    }
    
    return 'video/webm' // Fallback
  }

  const startScreenRecording = async () => {
    setIsInitializing(true)
    
    try {
      setError('')
      
      if (!supportStatus.screenCapture) {
        throw new Error('Screen recording is not supported on this device/browser')
      }

      const preset = qualityPresets[recordingQuality]

      // Optimized screen capture settings for better performance
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          mediaSource: 'screen',
          ...preset.video
        },
        audio: true
      })

      let finalStream = displayStream

      // Add microphone audio if enabled and supported
      if (isAudioEnabled && supportStatus.getUserMedia) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 44100 // Optimize audio sample rate
            }
          })

          // Combine streams
          const audioTracks = audioStream.getAudioTracks()
          audioTracks.forEach(track => finalStream.addTrack(track))
        } catch (audioError) {
          console.warn('Could not access microphone:', audioError)
        }
      }

      streamRef.current = finalStream

      // Create MediaRecorder with optimized settings
      const mimeType = getOptimalCodec()
      const options = {
        mimeType: mimeType,
        videoBitsPerSecond: preset.bitrate,
        audioBitsPerSecond: 128000 // 128 kbps audio
      }

      mediaRecorderRef.current = new MediaRecorder(finalStream, options)
      
      const chunks = []
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType })
        setRecordedBlob(blob)
        setRecordedChunks(chunks)
        
        // Save offline if not online or user preference
        if (!isOnline || true) { // Always save offline for demo
          await saveRecordingOffline(blob, 'screen')
        }
        
        // Create video URL for preview
        if (videoRef.current) {
          videoRef.current.src = URL.createObjectURL(blob)
        }
        
        setIsRecording(false)
      }

      // Handle stream ending (user stops sharing)
      finalStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopRecording()
      })

      // Start recording with optimized data collection interval
      mediaRecorderRef.current.start(2000) // Collect data every 2 seconds instead of 1
      setIsRecording(true)
      setRecordingTime(0)

    } catch (err) {
      setError(`Failed to start recording: ${err.message}`)
      console.error('Recording error:', err)
      setIsRecording(false)
    } finally {
      setIsInitializing(false)
    }
  }

  const startCameraRecording = async () => {
    setIsInitializing(true)
    
    try {
      setError('')
      
      if (!supportStatus.getUserMedia) {
        throw new Error('Camera recording is not supported on this device/browser')
      }

      const preset = qualityPresets[recordingQuality]

      // Get camera stream with optimized settings
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...preset.video,
          facingMode: 'user' // Prefer front camera on mobile
        },
        audio: isAudioEnabled ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        } : false
      })

      streamRef.current = stream

      // Create MediaRecorder with optimized settings
      const mimeType = getOptimalCodec()
      const options = {
        mimeType: mimeType,
        videoBitsPerSecond: preset.bitrate,
        audioBitsPerSecond: isAudioEnabled ? 128000 : undefined
      }

      mediaRecorderRef.current = new MediaRecorder(stream, options)
      
      const chunks = []
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType })
        setRecordedBlob(blob)
        setRecordedChunks(chunks)
        
        // Save offline if not online or user preference
        if (!isOnline || true) { // Always save offline for demo
          await saveRecordingOffline(blob, 'camera')
        }
        
        // Create video URL for preview
        if (videoRef.current) {
          videoRef.current.src = URL.createObjectURL(blob)
          videoRef.current.srcObject = null // Clear live stream
        }
        
        setIsRecording(false)
      }

      // Start recording with optimized data collection interval
      mediaRecorderRef.current.start(2000) // Collect data every 2 seconds
      setIsRecording(true)
      setRecordingTime(0)

      // Show camera preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }

    } catch (err) {
      setError(`Failed to start camera recording: ${err.message}`)
      console.error('Camera recording error:', err)
      setIsRecording(false)
    } finally {
      setIsInitializing(false)
    }
  }

  const stopRecording = async () => {
    if (mediaRecorderRef.current && (isRecording || isInitializing)) {
      try {
        mediaRecorderRef.current.stop()
        
        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => {
            track.stop()
          })
        }
        
        // Clear stream reference
        streamRef.current = null
        
      } catch (error) {
        console.error('Error stopping recording:', error)
      }
      
      setIsRecording(false)
      setIsInitializing(false)
    }
  }

  const downloadRecording = (blob, filename) => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `recording-${recordingQuality}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const deleteRecording = async (id) => {
    try {
      await storageManager.deleteRecording(id)
      await loadSavedRecordings()
      await updateStorageUsage()
    } catch (error) {
      console.error('Failed to delete recording:', error)
      setError('Failed to delete recording')
    }
  }

  const clearAllRecordings = async () => {
    try {
      await storageManager.clearAllRecordings()
      await loadSavedRecordings()
      await updateStorageUsage()
    } catch (error) {
      console.error('Failed to clear recordings:', error)
      setError('Failed to clear recordings')
    }
  }

  const resetRecording = () => {
    setRecordedBlob(null)
    setRecordedChunks([])
    setRecordingTime(0)
    setError('')
    if (videoRef.current) {
      videoRef.current.src = ''
      videoRef.current.srcObject = null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Screen Recorder Pro
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Professional screen and camera recording for all devices
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <Badge variant={deviceType === 'desktop' ? 'default' : 'secondary'}>
              {deviceType === 'desktop' ? <Monitor className="w-3 h-3 mr-1" /> : <Smartphone className="w-3 h-3 mr-1" />}
              {deviceType === 'desktop' ? 'Desktop' : 'Mobile'}
            </Badge>
            <Badge variant={supportStatus.screenCapture ? 'default' : 'destructive'}>
              {supportStatus.screenCapture ? <CheckCircle className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
              Screen Recording {supportStatus.screenCapture ? 'Supported' : 'Not Available'}
            </Badge>
            <Badge variant={isOnline ? 'default' : 'secondary'}>
              {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
            {isInstalled && (
              <Badge variant="outline">
                <CheckCircle className="w-3 h-3 mr-1" />
                PWA Installed
              </Badge>
            )}
          </div>
        </div>

        {/* Update Available Alert */}
        {updateAvailable && (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>A new version is available!</span>
              <Button onClick={updateServiceWorker} size="sm">
                Update Now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="record">Record</TabsTrigger>
            <TabsTrigger value="saved">Saved ({savedRecordings.length})</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Recording Tab */}
          <TabsContent value="record" className="space-y-6">
            {/* Recording Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Recording Controls
                </CardTitle>
                <CardDescription>
                  {deviceType === 'desktop' 
                    ? 'Choose between screen recording or camera recording'
                    : 'Screen recording is not available on mobile devices. Use camera recording instead.'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Recording Timer */}
                {(isRecording || isInitializing) && (
                  <div className="text-center">
                    <div className="text-3xl font-mono font-bold text-red-600 dark:text-red-400">
                      {isInitializing ? (
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-8 h-8 animate-spin" />
                          <span>Initializing...</span>
                        </div>
                      ) : (
                        formatTime(recordingTime)
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {isInitializing ? 'Setting up recording...' : 'Recording in progress...'}
                    </div>
                  </div>
                )}

                {/* Quality Selection */}
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm font-medium">Quality:</span>
                  <div className="flex gap-1">
                    {Object.keys(qualityPresets).map((quality) => (
                      <Button
                        key={quality}
                        variant={recordingQuality === quality ? "default" : "outline"}
                        size="sm"
                        onClick={() => setRecordingQuality(quality)}
                        disabled={isRecording || isInitializing}
                        className="capitalize"
                      >
                        {quality}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Audio Toggle */}
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant={isAudioEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                    disabled={isRecording || isInitializing}
                  >
                    {isAudioEnabled ? <Mic className="w-4 h-4 mr-2" /> : <MicOff className="w-4 h-4 mr-2" />}
                    {isAudioEnabled ? 'Audio On' : 'Audio Off'}
                  </Button>
                </div>

                {/* Recording Buttons */}
                <div className="flex flex-wrap justify-center gap-4">
                  {/* Screen Recording (Desktop Only) */}
                  {deviceType === 'desktop' && (
                    <Button
                      onClick={isRecording || isInitializing ? stopRecording : startScreenRecording}
                      disabled={!supportStatus.screenCapture || !supportStatus.mediaRecorder}
                      size="lg"
                      variant={(isRecording || isInitializing) ? "destructive" : "default"}
                      className="min-w-[160px]"
                    >
                      {(isRecording || isInitializing) ? (
                        <>
                          <Square className="w-5 h-5 mr-2" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Monitor className="w-5 h-5 mr-2" />
                          Record Screen
                        </>
                      )}
                    </Button>
                  )}

                  {/* Camera Recording */}
                  <Button
                    onClick={isRecording || isInitializing ? stopRecording : startCameraRecording}
                    disabled={!supportStatus.getUserMedia || !supportStatus.mediaRecorder}
                    size="lg"
                    variant={(isRecording || isInitializing) ? "destructive" : "outline"}
                    className="min-w-[160px]"
                  >
                    {(isRecording || isInitializing) ? (
                      <>
                        <Square className="w-5 h-5 mr-2" />
                        Stop Recording
                      </>
                    ) : (
                      <>
                        <Camera className="w-5 h-5 mr-2" />
                        Record Camera
                      </>
                    )}
                  </Button>
                </div>

                {/* Quality Info */}
                <div className="text-center text-sm text-gray-500">
                  Current quality: {recordingQuality} ({qualityPresets[recordingQuality].video.width.ideal}x{qualityPresets[recordingQuality].video.height.ideal} @ {qualityPresets[recordingQuality].video.frameRate.ideal}fps)
                </div>

                {/* Reset Button */}
                {recordedBlob && !isRecording && !isInitializing && (
                  <div className="flex justify-center">
                    <Button onClick={resetRecording} variant="outline">
                      New Recording
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Video Preview/Playback */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  {isInitializing ? 'Initializing recording...' : 
                   isRecording ? 'Live preview' : 
                   recordedBlob ? 'Recorded video' : 'No recording available'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    controls={!isRecording && !isInitializing && recordedBlob}
                    muted={isRecording || isInitializing}
                    className="w-full h-full object-contain"
                    poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f3f4f6'/%3E%3Ctext x='200' y='150' text-anchor='middle' fill='%236b7280' font-family='Arial' font-size='16'%3ENo video available%3C/text%3E%3C/svg%3E"
                  />
                </div>
                
                {/* Download Button */}
                {recordedBlob && !isRecording && !isInitializing && (
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => downloadRecording(recordedBlob)} size="lg">
                      <Download className="w-5 h-5 mr-2" />
                      Download Recording
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Saved Recordings Tab */}
          <TabsContent value="saved" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileVideo className="w-5 h-5" />
                    Saved Recordings
                  </span>
                  {savedRecordings.length > 0 && (
                    <Button onClick={clearAllRecordings} variant="destructive" size="sm">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All
                    </Button>
                  )}
                </CardTitle>
                <CardDescription>
                  Recordings saved offline on your device
                </CardDescription>
              </CardHeader>
              <CardContent>
                {savedRecordings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No saved recordings yet. Start recording to save videos offline!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {savedRecordings.map((recording) => (
                      <div key={recording.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          {recording.type === 'screen' ? (
                            <Monitor className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Camera className="w-5 h-5 text-green-600" />
                          )}
                          <div>
                            <div className="font-medium">{recording.name}</div>
                            <div className="text-sm text-gray-500 flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatTime(recording.duration)}
                              </span>
                              <span className="flex items-center gap-1">
                                <HardDrive className="w-3 h-3" />
                                {formatFileSize(recording.size)}
                              </span>
                              <span className="capitalize">{recording.quality || 'medium'}</span>
                              <span>{new Date(recording.timestamp).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => downloadRecording(recording.blob, `${recording.name}.webm`)}
                            size="sm"
                            variant="outline"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => deleteRecording(recording.id)}
                            size="sm"
                            variant="destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Performance Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Performance Tips
                </CardTitle>
                <CardDescription>Optimize recording performance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Use <strong>Low</strong> or <strong>Medium</strong> quality for smoother recording</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Close unnecessary applications to free up system resources</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Use Chrome or Edge browsers for best performance</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Ensure stable internet connection for online features</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="w-5 h-5" />
                  Storage Usage
                </CardTitle>
                <CardDescription>Local storage usage for offline recordings</CardDescription>
              </CardHeader>
              <CardContent>
                {storageUsage ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Used: {formatFileSize(storageUsage.used)}</span>
                      <span>Available: {formatFileSize(storageUsage.available)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${storageUsage.percentage}%` }}
                      ></div>
                    </div>
                    <div className="text-center text-sm text-gray-500">
                      {storageUsage.percentage}% used
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    Storage information not available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Browser Compatibility */}
            <Card>
              <CardHeader>
                <CardTitle>Browser Compatibility</CardTitle>
                <CardDescription>Current browser support status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    {supportStatus.screenCapture ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm">Screen Capture API</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {supportStatus.mediaRecorder ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm">MediaRecorder API</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {supportStatus.getUserMedia ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="text-sm">Camera/Microphone Access</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Mobile Instructions */}
        {deviceType === 'mobile' && (
          <Alert>
            <Smartphone className="h-4 w-4" />
            <AlertDescription>
              <strong>Mobile Device Detected:</strong> Screen recording is not available in mobile browsers. 
              You can use camera recording or consider using native screen recording apps on your device.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

export default App

