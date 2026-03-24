'use client'

import { Loader2 } from 'lucide-react'

interface LoadingModalProps {
  isOpen: boolean
  message?: string
  subMessage?: string
}

export default function LoadingModal({ isOpen, message = 'กำลังโหลด', subMessage }: LoadingModalProps) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          background: 'white',
          borderRadius: 16,
          padding: '32px 48px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          animation: 'fadeIn 0.3s ease-out',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 64,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2
            size={64}
            color="#CC0001"
            strokeWidth={3}
            style={{
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>

        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-oswald)',
              fontSize: 20,
              fontWeight: 700,
              color: '#111',
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            {message}
          </div>
          {subMessage && (
            <div
              style={{
                fontFamily: 'var(--font-sarabun)',
                fontSize: 13,
                color: '#888',
                fontWeight: 400,
              }}
            >
              {subMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
