import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, TextCursor, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Toggle } from '@/components/ui/toggle';

const D_WHISTLE_NOTES = {
  4: ['D', 'E', 'F#', 'G', 'A', 'B'],
  5: ['C', 'C#', 'D', 'E', 'F#', 'G', 'A', 'B'],
  6: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#']
};

const ALL_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const A4_FREQ = 440;
const A4_INDEX = 57; // MIDI note number for A4
const VOLUME_THRESHOLD = 0.01; // Adjust this value to change sensitivity
const DETECTION_INTERVAL = 100; // Detect pitch every 100ms
const FREQUENCY_BUFFER_SIZE = 5; // Store last 5 frequency readings

const WhistleNoteTrainer = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [targetNote, setTargetNote] = useState([]);
  const [detectedNote, setDetectedNote] = useState('');
  const [frequency, setFrequency] = useState(0);
  const [debug, setDebug] = useState('');
  const [score, setScore] = useState(0);
  const [displayMode, setDisplayMode] = useState('text'); // 'text' or 'staff'
  const [isAbcjsLoaded, setIsAbcjsLoaded] = useState(false);
  const [activeNotes, setActiveNotes] = useState({});
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const intervalRef = useRef(null);
  const targetNoteRef = useRef('');
  const frequencyBufferRef = useRef([]);
  const abcjsRef = useRef(null);
  const [consecutiveNotes, setConsecutiveNotes] = useState(1);

  useEffect(() => {
    const initialActiveNotes = {};
    Object.entries(D_WHISTLE_NOTES).forEach(([octave, notes]) => {
      notes.forEach(note => {
        initialActiveNotes[`${note}${octave}`] = octave < 6 ? true : false;
      });
    });
    setActiveNotes(initialActiveNotes);
  }, []);

  useEffect(() => {
    // Load abcjs library
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/abcjs/6.0.0/abcjs-basic-min.js';
    script.async = true;
    script.onload = () => {
      abcjsRef.current = window.ABCJS;
      setIsAbcjsLoaded(true);
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

 const renderStaffNotation = useCallback((notes) => {
  if (isAbcjsLoaded && abcjsRef.current && notes) {
    const abcNotes = notes.map(({ note, played }) => {
      const noteName = note.substr(0, note.length - 1);
      const octave = note.substr(-1);
      let abcNote = noteName.toLowerCase();
      
      if (note === "C5") {
        abcNote = '=' + abcNote;
      }
      
      const octaveNum = parseInt(octave);
      if (octaveNum >= 5) {
        abcNote = abcNote.toLowerCase() + "'".repeat(octaveNum - 5);
      } else if (octaveNum === 4) {
        abcNote = abcNote.toUpperCase();
      } else {
        abcNote = abcNote.toUpperCase() + ",".repeat(4 - octaveNum);
      }
      
      return played ? `!mark!${abcNote}` : abcNote;
    }).join(' ');
    
    const abcNotation = `L:1/4\nK:D\n${abcNotes}`;
    abcjsRef.current.renderAbc('staff-notation', abcNotation, { 
      staffwidth: 300,
      scale: 2
    });
  }
}, [isAbcjsLoaded]);

  useEffect(() => {
    if (displayMode === 'staff') {
      renderStaffNotation(targetNote);
    }
  }, [displayMode, targetNote, renderStaffNotation]);

  const generateNewTarget = useCallback(() => {
    const availableNotes = Object.keys(activeNotes).filter(note => activeNotes[note]);
    if (availableNotes.length === 0) {
      setDebug('No notes selected. Please select at least one note.');
      return;
    }
    const newTargets = Array(consecutiveNotes).fill().map(() => {
      const randomIndex = Math.floor(Math.random() * availableNotes.length);
      return { note: availableNotes[randomIndex], played: false };
    });
    setTargetNote(newTargets);
    targetNoteRef.current = newTargets;
    console.log(`New target notes generated: ${newTargets.map(t => t.note).join(' ')}`);
  }, [activeNotes, consecutiveNotes]);
  
const checkNote = useCallback((note) => {
  const currentTargetNotes = targetNoteRef.current;
  console.log(`Checking note: ${note} against targets: ${currentTargetNotes.map(t => t.note).join(' ')}`);
  const nextUnplayedIndex = currentTargetNotes.findIndex(target => !target.played);
  
  if (nextUnplayedIndex !== -1 && currentTargetNotes[nextUnplayedIndex].note === note) {
    console.log('Correct note detected!');
    setScore(prevScore => {
      const newScore = prevScore + 1;
      console.log(`Score updated: ${newScore}`);
      return newScore;
    });
    const updatedTargets = [...currentTargetNotes];
    updatedTargets[nextUnplayedIndex].played = true;
    targetNoteRef.current = updatedTargets;
    setTargetNote(updatedTargets);
    setDebug(`Correct! Note ${note} marked as played.`);
    renderStaffNotation(updatedTargets);
    if (updatedTargets.every(target => target.played)) {
      generateNewTarget();
      setDebug(`All notes played correctly! New targets generated.`);
    }
  } else {
    console.log('Incorrect or out of order note detected');
    setDebug(`Incorrect or out of order. Try again!`);
  }
}, [generateNewTarget, renderStaffNotation]);

  const detectPitch = useCallback(() => {
    const bufferLength = analyserRef.current.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyserRef.current.getFloatTimeDomainData(buffer);

    const volume = getRMS(buffer);
    if (volume > VOLUME_THRESHOLD) {
      const detectedFrequency = yinPitchDetection(buffer, audioContextRef.current.sampleRate);
      
      if (detectedFrequency > 0) {
        // Add new frequency to the buffer
        frequencyBufferRef.current.push(detectedFrequency);
        
        // Keep only the last FREQUENCY_BUFFER_SIZE readings
        if (frequencyBufferRef.current.length > FREQUENCY_BUFFER_SIZE) {
          frequencyBufferRef.current.shift();
        }
        
        // Calculate the average frequency
        const averageFrequency = frequencyBufferRef.current.reduce((sum, freq) => sum + freq, 0) / frequencyBufferRef.current.length;
        
        setFrequency(Math.round(averageFrequency));
        const note = getNote(averageFrequency);
        setDetectedNote(note);
        console.log(`Detected note: ${note}, Target note: ${targetNoteRef.current}`);
        checkNote(note);
      } else {
        setDetectedNote('');
      }
    } else {
      setFrequency(0);
      setDetectedNote('');
      frequencyBufferRef.current = []; // Clear frequency buffer when volume is low
      setDebug('Volume below threshold');
    }
  }, [checkNote]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.fftSize = 2048;
      setIsRecording(true);
      setDebug('Recording started');
      console.log('Recording started');
      generateNewTarget(); // Generate first target when recording starts
      intervalRef.current = setInterval(detectPitch, DETECTION_INTERVAL);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setDebug(`Error: ${err.message}`);
    }
  }, [generateNewTarget, detectPitch]);

  const stopRecording = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setIsRecording(false);
    setFrequency(0);
    setDetectedNote('');
    setTargetNote([]);
    targetNoteRef.current = '';
    frequencyBufferRef.current = [];
    setDebug('Recording stopped');
    setScore(0);
    console.log('Recording stopped');
  }, []);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getRMS = (buffer) => {
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i];
    }
    return Math.sqrt(rms / buffer.length);
  };

  const yinPitchDetection = (buffer, sampleRate) => {
    const threshold = 0.1;
    const minFreq = 50;  // Minimum detectable frequency
    const maxFreq = 1600;  // Maximum detectable frequency for tin whistle
    const bufferSize = buffer.length;
    const yinBuffer = new Float32Array(bufferSize / 2);
    
    // Step 1: Calculate difference function
    for (let t = 0; t < yinBuffer.length; t++) {
      yinBuffer[t] = 0;
      for (let i = 0; i < yinBuffer.length; i++) {
        const delta = buffer[i] - buffer[i + t];
        yinBuffer[t] += delta * delta;
      }
    }
    
    // Step 2: Cumulative mean normalized difference function
    yinBuffer[0] = 1;
    let runningSum = 0;
    for (let t = 1; t < yinBuffer.length; t++) {
      runningSum += yinBuffer[t];
      yinBuffer[t] *= t / runningSum;
    }
    
    // Step 3: Absolute threshold
    let tau;
    for (tau = 2; tau < yinBuffer.length; tau++) {
      if (yinBuffer[tau] < threshold) {
        while (tau + 1 < yinBuffer.length && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        const exactTau = parabolicInterpolation(yinBuffer, tau);
        const f0 = sampleRate / exactTau;
        
        if (f0 >= minFreq && f0 <= maxFreq) {
          return f0;
        } else {
          return -1;
        }
      }
    }
    
    return -1; // No pitch found
  };

  const parabolicInterpolation = (array, x) => {
    const x0 = x - 1 > 0 ? x - 1 : x;
    const x2 = x + 1 < array.length ? x + 1 : x;
    const xv = (array[x2] - array[x0]) / (2 * (2 * array[x] - array[x0] - array[x2]));
    return x + xv;
  };

  const getNote = (frequency) => {
    const halfSteps = 12 * Math.log2(frequency / A4_FREQ);
    const roundedHalfSteps = Math.round(halfSteps);
    const midiNote = A4_INDEX + roundedHalfSteps;
    const noteName = ALL_NOTES[midiNote % 12];
    const octave = Math.floor(midiNote / 12) - 1;  // Subtract 1 to correct the octave
    return `${noteName}${octave}`;
  };

  const toggleDisplayMode = () => {
    setDisplayMode(prevMode => prevMode === 'text' ? 'staff' : 'text');
  };

  const toggleNote = (note) => {
    setActiveNotes(prev => ({...prev, [note]: !prev[note]}));
  };

 const toggleOctave = (octave) => {
    setActiveNotes(prev => {
      const newActiveNotes = {...prev};
      D_WHISTLE_NOTES[octave].forEach(note => {
        const fullNote = `${note}${octave}`;
        newActiveNotes[fullNote] = !prev[fullNote];
      });
      return newActiveNotes;
    });
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Whistle Note Trainer</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center space-y-4">
          <div className="flex items-center space-x-4">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-16 h-16 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
            >
              {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
            </Button>
            <div className="flex items-center space-x-2">
              <TextCursor size={20} />
              <Switch
                checked={displayMode === 'staff'}
                onCheckedChange={toggleDisplayMode}
              />
              <Music size={20} />
            </div>
          </div>
          <div className="flex items-center space-x-2 mb-4">
          <label htmlFor="consecutive-notes">Consecutive Notes:</label>
            <input
              id="consecutive-notes"
              type="number"
              min="1"
              max="10"
              value={consecutiveNotes}
              onChange={(e) => setConsecutiveNotes(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
              className="w-16 p-1 border rounded"
            />
        </div>
          {isRecording && (
            <>
              <div className="text-4xl font-bold mb-2">
                Target Notes: 
                {displayMode === 'text' ? (
                  <span>{targetNote.map(({ note, played }, index) => 
                    played ? <span key={index} style={{color: 'green'}}>{note} </span> : <span key={index}>{note} </span>
                  )}</span>
                ) : (
                  <div id="staff-notation" className="w-full h-24"></div>
                )}
              </div>
              <div className="text-2xl">
                Score: {score}
              </div>
            </>
          )}
          {!isRecording && (
            <div className="text-xl">
              Press the microphone to start
            </div>
          )}
                {Object.entries(D_WHISTLE_NOTES).map(([octave, notes]) => (
            <div key={octave} className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => toggleOctave(octave)} className="w-full mb-2">
                Toggle Octave {octave}
              </Button>
              {notes.map(note => (
                <Toggle
                  key={`${note}${octave}`}
                  pressed={activeNotes[`${note}${octave}`]}
                  onPressedChange={() => toggleNote(`${note}${octave}`)}
                  className="w-14 h-14"
                >
                  {note}{octave}
                </Toggle>
              ))}
            </div>
          ))}
          <div className="text-sm text-gray-500">
            Debug Info:
            <div>Detected Note: {detectedNote}</div>
            <div>Frequency: {frequency} Hz</div>
            <div>{debug}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WhistleNoteTrainer;