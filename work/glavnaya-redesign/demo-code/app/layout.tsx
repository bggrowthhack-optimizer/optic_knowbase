import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import '@/styles/globals.css'
import { LayoutShell } from '@/components/layout-shell'
import { AuthProvider } from '@/components/auth-provider'
import { Providers } from '@/components/providers'

// variable + display: 'swap' — шрифт публикуется как CSS-переменная, на которую
// ссылается токен --font-family-sans (styles/design-tokens.css), и текст виден
// сразу, не дожидаясь загрузки файла шрифта.
const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
  variable: '--font-inter',
})

// viewportFit: 'cover' нужен, чтобы работали env(safe-area-inset-*): нижняя панель
// вкладок и полноэкранный чат отступают от индикатора жестов на iPhone.
// Масштабирование намеренно не ограничиваем (maximum-scale / user-scalable):
// запрет зума ломает доступность на телефоне.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Optimizer Optics AI',
  description: 'High-performance CRM dashboard for sales optimization',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Переменная шрифта — на <html>, а не на <body>: --font-family-sans объявлена
  // в :root и ссылается на --font-inter. Пока переменная висела только на body,
  // ссылка в :root не разрешалась — интерфейс и подписи графиков (chart-utils
  // читает токен с :root) уходили в системный шрифт вместо Inter.
  return (
    <html lang="ru" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning={true}>
        <AuthProvider>
          <Providers>
            <LayoutShell>{children}</LayoutShell>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  )
}
