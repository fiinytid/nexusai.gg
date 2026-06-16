import { ClerkProvider, Show, SignInButton, UserButton } from '@clerk/nextjs'
import type { AppProps } from 'next/app'

function Header() {
  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', padding: 20 }}>
      <h1>My App</h1>
      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton />
      </Show>
    </header>
  )
}

function MyApp({ pageProps, Component }: AppProps) {
  return (
    <ClerkProvider {...pageProps}>
      <Header />
      <Component {...pageProps} />
    </ClerkProvider>
  )
}

export default MyApp