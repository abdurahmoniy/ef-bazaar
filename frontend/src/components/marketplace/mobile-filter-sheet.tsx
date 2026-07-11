'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface MobileFilterSheetProps {
	/** Number of filters currently applied — shown as a badge on the trigger. */
	activeCount: number
	children: ReactNode
}

/**
 * Mobile-only "Filtrlar" trigger that opens the filter form in a bottom
 * sheet. The form itself is server-rendered and passed as children, so
 * submitting it is a plain GET navigation that unmounts the sheet.
 */
export function MobileFilterSheet({ activeCount, children }: MobileFilterSheetProps) {
	const [open, setOpen] = useState(false)

	useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false)
		}
		document.addEventListener('keydown', onKeyDown)
		document.body.style.overflow = 'hidden'
		return () => {
			document.removeEventListener('keydown', onKeyDown)
			document.body.style.overflow = ''
		}
	}, [open])

	return (
		<>
			<Button
				type='button'
				variant='outline'
				size='sm'
				onClick={() => setOpen(true)}
				className='shrink-0 rounded-full'
				aria-haspopup='dialog'
				aria-expanded={open}
			>
				<SlidersHorizontal className='h-4 w-4 text-primary' />
				Filtrlar
				{activeCount > 0 && (
					<span className='grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground'>
						{activeCount}
					</span>
				)}
			</Button>

			{open && (
				<div className='fixed inset-0 z-50 lg:hidden'>
					<button
						type='button'
						aria-label='Yopish'
						onClick={() => setOpen(false)}
						className='absolute inset-0 cursor-default bg-black/50'
					/>
					<div
						role='dialog'
						aria-modal='true'
						aria-label='Filtrlar'
						className='absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-card shadow-2xl'
					>
						<div className='flex items-center justify-between border-b border-border px-4 py-3'>
							<span className='flex items-center gap-2 text-sm font-bold text-foreground'>
								<SlidersHorizontal className='h-4 w-4 text-primary' />
								Filtrlar
							</span>
							<button
								type='button'
								onClick={() => setOpen(false)}
								aria-label='Yopish'
								className='grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground'
							>
								<X className='h-4 w-4' />
							</button>
						</div>
						<div className='overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]'>
							{children}
						</div>
					</div>
				</div>
			)}
		</>
	)
}
