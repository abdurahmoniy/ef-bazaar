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
			<div className='flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-accent px-4 py-3'>
				<div className='flex items-center gap-2 min-w-0'>
					<Check className='h-4 w-4 text-primary shrink-0' />
					<div className='min-w-0'>
						<p className='text-sm font-medium text-primary'>Google ulangan</p>
						{email && (
							<p className='text-xs text-primary/70 truncate'>{email}</p>
						)}
					</div>
				</div>
				{/* <span className='text-[10px] uppercase tracking-wider font-bold text-emerald-300/80'>
					linked
				</span> */}
				<Badge variant='verified'>tasdiqlangan</Badge>
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
