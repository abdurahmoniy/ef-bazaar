'use client'

import { useEffect, useRef } from 'react'

export interface TelegramAuthUser {
	id: number
	first_name?: string
	last_name?: string
	username?: string
	photo_url?: string
	auth_date: number
	hash: string
}

declare global {
	interface Window {
		onTelegramAuth?: (user: TelegramAuthUser) => void
	}
}

interface Props {
	onAuth: (user: TelegramAuthUser) => void
}

export default function TelegramLoginButton({ onAuth }: Props) {
	const containerRef = useRef<HTMLDivElement>(null)
	const botUsername =
		process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'efbazaar_bot'

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		window.onTelegramAuth = onAuth

		const script = document.createElement('script')
		script.src = 'https://telegram.org/js/telegram-widget.js?22'
		script.async = true
		script.setAttribute('data-telegram-login', botUsername)
		script.setAttribute('data-size', 'large')
		script.setAttribute('data-onauth', 'onTelegramAuth(user)')
		script.setAttribute('data-request-access', 'write')
		container.appendChild(script)

		return () => {
			delete window.onTelegramAuth
			container.replaceChildren()
		}
	}, [onAuth, botUsername])

	return <div ref={containerRef} className='telegram-login-wrap' />
}
