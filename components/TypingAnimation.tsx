'use client'

import { useState, useEffect, useRef } from 'react'

interface TypingAnimationProps {
  texts: string[]
  className?: string
  typingSpeed?: number
  deletingSpeed?: number
  highlightDuration?: number
}

export default function TypingAnimation({
  texts,
  className = '',
  typingSpeed = 80,
  deletingSpeed = 40,
  highlightDuration = 1000,
}: TypingAnimationProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [currentCharIndex, setCurrentCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showCursor, setShowCursor] = useState(true)
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle typing and deleting phases
  useEffect(() => {
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current)
    }

    const currentText = texts[currentTextIndex] || texts[0]

    if (!isDeleting) {
      // Typing phase
      if (currentCharIndex < currentText.length) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedText(currentText.slice(0, currentCharIndex + 1))
          setCurrentCharIndex(currentCharIndex + 1)
        }, typingSpeed)
      } else {
        // Finished typing, pause briefly then start deleting
        pauseTimeoutRef.current = setTimeout(() => {
          setIsDeleting(true)
        }, highlightDuration)
      }
    } else {
      // Deleting phase
      if (currentCharIndex > 0) {
        timeoutRef.current = setTimeout(() => {
          setDisplayedText(currentText.slice(0, currentCharIndex - 1))
          setCurrentCharIndex(currentCharIndex - 1)
        }, deletingSpeed)
      } else {
        // Finished deleting, move to next text — defer state updates to avoid sync setState in effect
        setTimeout(() => {
          setIsDeleting(false)
          setCurrentTextIndex((prev) => (prev + 1) % texts.length)
          setCurrentCharIndex(0)
          setDisplayedText('')
        }, 0)
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current)
      }
    }
  }, [currentCharIndex, isDeleting, currentTextIndex, texts, typingSpeed, deletingSpeed, highlightDuration])

  // Render text with line breaks
  const renderText = () => {
    return displayedText.split('\n').map((line, index, array) => (
      <span key={index}>
        {line}
        {index < array.length - 1 && <br />}
      </span>
    ))
  }

  return (
    <span className={`inline-block text-white ${className}`}>
      {renderText()}
      {showCursor && (
        <span className="animate-pulse inline-block ml-1">|</span>
      )}
    </span>
  )
}
