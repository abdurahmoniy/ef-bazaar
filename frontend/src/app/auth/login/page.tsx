import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowUpRight, MessageCircle, Search, Tag } from 'lucide-react'

import { getMe } from '@/lib/auth'
import { resolveAuthPageUser } from '@/lib/auth-page'
import { resolvePostLoginPath } from '@/lib/safe-redirect'
import { telegramAuthErrorMessage } from '@/lib/telegram-auth-error'
import { LoginForm } from './login-form'
import styles from '../auth.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
	title: 'Kirish',
}

interface LoginPageProps {
	searchParams?: Promise<{ from?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
	const { from, error } = (searchParams ? await searchParams : {}) as { from?: string; error?: string }
	// `from=` bilan kelgan bo'lsa (masalan mail.efbazaar.uz dan) login'dan
	// keyin o'sha yerga qaytamiz — allaqachon login bo'lgan user ham.
	if (await resolveAuthPageUser(getMe)) redirect(resolvePostLoginPath(from))

	const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot'
	const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''

	return (
		<div className={styles.loginGrid}>
			<section aria-labelledby='auth-login-title' className={styles.loginPanel}>
				<div className={styles.panelHeading}>
					<h1 id='auth-login-title'>efBazaar’ga kirish</h1>
					<p>{googleClientId ? 'Telegram yoki Google' : 'Telegram'} hisobingizdan foydalaning. Birinchi kirishda profil avtomatik yaratiladi.</p>
				</div>
				<LoginForm
					botUsername={botUsername}
					googleClientId={googleClientId}
					from={from}
					initialError={telegramAuthErrorMessage(error)}
				/>
				<p className={styles.panelHelp}>Kirishda muammo bormi? <Link href='/help'>Yordam olish</Link></p>
			</section>
			<section aria-labelledby='auth-intro-title' className={styles.intro}>
				<h2 id='auth-intro-title'>Keyingi yulduzingiz <span>shu yerda.</span></h2>
				<p>eFootball akkountlarini toping, sotuvchi bilan kelishing va e’lonlaringizni bitta joyda boshqaring.</p>
				<ul className={styles.features}>
					<li><Search aria-hidden='true' /><span>Kerakli o‘yinchi kartalari bo‘yicha qidiring</span></li>
					<li><MessageCircle aria-hidden='true' /><span>Sotuvchi bilan to‘g‘ridan-to‘g‘ri yozishing</span></li>
					<li><Tag aria-hidden='true' /><span>Akkountingizni sotuv yoki obmenga qo‘ying</span></li>
				</ul>
				<Link href='/marketplace' className={styles.browseLink}>Avval bozorni ko‘rib chiqing <ArrowUpRight aria-hidden='true' /></Link>
			</section>
		</div>
	)
}
