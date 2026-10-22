'use client';
import { ErroTela } from '@/components/ErroTela';
export default function Erro(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroTela {...props} />;
}
