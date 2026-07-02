import { ShieldCheck, Trophy, Zap } from 'lucide-react'
import Link from 'next/link'
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
import { RegisterForm } from './register-form'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
	title: "Ro'yxatdan o'tish",
}

const PERKS = [
	{ icon: ShieldCheck, label: 'Xavfsiz savdo' },
	{ icon: Zap, label: 'Tezkor sotuv' },
	{ icon: Trophy, label: 'Pro accountlar' },
]

export default async function RegisterPage() {
	if (await resolveAuthPageUser(getMe)) redirect('/profile')

	const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot'

	return (
		<Card>
			<CardHeader className='text-center'>
				<CardTitle>Ro'yxatdan o'tish</CardTitle>
				<CardDescription>
					Telegram orqali bir bosishda. Email va parol kerak emas.
				</CardDescription>
			</CardHeader>
			<CardContent className='space-y-6'>
				<div className='grid grid-cols-3 gap-2 text-center'>
					{PERKS.map(({ icon: Icon, label }) => (
						<div
							key={label}
							className='rounded-xl border border-border bg-muted/60 p-3'
						>
							<Icon className='h-5 w-5 mx-auto mb-1.5 text-primary' />
							<p className='text-xs text-muted-foreground'>{label}</p>
						</div>
					))}
				</div>

				<RegisterForm botUsername={botUsername} />

				<p className='text-center text-xs text-muted-foreground leading-relaxed'>
					Davom etish orqali Foydalanish shartlari va Maxfiylik siyosatiga
					rozilik bildirasiz.
				</p>

				<p className='text-center text-sm text-muted-foreground'>
					Allaqachon akkountingiz bormi?{' '}
					<Link
						href='/auth/login'
						className='font-semibold text-primary hover:underline'
					>
						Kirish
					</Link>
				</p>
			</CardContent>
		</Card>
	)
}
