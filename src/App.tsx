import './index.css'
import React from 'react'
import WhistleNoteTrainer from './components/WhistleNoteTrainer'

function App() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="container mx-auto p-4 font-mono">
        <WhistleNoteTrainer />
      </div>
    </div>
  )
}

export default App
