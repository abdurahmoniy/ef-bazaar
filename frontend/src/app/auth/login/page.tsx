import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { getMe } from '@/lib/auth'
import { resolveAuthPageUser } from '@/lib/auth-page'
import { resolvePostLoginPath } from '@/lib/safe-redirect'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
	title: 'Kirish',
}

interface LoginPageProps {
	searchParams?: Promise<{ from?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const { from } = (searchParams ? await searchParams : {}) as { from?: string }
	// `from=` bilan kelgan bo'lsa (masalan mail.efbazaar.uz dan) login'dan
	// keyin o'sha yerga qaytamiz — allaqachon login bo'lgan user ham.
	if (await resolveAuthPageUser(getMe)) redirect(resolvePostLoginPath(from))

	const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot'
	const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

	return (
		<Card>
			<CardHeader className='text-center'>
				<CardTitle>Akkountga kirish</CardTitle>
				<CardDescription>
					Telegram yoki Google bilan kiring — birinchi marta kirsangiz avtomatik
					ro'yxatdan o'tasiz.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-6'>
				<LoginForm
					botUsername={botUsername}
					googleClientId={googleClientId}
					from={from}
				/>
			</CardContent>
		</Card>
	)
}
