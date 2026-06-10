import { redirect } from 'next/navigation'

export default function ChatsIndexPage(): never {
  redirect('/dashboard')
}