'use client'

import { AlertCircle, Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { linkGoogleAction } from '@/app/auth/actions'
import { GoogleButton } from '@/components/auth/google-button'
import { Badge } from '../ui/badge'

interface GoogleLinkButtonProps {
	googleClientId: string
	alreadyLinked: boolean
	email?: string | null
}

export function GoogleLinkButton({
	googleClientId,
	alreadyLinked,
	email,
}: GoogleLinkButtonProps) {
	const router = useRouter()
	const [error, setError] = React.useState<string | null>(null)
	const [pending, setPending] = React.useState(false)

	const onCredential = React.useCallback(
		async (idToken: string) => {
			setError(null)
			setPending(true)
			const res = await linkGoogleAction(idToken)
			setPending(false)
			if (!res.ok) {
				setError(res.error ?? 'Google ulanmadi')
			} else {
				router.refresh()
			}
		},
		[router],
	)
	if (alreadyLinked) {
		return (
			<div className='flex flex-col items-start gap-3 rounded-xl sm:flex-row sm:items-center sm:justify-between border border-border/80 bg-muted/30 px-4 py-3 min-w-0'>
				<div className='flex items-center gap-2.5 min-w-0 w-full flex-1'>
					<div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
						<Check className='h-4 w-4' />
					</div>
					<div className='min-w-0 w-full flex-1'>
						<p className='text-sm font-semibold text-foreground'>Google ulangan</p>
						{email && (
							<p className='text-xs text-muted-foreground break-all'>{email}</p>
						)}
					</div>
				</div>
				<span className='inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success border border-success-border shrink-0'>
					<Check className="h-3 w-3" />
					Tasdiqlangan
				</span>
			</div>
		)
	}

	if (!googleClientId) {
		return (
			<p className='text-xs text-muted-foreground italic'>
				Google OAuth hali sozlanmagan (NEXT_PUBLIC_GOOGLE_CLIENT_ID yo'q).
			</p>
		)
	}

	return (
		<div className='space-y-3'>
			{error && (
				<div className='flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive'>
					<AlertCircle className='h-4 w-4 mt-0.5 shrink-0' />
					<span>{error}</span>
				</div>
			)}
			<GoogleButton
				clientId={googleClientId}
				onCredential={onCredential}
				label='Google bilan tasdiqlash'
				disabled={pending}
			/>
			<p className='text-xs text-muted-foreground'>
				Verified badge olish uchun Google akkountingizni ulang. Email ham
				olinadi.
			</p>
		</div>
	)
}
