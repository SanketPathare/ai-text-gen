import fixWebmDuration from 'fix-webm-duration'
import { isFunction } from 'lodash-es'

export interface AudioRecorderPayload {
  autoStop?: boolean
  volumeThreshold?: number
  silenceThreshold?: number
  onStart?: () => void
  onTimeUpdate?: (time: number) => void
  onFinish?: (audioData: Blob) => void
  onError?: (err: Error) => void
}

export interface RecordMineType {
  extension: 'webm' | 'mp4'
  mineType: 'audio/webm' | 'audio/mp4'
}

export class AudioRecorder {
  public time: number = 0
  public isRecording: boolean = false
  public autoStop: boolean = false
  private startTime: number = 0
  protected audioContext: AudioContext
  protected mediaRecorder: MediaRecorder | null = null
  protected volumeThreshold: number = 30
  protected silenceThreshold: number = 2000
  protected onStart() {}
  protected onTimeUpdate(time: number) {}
  protected onFinish(audioData: Blob) {}
  protected onError(err: Error) {}
  static getRecordMineType(): RecordMineType {
    try {
      return MediaRecorder.isTypeSupported('audio/webm')
        ? {
            extension: 'webm',
            mineType: 'audio/webm',
          }
        : {
            extension: 'mp4',
            mineType: 'audio/mp4',
          }
    } catch {
      return {
        extension: 'webm',
        mineType: 'audio/webm',
      }
    }
  }
  static formatTime(seconds: number): string {
    if (seconds < 0) return `--:--`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)

    const minutesStr = minutes.toString().padStart(2, '0')
    const secondsStr = remainingSeconds.toString().padStart(2, '0')

    return `${minutesStr}:${secondsStr}`
  }
  constructor({
    autoStop,
    volumeThreshold,
    silenceThreshold,
    onStart,
    onTimeUpdate,
    onFinish,
    onError,
  }: AudioRecorderPayload) {
    this.audioContext = new AudioContext()
    if (autoStop) this.autoStop = autoStop
 
    if (volumeThreshold) this.volumeThreshold = volumeThreshold

    if (silenceThreshold) this.silenceThreshold = silenceThreshold
    if (isFunction(onStart)) this.onStart = onStart
    if (isFunction(onTimeUpdate)) this.onTimeUpdate = onTimeUpdate
    if (isFunction(onFinish)) this.onFinish = onFinish
    if (isFunction(onError)) this.onError = onError
  }
  public start() {
    if (this.mediaRecorder) {
      this.mediaRecorder.start(1000)
    } else {
    
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            sampleSize: 16,
            channelCount: 1,
            noiseSuppression: false,
            echoCancellation: false,
          },
        })
        .then((stream) => {
          this.recording(stream)
        })
        .catch((error: Error) => {
          this.onError(error)
        })
    }
  }
  protected recording(stream: MediaStream) {
    let chunks: Blob[] = []
    const mediaRecorderType = AudioRecorder.getRecordMineType()

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: mediaRecorderType.mineType,
    })

    this.mediaRecorder = mediaRecorder

     const microphone = this.audioContext.createMediaStreamSource(stream)

    const analyser = this.audioContext.createAnalyser()
  
    analyser.fftSize = 256
  
   microphone.connect(analyser)

    const finishRecord = async () => {
      const duration = Date.now() - this.startTime
      const blob = new Blob(chunks, { type: mediaRecorderType.mineType })
      const fixedBlob = await fixWebmDuration(blob, duration, { logger: false })
      this.onFinish(fixedBlob)
      this.startTime = 0
      chunks = []
    }

    
    mediaRecorder.addEventListener('dataavailable', (ev) => {
      if (ev.data.size > 0) {
        chunks.push(ev.data)
      }
    })
    mediaRecorder.addEventListener('start', () => {
      this.isRecording = true
      this.startTime = Date.now()
      this.startTimer()
      this.onStart()
    })
    mediaRecorder.addEventListener('pause', () => {
      finishRecord()
    })
    mediaRecorder.addEventListener('stop', () => {
      finishRecord()
      stream.getTracks().forEach((track) => track.stop())
    })

    let silenceTimer: any = null
    let rafID: number


    const getVolumeFromFrequencyData = (frequencyData: Uint8Array, bufferLength: number) => {
      const sum = frequencyData.reduce((acc, value) => acc + value, 0)
      const average = sum / bufferLength
      return average
    }

    const processAudio = () => {
     
      const bufferLength = analyser.frequencyBinCount
      const frequencyData = new Uint8Array(bufferLength)
      analyser.getByteFrequencyData(frequencyData)


      const volume = getVolumeFromFrequencyData(frequencyData, bufferLength)

      if (volume > this.volumeThreshold) {

        clearTimeout(silenceTimer)
        silenceTimer = null
      } else {
   
        if (!silenceTimer) {
          silenceTimer = setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              mediaRecorder.stop()
            }
            cancelAnimationFrame(rafID)
            this.isRecording = false
            this.stopTimer()
          }, this.silenceThreshold)
        }
      }

      
      rafID = requestAnimationFrame(() => {
        processAudio()
      })
    }

    if (this.autoStop) {
      processAudio()
    }
    mediaRecorder.start(1000)
  }
  public stop() {
    this.mediaRecorder?.stop()
    this.isRecording = false
    this.stopTimer()
  }
  protected startTimer() {
    setTimeout(() => {
      this.time += 1
      this.onTimeUpdate(this.time)
      if (this.isRecording) this.startTimer()
    }, 1000)
  }
  protected stopTimer() {
    this.time = 0
  }
}
