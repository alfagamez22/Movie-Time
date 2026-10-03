import { Directory } from '@/components/dashboard/directory';
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; search?: string }> }) {
  return <Directory kind="users" params={await searchParams} />;
}
