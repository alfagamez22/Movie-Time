import { HomePage } from '@/components/media/home-page';
import { getCatalogSections } from '@/lib/media/catalog';

export default function Page() {
  return <HomePage catalog={getCatalogSections()} />;
}
