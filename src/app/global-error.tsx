'use client';
import { ErroTela } from '@/components/ErroTela';
import './globals.css';
export default function ErroGeral(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="pt-BR"><body><ErroTela {...props} /></body></html>;
}
